-- ============================================================================
-- GUARD DE PEDIDOS: pedido PAGO leva o SUBTOTAL que a Stripe cobrou
-- (auditoria 2026-09-11, achado V2b — straddle do preço dinâmico)
-- ----------------------------------------------------------------------------
-- O V2 (2026-09-11) resolveu a TAXA de entrega do pedido pago online. O
-- subtotal ficou de fora e sofre do mesmo straddle, agora pelo fator de preço
-- dinâmico:
--
--   Loja com `preco_dinamico` ligado. Checkout às 21:55 → o servidor cobra os
--   itens com fator 1,10 e manda `fator_exibido = 1,10`. O QR do Pix vale 30
--   min; o cliente paga às 22:03. O webhook insere o pedido e o guard
--   recalcula com `now()` = 22:03: `fator_real = 1,0`, `least(1,0 , 1,10) =
--   1,0` → `itens[].preco`, `subtotal` e `total` gravados 10% ABAIXO do que
--   foi cobrado e do que foi transferido para a conta Connect da loja.
--
-- A direção oposta (checkout 17:55, pago 18:05) já era segura: o teto
-- `fator_exibido` impede o guard de subir o preço depois da tela.
--
-- O mesmo bloco tem um segundo straddle, da mesma família e independente do
-- preço dinâmico: se a loja EDITAR `preco_venda` ou uma PROMOÇÃO EXPIRAR
-- durante os 30 min do Pix, `preco_efetivo()` devolve uma base diferente da
-- cobrada e o subtotal diverge de novo. Corrigir só o fator deixaria esse
-- caso vivo — por isso a correção é no `preco` do item, não no fator.
--
-- Efeito colateral relevante: `pontos_do_pedido(new.itens)` soma
-- `preco × quantidade`, então no straddle o cliente pagava ×1,10 e acumulava
-- pontos do Clube sobre ×1,00. Corrigido junto, sem mexer no trigger de pontos.
--
-- ----------------------------------------------------------------------------
-- MUDANÇAS (todas dentro do ramo INSERT):
--
--  1. Variável `pago_online` := `auth.role() = 'service_role'` E
--     `stripe_session_id` não vazio. É EXATAMENTE a condição que o bloco da
--     taxa (V2) já usava inline; agora ela tem um nome só e os dois blocos
--     leem o mesmo valor, para não divergirem numa recriação futura.
--
--  2. Bloco "Preço AUTORITATIVO": quando `pago_online`, o `preco` de cada item
--     vem do payload (= `pedidos_pendentes.itens`, montado pelo servidor no
--     checkout a partir de `produtos` + promoção + fator do momento da
--     cobrança). `preco_base` e `peso` continuam saindo de `produtos`.
--     Fallback para o cálculo de sempre se o `preco` do payload não for um
--     número JSON positivo — o pior caso é o comportamento de hoje, nunca um
--     pedido pago que falha ao nascer (500 no webhook = Stripe retentando com
--     o dinheiro retido).
--
--  3. `preco_dinamico_fator`: quando `pago_online` e o insert traz um fator
--     >= 1 (novo: o webhook repassa `pedidos_pendentes.preco_dinamico_fator`),
--     mantém o fator COBRADO em vez do recalculado. Derivar o fator de
--     `subtotal / subtotal_base` daria lixo justamente quando a base mudou.
--
-- NÃO muda: pedido pago NA ENTREGA (insert do cliente, `authenticated`) — o
-- guard segue sendo a autoridade de preço. Modo Festa insere com service_role
-- mas SEM `stripe_session_id`, então `pago_online` é false e o caminho da
-- festa fica idêntico. As validações anti-adulteração (item tem `produto_id`
-- DESTA loja; `quantidade` inteira de 1 a 500) continuam rodando em todos os
-- caminhos, inclusive no pago.
--
-- Corpo abaixo = corpo VIVO lido do banco em 2026-09-14 (md5
-- 669d6b7eb4dec6c5bd337fcb7400a444, o do V1) + as 3 mudanças acima (regra 5).
-- Validado em bloco DO com `set_config('request.jwt.claims', …)` terminando em
-- exceção (rollback) antes de aplicar, como o V2.
--
-- APLICADO em produção em 2026-09-14 via MCP do Supabase.
-- ============================================================================

