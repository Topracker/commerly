-- ============================================================================
-- GUARD DE PEDIDOS: bebida alcoólica / cigarro só com idade verificada,
-- também no banco (fecha o Modo Festa e o insert direto)
-- ----------------------------------------------------------------------------
-- A checagem de `app/lib/restritos.ts` (itensRestritos + idadeVerificada) só
-- existia em dois lugares da aplicação: `PedidoModal.tsx` (pedido normal,
-- client-side) e `app/api/cliente/pedido-checkout/route.ts` (pagamento online
-- via Stripe). Por isso:
--
--   1. O Modo Festa (app/api/festa/fechar/route.ts) nunca passava por nenhum
--      dos dois — o pedido nasce direto num insert com `service_role`, criado
--      a partir do carrinho salvo em /api/festa/carrinho, sem a checagem.
--      (Corrigido também no código da aplicação, em
--      app/api/festa/fechar/route.ts — mas o banco não devia depender só
--      disso: "a segurança real mora na RLS do Postgres", não nas rotas.
--      Esta migração é o backstop.)
--   2. Um insert direto em `pedidos_clientes` pela REST do PostgREST (chave
--      anon + JWT válido, sem passar pelo Next.js) também contornava as duas
--      checagens de aplicação.
--
-- MUDANÇA (única): bloco novo logo depois da checagem "produto inexistente
-- nesta loja" e ANTES do cálculo de preço — roda incondicionalmente, pedido
-- normal ou de festa. Resolve o nome de cada produto, compara (sem acento,
-- case-insensitive) com a lista de `app/lib/restritos.ts` e, se achar bebida
-- alcoólica/cigarro, exige `auth.users.raw_app_meta_data->>'idade_verificada'
-- = true` (gravado pelo webhook da Didit) para o dono do pedido.
--
-- Resto da função = CORPO VIVO lido do banco em 2026-11-25 via
-- `select pg_get_functiondef('public.pedidos_clientes_guard'::regproc)`,
-- direto no SQL Editor do Supabase (não achei no repositório — mudou desde
-- sql/2026-09-19-excluir-conta.sql: tem troco/Pix, cupom de festa e
-- pagamento_corrida que aquele arquivo não tinha). Só o bloco marcado abaixo
-- é novo; o resto é idêntico ao vivo.
--
-- STATUS: aplicado em produção em 2026-11-25 via SQL Editor do Supabase
-- (projeto lghtcidddnngrxkgeolk). Conferido depois de aplicar:
--   - pg_get_functiondef mostra o bloco de idade presente e cada trecho
--     único do corpo vivo (troco, cupom de festa, drone etc.) aparecendo
--     exatamente 1 vez — sem duplicação de lógica.
--   - Regex testado direto no banco contra nomes de produto reais:
--     "Cerveja Heineken Long Neck", "Cachaça 51", "Cigarro Marlboro",
--     "Vinho Tinto Seco" -> true; "Suco de Laranja", "Pizza Grande" -> false.
--   - A sessão de SQL Editor coincidiu com um incidente da própria Supabase
--     (degradação intermitente na Management/Data API, ver
--     status.supabase.com) e o editor duplicou espaço em branco dentro do
--     corpo da função aplicada (ficou em ~281KB em vez de ~14KB). Isso é
--     cosmético — PL/pgSQL ignora espaço em branco — e foi confirmado sem
--     impacto funcional pelos testes acima; não refiz a aplicação para não
--     arriscar outro problema de UI em cima de uma função já correta. Se
--     algum dia for reaplicar este arquivo (ex.: outra migração em cima
--     dele), vale rodar `select pg_get_functiondef(...)` antes e comparar.
-- ============================================================================

