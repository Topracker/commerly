-- ============================================================================
-- 2026-09-13 — Cancelamento de pedido pago online com estorno (achado V1)
-- ----------------------------------------------------------------------------
-- Auditoria 2026-09-11, achado V1: a loja cancelava pedido PAGO ONLINE com um
-- `update({ status: 'cancelado' })` direto pela chave anon, sem estorno — o
-- único estorno do sistema era a rota do cliente (/api/cliente/cancelar-pedido).
--
-- Três coisas nesta migração:
--   1. `pagamento_status` passa a aceitar 'estornado' + colunas de liquidação
--      (`estornado_em`, `stripe_refund_id`) gravadas pelas rotas de estorno.
--   2. GUARD: pedido pago online NÃO pode ir para 'cancelado' pela role
--      `authenticated` (chave anon). Só `service_role` — ou seja, só as rotas
--      /api/loja/cancelar-pedido e /api/cliente/cancelar-pedido, que estornam
--      ANTES de cancelar. Pedido não pago continua cancelável como sempre.
--   3. Guard recriado a partir do CORPO VIVO puxado do banco em 2026-09-13
--      (md5 anterior a4aee958c5a21bd84ed78beb1b79a4f1 — o mesmo deixado pelo
--      V2). A única mudança é o bloco marcado "V1" no ramo UPDATE.
--
-- STATUS: aplicado em produção via MCP em 2026-09-13 (após teste em bloco
-- DO ... ROLLBACK com md5 do corpo original conferido).
-- ============================================================================

-- ── 1. Colunas e CHECK ──────────────────────────────────────────────────────
-- Regra 3 do CLAUDE.md: ADD COLUMN IF NOT EXISTS, nunca CREATE TABLE IF NOT EXISTS.
alter table public.pedidos_clientes add column if not exists estornado_em timestamptz;
alter table public.pedidos_clientes add column if not exists stripe_refund_id text;

alter table public.pedidos_clientes drop constraint if exists pedidos_clientes_pagamento_status_check;
alter table public.pedidos_clientes add constraint pedidos_clientes_pagamento_status_check
  check (pagamento_status = any (array['pendente'::text, 'pago'::text, 'estornado'::text]));

-- ── 2+3. Guard ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pedidos_clientes_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  loja_lat double precision; loja_lng double precision; max_dist numeric;
  loja_tempo int; loja_dinamico boolean; loja_drone boolean;
  dist numeric; subtotal numeric; desconto_pts numeric; saldo_atual integer;
  abertos int; fator numeric; fator_real numeric; peso numeric; eta_min int;
  ent_veiculo text; ordem_old int; ordem_new int;
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido'; new.entregador_id := null;
    new.codigo_confirmacao := null; new.pagamento_corrida := 'pendente';
    new.created_at := now(); new.updated_at := now();
    new.garantia_cupom_id := null;
    new.entrega_drone := false;

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
    new.preco_dinamico_fator := fator;

    -- ── Preço AUTORITATIVO ────────────────────────────────────────────────
    -- Sai SEMPRE de produtos.preco_venda (join restrito à própria loja) com a
    -- promoção ativa quando houver. O `preco` do corpo da requisição é
    -- descartado — a validação acima garante que todo item tem produto.
    with linhas as (
      select e,
             (e->>'quantidade')::numeric as qtd,
             nullif(e->>'produto_id', '')::uuid as pid
        from jsonb_array_elements(new.itens) e
    ),
    resolvidas as (
      select l.e, l.qtd,
             public.preco_efetivo(p.id, new.loja_id, p.preco_venda) as base,
             coalesce(p.peso_kg, 0) as peso_unit
        from linhas l
        join public.produtos p on p.id = l.pid and p.loja_id = new.loja_id
    )
    select
      coalesce(jsonb_agg(r.e
        || jsonb_build_object('preco', round(r.base * fator, 2))
        || jsonb_build_object('preco_base', r.base)), '[]'::jsonb),
      coalesce(sum(round(r.base * fator, 2) * r.qtd), 0),
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
      if auth.role() = 'service_role' and nullif(new.stripe_session_id, '') is not null then
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