-- O fator efetivamente COBRADO precisa sobreviver à ida ao Stripe, junto com
-- `fator_exibido` (que é o TETO, não o cobrado). ADD COLUMN IF NOT EXISTS
-- porque `create table if not exists` não adiciona coluna em tabela existente.
alter table public.pedidos_pendentes
  add column if not exists preco_dinamico_fator numeric;

create or replace function public.pedidos_clientes_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  loja_lat double precision; loja_lng double precision; max_dist numeric;
  loja_tempo int; loja_dinamico boolean; loja_drone boolean;
  dist numeric; subtotal numeric; desconto_pts numeric; saldo_atual integer;
  abertos int; fator numeric; fator_real numeric; peso numeric; eta_min int;
  ent_veiculo text; ordem_old int; ordem_new int;
  pago_online boolean;
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido'; new.entregador_id := null;
    new.codigo_confirmacao := null; new.pagamento_corrida := 'pendente';
    new.created_at := now(); new.updated_at := now();
    new.garantia_cupom_id := null;
    new.entrega_drone := false;

    -- ── Pedido JÁ PAGO (webhook da Stripe) ────────────────────────────────
    -- service_role + stripe_session_id = o pedido vem de `pedidos_pendentes`,
    -- depois de o cliente ter pago. Para ele, a fonte da verdade é o que foi
    -- COBRADO, não o que o guard recalcularia com now(). Um cliente inserindo
    -- pela chave anon tem role 'authenticated' e nunca cai aqui.
    pago_online := (auth.role() = 'service_role'
                    and nullif(new.stripe_session_id, '') is not null);

    select latitude, longitude, distancia_maxima_entrega, tempo_preparo_min,
           coalesce(preco_dinamico, false), coalesce(aceita_drone, false)
      into loja_lat, loja_lng, max_dist, loja_tempo, loja_dinamico, loja_drone
      from public.lojas where id = new.loja_id;

    new.tempo_preparo_min := coalesce(new.tempo_preparo_min, loja_tempo, 30);

    -- ── Itens: nada de carrinho vazio, item fantasma ou quantidade torta ────
    if jsonb_typeof(coalesce(new.itens, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(new.itens, '[]'::jsonb)) = 0 then
      raise exception 'Pedido sem itens.' using errcode = 'P0001';
    end if;

    -- Quantidade: inteiro, positivo e com teto são. Vem antes do produto para
    -- que o erro devolvido seja o mais específico.
    if exists (
      select 1 from jsonb_array_elements(new.itens) e
       where e->>'quantidade' is null
          or (e->>'quantidade') !~ '^[0-9]+$'
          or (e->>'quantidade')::numeric <= 0
          or (e->>'quantidade')::numeric > 500
    ) then
      raise exception 'Quantidade invalida no pedido (use inteiros de 1 a 500).' using errcode = 'P0001';
    end if;

    -- Produto: obrigatório e DESTA loja. Sem isto o preço do item cai para o
    -- que o cliente mandou no corpo da requisição.
    if exists (
      select 1
        from jsonb_array_elements(new.itens) e
        left join public.produtos p
               on p.id = nullif(e->>'produto_id', '')::uuid
              and p.loja_id = new.loja_id
       where p.id is null
    ) then
      raise exception 'Item invalido no pedido: produto inexistente nesta loja.' using errcode = 'P0001';
    end if;

    -- ── Fator de preço dinâmico ───────────────────────────────────────────
    -- Numa festa o carrinho já foi precificado (sem fator) e mostrado a todos
    -- os participantes; aplicar fator aqui mudaria o rateio depois do combinado.
    fator_real := 1.0;
    if loja_dinamico and new.festa_id is null then
      select count(*) into abertos
        from public.pedidos_clientes
        where loja_id = new.loja_id and status in ('recebido','preparando');
      if public.eh_horario_pico(now()) then fator_real := fator_real + 0.10; end if;
      if abertos >= 5                 then fator_real := fator_real + 0.05; end if;
    end if;

    -- O fator exibido na vitrine é TETO do cobrado: nada sobe entre a tela e
    -- o checkout.
    if new.fator_exibido is not null and new.fator_exibido >= 1.0 then
      fator := least(fator_real, new.fator_exibido);
    else
      fator := fator_real;
    end if;

    -- Pedido pago: registra o fator que foi COBRADO (vem do pendente), não o
    -- recalculado com now() — que no straddle das 22h volta a 1,0 (V2b).
    new.preco_dinamico_fator := case
      when pago_online and coalesce(new.preco_dinamico_fator, 0) >= 1.0
        then new.preco_dinamico_fator
      else fator
    end;

    -- ── Preço AUTORITATIVO ────────────────────────────────────────────────
    -- Sai SEMPRE de produtos.preco_venda (join restrito à própria loja) com a
    -- promoção ativa quando houver. O `preco` do corpo da requisição é
    -- descartado — a validação acima garante que todo item tem produto.
    --
    -- EXCEÇÃO (V2b): pedido já PAGO. O `preco` do payload é o que a Stripe
    -- cobrou e transferiu; recalcular aqui grava um valor diferente do pago
    -- sempre que o Pix cruza 18h/22h, ou que o preço/promoção mudou durante
    -- os 30 min do QR. `preco_base` e `peso` continuam vindo de `produtos`.
    with linhas as (
      select e,
             (e->>'quantidade')::numeric as qtd,
             nullif(e->>'produto_id', '')::uuid as pid
        from jsonb_array_elements(new.itens) e
    ),
    resolvidas as (
      select l.e, l.qtd,
             public.preco_efetivo(p.id, new.loja_id, p.preco_venda) as base,
             coalesce(p.peso_kg, 0) as peso_unit,
             -- `jsonb_typeof = 'number'` antes do cast: payload torto cai no
             -- fallback em vez de estourar a transação do webhook.
             case
               when pago_online
                    and jsonb_typeof(l.e->'preco') = 'number'
                    and (l.e->>'preco')::numeric > 0
                 then round((l.e->>'preco')::numeric, 2)
             end as preco_cobrado
        from linhas l
        join public.produtos p on p.id = l.pid and p.loja_id = new.loja_id
    )
    select
      coalesce(jsonb_agg(r.e
        || jsonb_build_object('preco', coalesce(r.preco_cobrado, round(r.base * fator, 2)))
        || jsonb_build_object('preco_base', r.base)), '[]'::jsonb),
      coalesce(sum(coalesce(r.preco_cobrado, round(r.base * fator, 2)) * r.qtd), 0),
      coalesce(sum(r.peso_unit * r.qtd), 0)
      into new.itens, subtotal, peso
      from resolvidas r;

    new.peso_total_kg := peso;

    dist := public.haversine_km(loja_lat, loja_lng, new.entrega_latitude, new.entrega_longitude);
    new.distancia_km := dist;

    -- ── FESTA: taxa rateada e bônus já calculados pelo servidor ───────────
    -- /api/festa/fechar soma as pernas loja→endereço, divide pelos
    -- participantes e soma o bônus do entregador. O guard confia nesses dois
    -- valores e pula a checagem de área (o endereço único já foi validado no
    -- fechamento). Pontos não valem em festa.
    if new.festa_id is not null then
      new.taxa_entrega := coalesce(new.taxa_entrega, 0);
      new.valor_corrida := coalesce(new.valor_corrida, new.taxa_entrega);
      new.desconto_pontos := 0;
      new.pontos_usados := 0;
      new.total := subtotal + new.taxa_entrega;
    else
      -- ── Taxa de entrega ─────────────────────────────────────────────────
      -- Pedido PAGO ONLINE (webhook da Stripe, service_role, com
      -- stripe_session_id): a taxa é a que foi COBRADA do cliente — vem do
      -- pedido pendente montado pelo servidor no checkout, já com o surge de
      -- pico do momento da cobrança. Recalcular aqui com now() gravava um
      -- valor diferente do pago (auditoria 2026-09-11, V2).
      -- Pedido NA ENTREGA (insert do cliente): nada foi cobrado ainda, o
      -- guard é a autoridade — distância + surge de pico, como sempre.
      if pago_online then
        new.taxa_entrega := round(coalesce(new.taxa_entrega, public.calcular_taxa_entrega(dist)), 2);
      else
        new.taxa_entrega := public.calcular_taxa_entrega(dist);
        if public.eh_horario_pico(now()) then
          new.taxa_entrega := round(new.taxa_entrega * 1.3, 2);
        end if;
      end if;
      new.valor_corrida := new.taxa_entrega;

      if dist is not null and max_dist is not null and dist > max_dist then
        raise exception 'Endereco fora da area de entrega. Esta loja entrega ate % km.', max_dist using errcode = 'P0001';
      end if;

      if coalesce(new.pontos_usados, 0) > 0 then
        select coalesce(sum(pontos), 0) into saldo_atual
          from public.pontos_clientes where cliente_id = new.cliente_id;
        if saldo_atual < new.pontos_usados then raise exception 'Saldo de pontos insuficiente.' using errcode = 'P0001'; end if;
        if (new.pontos_usados % 100) <> 0 then raise exception 'Use multiplos de 100 pontos.' using errcode = 'P0001'; end if;
        desconto_pts := (new.pontos_usados / 100.0) * 5.0;
        if desconto_pts > subtotal then desconto_pts := subtotal; end if;
        new.desconto_pontos := desconto_pts;
      else new.desconto_pontos := 0; end if;

      new.total := subtotal + new.taxa_entrega - coalesce(new.desconto_pontos, 0);
    end if;

    -- Prazo prometido (preparo + ~5 min por km). Base da Commerly Garantia.
    eta_min := new.tempo_preparo_min + ceil(coalesce(dist, 0) * 5)::int;
    new.eta_em := now() + make_interval(mins => eta_min);

    -- MODO INVISÍVEL: os dados do cliente nem chegam a ser gravados.
    if coalesce(new.anonimo, false) then
      new.cliente_nome := null;
      new.cliente_telefone := null;
    end if;

  elsif tg_op = 'UPDATE' then
    -- Campos que ninguém edita depois do INSERT.
    new.loja_id := old.loja_id; new.cliente_id := old.cliente_id; new.itens := old.itens;
    new.total := old.total; new.taxa_entrega := old.taxa_entrega; new.valor_corrida := old.valor_corrida;
    new.distancia_km := old.distancia_km; new.entrega_latitude := old.entrega_latitude; new.entrega_longitude := old.entrega_longitude;
    new.endereco_entrega := old.endereco_entrega; new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome; new.cliente_telefone := old.cliente_telefone;
    new.pontos_usados := old.pontos_usados; new.desconto_pontos := old.desconto_pontos;
    new.created_at := old.created_at; new.updated_at := now();
    new.stripe_session_id := old.stripe_session_id; new.stripe_payment_intent := old.stripe_payment_intent;
    new.festa_id := old.festa_id;
    new.pagamento_metodo := old.pagamento_metodo;

    new.anonimo := old.anonimo;
    new.eta_em := old.eta_em;
    new.preco_dinamico_fator := old.preco_dinamico_fator;
    new.fator_exibido := old.fator_exibido;
    new.peso_total_kg := old.peso_total_kg;

    if old.garantia_cupom_id is not null then
      new.garantia_cupom_id := old.garantia_cupom_id;
    end if;

    -- ── V1: PEDIDO PAGO ONLINE SÓ CANCELA COM ESTORNO ─────────────────────
    -- (auditoria 2026-09-11) A loja cancelava pela chave anon e o dinheiro
    -- ficava com ela. Cancelamento de pedido pago online só entra via
    -- service_role — as rotas /api/loja/cancelar-pedido e
    -- /api/cliente/cancelar-pedido, que fazem o refund na Stripe ANTES do
    -- UPDATE. Pedido não pago (na entrega, ou online ainda pendente) continua
    -- cancelável como sempre.
    if new.status = 'cancelado' and old.status <> 'cancelado'
       and old.pagamento_metodo = 'online' and old.pagamento_status = 'pago'
       and auth.role() = 'authenticated' then
      raise exception 'Pedido pago online: cancele pelo painel para o cliente ser estornado.'
        using errcode = 'P0001';
    end if;

    -- ── LOCK DE ESTADO TERMINAL ──────────────────────────────────────────
    -- Entregue (código confirmado) ou cancelado: o pedido está fechado. Só
    -- continuam editáveis os campos de LIQUIDAÇÃO, que por definição chegam
    -- depois: repasse da corrida, estorno e o cupom da Garantia.
    if old.status in ('entregue', 'cancelado') then
      new.status := old.status;
      new.entregador_id := old.entregador_id;
      new.codigo_confirmacao := old.codigo_confirmacao;
      new.lote_entrega_id := old.lote_entrega_id;
      new.ordem_coleta := old.ordem_coleta;
      new.ordem_entrega := old.ordem_entrega;
      new.entrega_drone := old.entrega_drone;
      return new;
    end if;

    -- Status só anda para a FRENTE (ou para 'cancelado').
    if new.status is distinct from old.status and new.status <> 'cancelado' then
      ordem_old := array_position(array['recebido','preparando','saiu','entregue'], old.status);
      ordem_new := array_position(array['recebido','preparando','saiu','entregue'], new.status);
      if ordem_old is null or ordem_new is null or ordem_new < ordem_old then
        raise exception 'Transicao de status invalida: % -> %.', old.status, new.status using errcode = 'P0001';
      end if;
    end if;

    -- Pagamento do pedido: só avança pendente -> pago (ou estorno explícito).
    if new.pagamento_status is distinct from old.pagamento_status
       and old.pagamento_status = 'pago' and new.pagamento_status = 'pendente' then
      new.pagamento_status := old.pagamento_status;
    end if;

    -- Drone: derivado do veículo do entregador que aceitou.
    if new.entregador_id is not null then
      select veiculo_tipo into ent_veiculo from public.entregadores where id = new.entregador_id;
      new.entrega_drone := (ent_veiculo = 'drone');

      if new.entrega_drone and (old.entregador_id is null or old.entregador_id <> new.entregador_id) then
        select coalesce(aceita_drone, false) into loja_drone from public.lojas where id = new.loja_id;
        if not loja_drone then
          raise exception 'Esta loja nao aceita entrega por drone.' using errcode = 'P0001';
        end if;
        if old.distancia_km is null or old.distancia_km > 5 then
          raise exception 'Drone entrega ate 5 km (distancia: % km).', coalesce(old.distancia_km, -1) using errcode = 'P0001';
        end if;
        if old.peso_total_kg > 2 then
          raise exception 'Drone leva ate 2 kg (pedido: % kg).', old.peso_total_kg using errcode = 'P0001';
        end if;
        if not public.eh_horario_diurno(now()) then
          raise exception 'Drone so opera das 6h as 18h.' using errcode = 'P0001';
        end if;
      end if;
    else
      new.entrega_drone := false;
    end if;

    -- Código de confirmação nasce quando o pedido sai para entrega e nunca muda.
    -- COLUNA LEGADA: nao e mais populada. O codigo de confirmacao vive em
    -- public.pedido_codigos, fora do alcance do entregador (auditoria 2026-09-11).
    new.codigo_confirmacao := null;
  end if;
  return new;
end;
$function$;

-- Conferência (deve conter 'pago_online' e 'preco_cobrado'):
-- select pg_get_functiondef('public.pedidos_clientes_guard'::regproc);
