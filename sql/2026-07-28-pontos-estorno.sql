-- ===========================================================================
-- CLUBE COMMERLY — pontos só na ENTREGA, com estorno no cancelamento.
-- ---------------------------------------------------------------------------
-- DEFEITO CORRIGIDO (auditoria 2026-07-27):
--   `acumular_pontos_pedido` rodava em AFTER INSERT e creditava os pontos no
--   instante em que o pedido nascia — antes de ser pago, preparado ou entregue
--   — e NUNCA estornava. Dava para pedir, ganhar ponto, cancelar e resgatar o
--   ponto em OUTRA loja. Prejuízo real, porque o resgate vira desconto em
--   dinheiro na loja seguinte, que não tem nada a ver com o pedido cancelado.
--
--   Em produção isso já aconteceu: dois pedidos da festa `ARLHCR` estão presos
--   em 'recebido' desde 11/07 e geraram 437 pontos (353 + 84) que nunca
--   corresponderam a uma entrega. A seção 5 estorna.
--
-- MODELO NOVO:
--   INSERT              -> só DEBITA o resgate (`pontos_usados`). O desconto já
--                          está no total do pedido, então o débito tem de
--                          acontecer na hora, senão o cliente leva o desconto e
--                          fica com os pontos.
--   status -> entregue  -> CREDITA os pontos ganhos (1 por R$ 1 em produtos).
--   status -> cancelado -> DEVOLVE o resgate e RETIRA o ganho (se já creditado,
--                          no caso entregue->cancelado).
--
-- Tudo idempotente: os estornos e o crédito são guardados por
-- `clube_movimentos (pedido_id, tipo)`, então reprocessar não duplica nada.
--
-- Rode no SQL Editor do Supabase (produção). Seguro para rodar mais de uma vez.
-- ===========================================================================

-- ===========================================================================
-- 1. `clube_movimentos.tipo` precisa aceitar os estornos.
--    ARMADILHA: o CHECK antigo só permitia ('ganho','resgate'). Sem relaxar
--    aqui, TODO cancelamento passaria a estourar 23514 e derrubaria o UPDATE
--    de status do pedido — quebrando o cancelamento inteiro para o cliente.
-- ===========================================================================
alter table public.clube_movimentos drop constraint if exists clube_movimentos_tipo_check;
alter table public.clube_movimentos add constraint clube_movimentos_tipo_check
  check (tipo = any (array['ganho', 'resgate', 'estorno_ganho', 'estorno_resgate']));

-- ===========================================================================
-- 2. Helpers.
-- ===========================================================================

-- Pontos que um pedido VALE (1 por R$ 1 em produtos; a taxa de entrega não
-- pontua). Espelha `PONTOS_POR_REAL` em app/lib/fidelidade.ts.
create or replace function public.pontos_do_pedido(p_itens jsonb)
returns int
language sql
immutable
as $$
  select floor(coalesce(
    (select sum((e->>'preco')::numeric * (e->>'quantidade')::numeric)
       from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e),
    0))::int
$$;

-- Credita pontos ao par (cliente, loja). Sobe saldo e total acumulado juntos.
create or replace function public.creditar_pontos_clube(
  p_cliente_id uuid, p_loja_id uuid, p_pontos int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_pontos, 0) <= 0 or p_loja_id is null then return; end if;

  insert into public.pontos_clientes (cliente_id, loja_id, pontos, total_acumulado)
  values (p_cliente_id, p_loja_id, p_pontos, p_pontos)
  on conflict (cliente_id, loja_id) do update
    set pontos          = public.pontos_clientes.pontos + p_pontos,
        total_acumulado = coalesce(public.pontos_clientes.total_acumulado, 0) + p_pontos,
        updated_at      = now();
end;
$$;

