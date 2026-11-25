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
--      (Corrigido também no código da aplicação nesta mesma leva de mudanças,
--      em app/api/festa/fechar/route.ts — mas o banco não devia depender só
--      disso: é exatamente o padrão que o `CLAUDE.md` já descreve para
--      qualquer outra regra de negócio aqui — "a segurança real mora na RLS
--      do Postgres", não nas rotas. Esta migração é o backstop.)
--   2. Um insert direto em `pedidos_clientes` pela REST do PostgREST (chave
--      anon + JWT válido, sem passar pelo Next.js) também contornava as duas
--      checagens de aplicação. O comentário em `PedidoModal.tsx` ("...e na
--      entrega o trigger recusa o insert") já dizia que o trigger cobria
--      isto — mas o trigger nunca teve essa checagem. Este arquivo corrige
--      a lacuna entre o comentário e o código.
--
-- MUDANÇA (única): no bloco de INSERT do guard, logo depois da checagem
-- "produto inexistente nesta loja" (que já garante que todo item tem um
-- produto válido desta loja) e ANTES do cálculo de preço — roda
-- incondicionalmente, pedido normal ou de festa:
--   - resolve o nome de cada produto do pedido;
--   - compara (sem acento, case-insensitive) com a mesma lista de palavras de
--     `app/lib/restritos.ts` (bebida alcoólica e cigarro/tabaco);
--   - se achar alguma, exige que `auth.users.raw_app_meta_data->>'idade_verificada'`
--     (gravado pelo webhook da Didit, `app/api/webhooks/didit/route.ts`) seja
--     `true` para o dono do pedido (via `public.clientes.user_id`).
--
-- Resto da função = corpo igual ao de `sql/2026-09-19-excluir-conta.sql`
-- (última redefinição encontrada no repositório). *** IMPORTANTE ***: puxe o
-- corpo VIVO do banco (`select pg_get_functiondef('public.pedidos_clientes_guard'::regproc)`)
-- antes de aplicar esta migração — eu não tive acesso ao banco de produção
-- nesta sessão para conferir se algo mudou depois de 2026-09-19. Se mudou,
-- replique só o bloco novo (marcado abaixo) no corpo vivo, em vez de aplicar
-- este arquivo inteiro por cima.
--
-- STATUS: NÃO APLICADO em produção ainda. Aplicar via MCP do Supabase ou pelo
-- SQL Editor do painel.
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
    new.garantia_cupom_id := null;
    new.entrega_drone := false;

    pago_online := (auth.role() = 'service_role'
                    and nullif(new.stripe_session_id, '') is not null);

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

    if coalesce(new.anonimo, false) then
      new.cliente_nome := null;
      new.cliente_telefone := null;
    end if;

  elsif tg_op = 'UPDATE' then
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

    if new.status = 'cancelado' and old.status <> 'cancelado'
       and old.pagamento_metodo = 'online' and old.pagamento_status = 'pago'
       and auth.role() = 'authenticated' then
      raise exception 'Pedido pago online: cancele pelo painel para o cliente ser estornado.'
        using errcode = 'P0001';
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

    new.codigo_confirmacao := null;
  end if;
  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- CONFERÊNCIA depois de aplicar:
--   1. select pg_get_functiondef('public.pedidos_clientes_guard'::regproc);
--      -- confirma que o bloco "BEBIDA ALCOÓLICA / CIGARRO" está lá.
--   2. Teste manual: tente inserir um pedido de teste com um produto chamado
--      "Cerveja Teste" para uma conta sem idade_verificada — tem que dar erro
--      P0001. Repita com `app_metadata.idade_verificada = true` — tem que
--      passar.
--   3. node --test (ou o roteiro de CHECKLIST-TESTES.md) para garantir que
--      pedidos comuns sem item restrito continuam passando normalmente.
-- ----------------------------------------------------------------------------