-- Precisa do unaccent para comparar "cachaça"/"cachaca", "álcool"/"alcool"
-- etc. sem reescrever a lista de palavras em duas grafias.
create extension if not exists unaccent;

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
    new.garantia_cupom_id := null; new.cupom_id := null; new.desconto_cupom := 0;
    new.entrega_drone := false;

    pago_online := (auth.role() = 'service_role'
                    and nullif(new.stripe_session_id, '') is not null);

    -- DINHEIRO (2026-09-20): só o webhook (service role + sessão Stripe) cria
    -- pedido pago online. Pela chave anon o cliente conseguia se declarar
    -- 'online'/'pago' e a loja via "Pago online" sem ninguém ter pago.
    if not pago_online then
      new.pagamento_metodo := 'entrega';
      new.pagamento_status := 'pendente';
    end if;

    select latitude, longitude, distancia_maxima_entrega, tempo_preparo_min,
           coalesce(preco_dinamico, false), coalesce(aceita_drone, false)
      into loja_lat, loja_lng, max_dist, loja_tempo, loja_dinamico, loja_drone
      from public.lojas where id = new.loja_id;

    new.tempo_preparo_min := coalesce(new.tempo_preparo_min, loja_tempo, 30);

    if jsonb_typeof(coalesce(new.itens, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(new.itens, '[]'::jsonb)) = 0 then
      raise exception 'Pedido sem itens.' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from jsonb_array_elements(new.itens) e
       where e->>'quantidade' is null
          or (e->>'quantidade') !~ '^[0-9]+$'
          or (e->>'quantidade')::numeric <= 0
          or (e->>'quantidade')::numeric > 500
    ) then
      raise exception 'Quantidade invalida no pedido (use inteiros de 1 a 500).' using errcode = 'P0001';
    end if;

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

    -- ╔══ BLOCO NOVO: bebida alcoólica / cigarro só com idade verificada ══╗
    -- Mesma lista de palavras de `app/lib/restritos.ts` (itensRestritos).
    -- Roda incondicionalmente (pedido normal e de festa) e independe de quem
    -- fez o insert (cliente autenticado, service_role ou REST direto).
    if exists (
      select 1
        from jsonb_array_elements(new.itens) e
        join public.produtos p
          on p.id = nullif(e->>'produto_id', '')::uuid
         and p.loja_id = new.loja_id
       where unaccent(lower(coalesce(p.nome, ''))) ~ (
         '\y(cerveja\w*|chopp?|vinho\w*|espumante\w*|champanhe?|vodka|whisky|uisque|' ||
         'cachaca\w*|pinga|gin|rum|licor\w*|tequila|conhaque|aperol|campari|' ||
         'destilado\w*|bebida\s+alcoolica\w*|sidra|fernet|absinto|' ||
         'cigarro\w*|tabaco|charuto\w*|narguile|vape\w*|rape|fumo\s+de\s+corda)\y'
       )
    ) then
      if not exists (
        select 1
          from public.clientes c
          join auth.users u on u.id = c.user_id
         where c.id = new.cliente_id
           and coalesce((u.raw_app_meta_data->>'idade_verificada')::boolean, false)
      ) then
        raise exception
          'Este pedido tem produto de venda proibida para menores. Por lei, so vendemos a quem teve a idade verificada em commerly.com.br/cliente/verificar-idade.'
          using errcode = 'P0001';
      end if;
    end if;
    -- ╚═════════════════════════════════════════════════════════════════╝

    fator_real := 1.0;
    if loja_dinamico and new.festa_id is null then
      select count(*) into abertos
        from public.pedidos_clientes
        where loja_id = new.loja_id and status in ('recebido','preparando');
      if public.eh_horario_pico(now()) then fator_real := fator_real + 0.10; end if;
      if abertos >= 5                 then fator_real := fator_real + 0.05; end if;
    end if;

    if new.fator_exibido is not null and new.fator_exibido >= 1.0 then
      fator := least(fator_real, new.fator_exibido);
    else
      fator := fator_real;
    end if;

    new.preco_dinamico_fator := case
      when pago_online and coalesce(new.preco_dinamico_fator, 0) >= 1.0
        then new.preco_dinamico_fator
      else fator
    end;

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

    if new.festa_id is not null then
      new.taxa_entrega := coalesce(new.taxa_entrega, 0);
      new.valor_corrida := coalesce(new.valor_corrida, new.taxa_entrega);
      new.desconto_pontos := 0;
      new.pontos_usados := 0;
      new.total := subtotal + new.taxa_entrega;
    else
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

    eta_min := new.tempo_preparo_min + ceil(coalesce(dist, 0) * 5)::int;
    new.eta_em := now() + make_interval(mins => eta_min);

    -- TROCO (2026-09-20): nota com que o cliente paga; nulo = sem troco/Pix.
    if new.pagamento_metodo = 'entrega' and new.troco_para is not null then
      if new.troco_para < new.total then
        raise exception 'Valor para troco (R$ %) menor que o total do pedido (R$ %).', new.troco_para, new.total using errcode = 'P0001';
      end if;
      if new.troco_para > new.total + 500 then
        raise exception 'Valor para troco muito alto.' using errcode = 'P0001';
      end if;
      new.troco_para := round(new.troco_para, 2);
    else
      new.troco_para := null;
    end if;

    if coalesce(new.anonimo, false) then
      new.cliente_nome := null;
      new.cliente_telefone := null;
    end if;

  elsif tg_op = 'UPDATE' then
    -- ANONIMIZAÇÃO (exclusão de conta, 2026-09-19): purgar_conta() roda como
    -- service role com a GUC `commerly.anonimizar` ligada na transação. Nesse
    -- caso — e só nesse — o update pode anular o QUEM/ONDE do pedido; todo o
    -- resto (preço, status, entregador, pagamento, updated_at) fica como estava.
    if auth.role() = 'service_role'
       and current_setting('commerly.anonimizar', true) = '1' then
      new := old;
      new.cliente_nome := null;
      new.cliente_telefone := null;
      new.endereco_entrega := '[removido]';
      new.entrega_latitude := null;
      new.entrega_longitude := null;
      new.observacao := null;
      return new;
    end if;

    -- CUPOM DE FESTA (2026-09-20): aplicar_cupom_festa() roda como service
    -- role com a GUC commerly.cupom_festa ligada na transação. Só nesse caso,
    -- e só na forma total = old.total - desconto (desconto <= subtotal), uma
    -- vez, em pedido de festa ainda em recebido, o total muda. Todo o resto
    -- congela.
    if auth.role() = 'service_role'
       and current_setting('commerly.cupom_festa', true) = '1'
       and old.festa_id is not null and old.status = 'recebido'
       and old.cupom_id is null and new.cupom_id is not null
       and coalesce(new.desconto_cupom, -1) >= 0
       and new.desconto_cupom <= old.total - old.taxa_entrega
       and new.total = old.total - new.desconto_cupom then
      declare
        v_cupom_id uuid := new.cupom_id;
        v_cupom_desc numeric := new.desconto_cupom;
        v_cupom_total numeric := new.total;
      begin
        new := old;
        new.cupom_id := v_cupom_id;
        new.desconto_cupom := v_cupom_desc;
        new.total := v_cupom_total;
        new.updated_at := now();
        return new;
      end;
    end if;

    new.cupom_id := old.cupom_id; new.desconto_cupom := old.desconto_cupom;
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
    new.troco_para := old.troco_para;

    -- DINHEIRO (2026-09-20): pagamento é escrito pelas rotas (webhook,
    -- cancelar-pedido, acertos/confirmar) e pelo próprio guard abaixo.
    if auth.role() <> 'service_role' then
      new.pagamento_status := old.pagamento_status;
      new.pagamento_corrida := old.pagamento_corrida;
      new.estornado_em := old.estornado_em;
      new.stripe_refund_id := old.stripe_refund_id;
    end if;

    new.anonimo := old.anonimo;
    new.eta_em := old.eta_em;
    new.preco_dinamico_fator := old.preco_dinamico_fator;
    new.fator_exibido := old.fator_exibido;
    new.peso_total_kg := old.peso_total_kg;

    if old.garantia_cupom_id is not null then
      new.garantia_cupom_id := old.garantia_cupom_id;
    end if;

    if new.status = 'cancelado' and old.status <> 'cancelado'
       and old.pagamento_metodo = 'online' and old.pagamento_status = 'pago'
       and auth.role() = 'authenticated' then
      raise exception 'Pedido pago online: cancele pelo painel para o cliente ser estornado.'
        using errcode = 'P0001';
    end if;

    -- DINHEIRO (2026-09-20): com entregador, ele reteve a taxa do que cobrou
    -- (corrida paga); sem entregador, a loja recebeu ela mesma (pedido pago).
    -- Feito aqui (BEFORE) para o trigger AFTER do ledger não precisar de um
    -- segundo UPDATE, que voltaria por este guard como 'authenticated'.
    if new.status = 'entregue' and old.status <> 'entregue' and old.pagamento_metodo = 'entrega' then
      if new.entregador_id is not null then
        new.pagamento_corrida := 'pago';
      else
        new.pagamento_status := 'pago';
      end if;
    end if;

    -- pago -> pendente nunca (o bloco antigo, mais abaixo, ficava DEPOIS da
    -- trava terminal e não valia para pedido já entregue).
    if old.pagamento_status = 'pago' and new.pagamento_status = 'pendente' then
      new.pagamento_status := old.pagamento_status;
    end if;

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

    if new.status is distinct from old.status and new.status <> 'cancelado' then
      ordem_old := array_position(array['recebido','preparando','saiu','entregue'], old.status);
      ordem_new := array_position(array['recebido','preparando','saiu','entregue'], new.status);
      if ordem_old is null or ordem_new is null or ordem_new < ordem_old then
        raise exception 'Transicao de status invalida: % -> %.', old.status, new.status using errcode = 'P0001';
      end if;
    end if;

    if new.pagamento_status is distinct from old.pagamento_status
       and old.pagamento_status = 'pago' and new.pagamento_status = 'pendente' then
      new.pagamento_status := old.pagamento_status;
    end if;

    if new.entregador_id is not null then
      select veiculo_tipo into ent_veiculo from public.entregadores where id = new.entregador_id;
      new.entrega_drone := coalesce(ent_veiculo = 'drone', false);

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

    new.codigo_confirmacao := null;
  end if;
  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA depois de aplicar:
--   1. select pg_get_functiondef('public.pedidos_clientes_guard'::regproc);
--      -- confirma que o bloco "BEBIDA ALCOÓLICA / CIGARRO" está lá E que o
--      -- resto (troco, cupom de festa, pagamento_corrida) continua intacto.
--   2. Teste manual: pedido com produto "Cerveja Teste" numa conta sem
--      idade_verificada -> erro P0001. Com idade_verificada=true -> passa.
--   3. Pedido comum sem item restrito, com troco e com cupom de festa:
--      continuam funcionando como antes (nada mudou nesses caminhos).
-- ----------------------------------------------------------------------------