-- Retira pontos GANHOS indevidamente. Debita o saldo (globalmente, via
-- `debitar_pontos_clube`, porque o cliente pode já ter gasto na loja de origem)
-- e desfaz o total acumulado da loja do pedido — senão o NÍVEL do cliente
-- (Bronze/Prata/Ouro) ficaria inflado para sempre por um pedido cancelado.
-- Devolve quantos pontos conseguiu retirar de fato.
create or replace function public.retirar_pontos_clube(
  p_cliente_id uuid, p_loja_id uuid, p_pontos int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_retirado int;
begin
  if coalesce(p_pontos, 0) <= 0 then return 0; end if;

  v_retirado := public.debitar_pontos_clube(p_cliente_id, p_pontos);

  if p_loja_id is not null then
    update public.pontos_clientes
       set total_acumulado = greatest(0, coalesce(total_acumulado, 0) - p_pontos),
           updated_at      = now()
     where cliente_id = p_cliente_id and loja_id = p_loja_id;
  end if;

  return v_retirado;
end;
$$;

-- ===========================================================================
-- 3. INSERT: apenas o DÉBITO do resgate. O ganho saiu daqui.
-- ===========================================================================
create or replace function public.acumular_pontos_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare debitados int;
begin
  -- Resgate: o desconto já entrou no total (guard), então o débito é imediato.
  -- Se o pedido for cancelado depois, a seção 4 devolve.
  if coalesce(new.pontos_usados, 0) > 0 then
    debitados := public.debitar_pontos_clube(new.cliente_id, new.pontos_usados);
    if debitados > 0 then
      insert into public.clube_movimentos (cliente_id, loja_id, pedido_id, tipo, pontos)
      values (new.cliente_id, new.loja_id, new.id, 'resgate', debitados);
    end if;
  end if;

  -- O GANHO não acontece mais aqui: só quando o pedido chega em 'entregue'
  -- (trigger `trg_pontos_status`, seção 4).
  return new;
end;
$$;

-- ===========================================================================
-- 4. UPDATE de status: credita na entrega, estorna no cancelamento.
-- ===========================================================================
-- Saldo LÍQUIDO de um tipo de movimento no pedido (lançado menos estornado).
--
-- Contar só `exists(tipo='ganho')` seria errado para os pedidos que passaram
-- pelo backfill da seção 5: eles têm um 'ganho' histórico JÁ estornado, e o
-- `exists` bloquearia o crédito legítimo se o pedido fosse entregue depois.
-- O líquido dá a resposta certa nos três casos: nunca creditado (0), creditado
-- (>0) e creditado-e-estornado (0, pode creditar de novo).
create or replace function public.pontos_liquidos_pedido(p_pedido_id uuid, p_tipo text)
returns int
language sql
stable
as $$
  select coalesce(sum(
    case when tipo = p_tipo             then pontos
         when tipo = 'estorno_' || p_tipo then -pontos
         else 0 end), 0)::int
    from public.clube_movimentos where pedido_id = p_pedido_id
$$;

create or replace function public.pontos_status_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pontos    int;
  v_resgatado int;
  v_ganho     int;
begin
  if new.status is not distinct from old.status then return new; end if;

  -- ---- ENTREGUE: credita o que o pedido vale. --------------------------
  if new.status = 'entregue' and old.status <> 'entregue' then
    if public.pontos_liquidos_pedido(new.id, 'ganho') > 0 then
      return new; -- já creditado e não estornado
    end if;

    v_pontos := public.pontos_do_pedido(new.itens);
    if v_pontos > 0 then
      perform public.creditar_pontos_clube(new.cliente_id, new.loja_id, v_pontos);
      insert into public.clube_movimentos (cliente_id, loja_id, pedido_id, tipo, pontos)
      values (new.cliente_id, new.loja_id, new.id, 'ganho', v_pontos);
    end if;
    return new;
  end if;

  -- ---- CANCELADO: devolve o resgate e retira o ganho. -------------------
  if new.status = 'cancelado' and old.status <> 'cancelado' then

    -- (a) Resgate usado no pedido volta para o cliente — ele não recebeu nada.
    v_resgatado := public.pontos_liquidos_pedido(new.id, 'resgate');

    if v_resgatado > 0 then
      perform public.creditar_pontos_clube(new.cliente_id, new.loja_id, v_resgatado);
      -- O crédito acima sobe `total_acumulado` indevidamente (não é ganho novo,
      -- é devolução). Desfaz só essa parte, mantendo o saldo devolvido.
      update public.pontos_clientes
         set total_acumulado = greatest(0, coalesce(total_acumulado, 0) - v_resgatado)
       where cliente_id = new.cliente_id and loja_id = new.loja_id;

      insert into public.clube_movimentos (cliente_id, loja_id, pedido_id, tipo, pontos)
      values (new.cliente_id, new.loja_id, new.id, 'estorno_resgate', v_resgatado);
    end if;

    -- (b) Ganho já creditado volta atrás.
    --
    -- Hoje `entregue -> cancelado` NÃO acontece pelo app: o guard
    -- (`pedidos_clientes_guard`) tem trava de estado terminal e reescreve
    -- `new.status := old.status` quando o pedido já está entregue/cancelado.
    -- Este ramo fica como rede: cobre os pedidos LEGADOS que receberam 'ganho'
    -- no insert (antes desta migração) e protege o saldo caso a trava do guard
    -- mude algum dia. Sem ele, afrouxar o guard reabriria o mesmo prejuízo.
    v_ganho := public.pontos_liquidos_pedido(new.id, 'ganho');

    if v_ganho > 0 then
      perform public.retirar_pontos_clube(new.cliente_id, new.loja_id, v_ganho);
      insert into public.clube_movimentos (cliente_id, loja_id, pedido_id, tipo, pontos)
      values (new.cliente_id, new.loja_id, new.id, 'estorno_ganho', v_ganho);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pontos_status on public.pedidos_clientes;
create trigger trg_pontos_status
  after update of status on public.pedidos_clientes
  for each row execute function public.pontos_status_pedido();

-- ===========================================================================
-- 5. BACKFILL — estorna o ganho de pedidos que nunca foram entregues.
--    Sob a regra nova, ponto só existe com entrega. Todo movimento 'ganho'
--    preso a um pedido que não está 'entregue' é indevido.
--
--    Movimentos com `pedido_id` nulo NÃO são tocados: sem pedido não dá para
--    afirmar que são indevidos (e o FK é ON DELETE SET NULL, então podem ser
--    restos legítimos de pedidos apagados).
-- ===========================================================================
do $$
declare r record; v_total int := 0; v_linhas int := 0;
begin
  for r in
    select m.id, m.cliente_id, m.loja_id, m.pedido_id, m.pontos
      from public.clube_movimentos m
      join public.pedidos_clientes p on p.id = m.pedido_id
     where m.tipo = 'ganho'
       and p.status <> 'entregue'
       and public.pontos_liquidos_pedido(m.pedido_id, 'ganho') > 0
  loop
    perform public.retirar_pontos_clube(r.cliente_id, r.loja_id, r.pontos);
    insert into public.clube_movimentos (cliente_id, loja_id, pedido_id, tipo, pontos)
    values (r.cliente_id, r.loja_id, r.pedido_id, 'estorno_ganho', r.pontos);
    v_total  := v_total + r.pontos;
    v_linhas := v_linhas + 1;
  end loop;

  raise notice 'Estorno de pontos indevidos: % movimento(s), % ponto(s).', v_linhas, v_total;
end $$;

-- ===========================================================================
-- 6. Verificação:
--   -- Saldo por cliente (deve ter caído o equivalente ao estornado):
--   select * from public.clube_saldo;
--
--   -- Nenhum 'ganho' sem entrega deve sobrar sem estorno:
--   select m.pedido_id, p.status, m.pontos
--     from public.clube_movimentos m
--     join public.pedidos_clientes p on p.id = m.pedido_id
--    where m.tipo = 'ganho' and p.status <> 'entregue'
--      and not exists (select 1 from public.clube_movimentos e
--                       where e.pedido_id = m.pedido_id and e.tipo = 'estorno_ganho');
-- ===========================================================================
