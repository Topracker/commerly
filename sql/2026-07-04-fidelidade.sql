-- Programa de fidelidade do cliente.
--
-- Cliente acumula pontos a cada pedido (1 ponto por R$ 1 gasto em produtos —
-- a taxa de entrega não pontua) e pode resgatar em blocos de 100 pontos = R$ 5
-- de desconto num pedido futuro na MESMA loja. O nível (Bronze/Prata/Ouro/
-- Diamante) é global, calculado no app a partir da soma dos pontos.
--
-- Rode este SQL no SQL Editor do Supabase (produção) ANTES do deploy.
-- Tudo é idempotente. Baseado na versão mais recente do guard
-- (2026-07-03-distancia-maxima.sql) — aplique aquele antes deste.
--
-- Fluxo dos pontos:
--   1. pedidos_clientes ganha `pontos_usados` e `desconto_pontos`.
--   2. O guard (BEFORE INSERT) valida o resgate contra o saldo do cliente,
--      aplica o desconto no total e trava os campos no UPDATE.
--   3. Um trigger AFTER INSERT credita os pontos ganhos e debita os resgatados
--      em `pontos_clientes` (upsert por cliente+loja).

-- ===========================================================================
-- 1. Colunas de resgate nos pedidos (real e pendente/online).
-- ===========================================================================
alter table public.pedidos_clientes
  add column if not exists pontos_usados integer not null default 0
    check (pontos_usados >= 0),
  add column if not exists desconto_pontos numeric(10,2) not null default 0
    check (desconto_pontos >= 0);

alter table public.pedidos_pendentes
  add column if not exists pontos_usados integer not null default 0,
  add column if not exists desconto_pontos numeric(10,2) not null default 0;

-- ===========================================================================
-- 2. Tabela de saldo de pontos (um registro por cliente+loja).
-- ===========================================================================
create table if not exists public.pontos_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  pontos integer not null default 0 check (pontos >= 0),
  updated_at timestamptz not null default now(),
  unique (cliente_id, loja_id)
);

create index if not exists idx_pontos_clientes_cliente on public.pontos_clientes (cliente_id);
create index if not exists idx_pontos_clientes_loja on public.pontos_clientes (loja_id);

alter table public.pontos_clientes enable row level security;

-- Só LEITURA para os donos; a escrita acontece exclusivamente pelos triggers
-- (security definer), então não há policy de insert/update/delete.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pontos_clientes'
  loop
    execute format('drop policy if exists %I on public.pontos_clientes', pol.policyname);
  end loop;
end $$;

grant select on public.pontos_clientes to authenticated;

-- Cliente vê o próprio saldo (em qualquer loja).
create policy "pontos_cli_select_dono" on public.pontos_clientes
  for select to authenticated
  using (
    exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  );

-- Comerciante vê o saldo dos clientes na própria loja.
create policy "pontos_loja_select_dono" on public.pontos_clientes
  for select to authenticated
  using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );

-- ===========================================================================
-- 3. GUARD reescrito: recalcula subtotal/distância/taxa/total, aplica o
--    desconto por pontos (validando o saldo) e mantém as travas anteriores.
--    SECURITY DEFINER para ler lojas e pontos_clientes sob RLS.
-- ===========================================================================
create or replace function public.pedidos_clientes_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loja_lat double precision;
  loja_lng double precision;
  max_dist numeric;
  dist numeric;
  subtotal numeric;
  saldo integer;
  usados integer;
  desc_pontos numeric;
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido';
    new.entregador_id := null;
    new.codigo_confirmacao := null;
    new.pagamento_corrida := 'pendente';
    new.created_at := now();
    new.updated_at := now();

    select coalesce(sum(
             (e->>'preco')::numeric * (e->>'quantidade')::numeric
           ), 0)
      into subtotal
      from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) e;

    select latitude, longitude, distancia_maxima_entrega
      into loja_lat, loja_lng, max_dist
      from public.lojas where id = new.loja_id;

    dist := public.haversine_km(loja_lat, loja_lng, new.entrega_latitude, new.entrega_longitude);

    -- Anti-burla: fora da área de entrega -> rejeita o pedido.
    if dist is not null and max_dist is not null and dist > max_dist then
      raise exception 'Endereço fora da área de entrega. Esta loja entrega até % km.', max_dist
        using errcode = 'P0001';
    end if;

    -- Resgate de pontos (opcional). Múltiplos de 100; 100 pontos = R$ 5.
    usados := coalesce(new.pontos_usados, 0);
    if usados < 0 then usados := 0; end if;
    if usados > 0 then
      if usados % 100 <> 0 then
        raise exception 'Pontos resgatados devem ser múltiplos de 100.'
          using errcode = 'P0001';
      end if;
      select coalesce(pontos, 0) into saldo
        from public.pontos_clientes
        where cliente_id = new.cliente_id and loja_id = new.loja_id;
      if coalesce(saldo, 0) < usados then
        raise exception 'Pontos insuficientes para o resgate.'
          using errcode = 'P0001';
      end if;
      desc_pontos := (usados / 100) * 5;
      -- Não desconta mais que o subtotal (limita ao maior bloco que cabe).
      if desc_pontos > subtotal then
        desc_pontos := floor(subtotal / 5) * 5;
        usados := (desc_pontos / 5) * 100;
      end if;
    else
      usados := 0;
      desc_pontos := 0;
    end if;

    new.pontos_usados   := usados;
    new.desconto_pontos := desc_pontos;
    new.distancia_km    := dist;
    new.taxa_entrega    := public.calcular_taxa_entrega(dist);
    new.valor_corrida   := new.taxa_entrega;
    new.total           := greatest(subtotal - desc_pontos, 0) + new.taxa_entrega;

  elsif tg_op = 'UPDATE' then
    new.loja_id := old.loja_id;
    new.cliente_id := old.cliente_id;
    new.itens := old.itens;
    new.total := old.total;
    new.taxa_entrega := old.taxa_entrega;
    new.valor_corrida := old.valor_corrida;
    new.distancia_km := old.distancia_km;
    new.entrega_latitude := old.entrega_latitude;
    new.entrega_longitude := old.entrega_longitude;
    new.endereco_entrega := old.endereco_entrega;
    new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome;
    new.cliente_telefone := old.cliente_telefone;
    new.created_at := old.created_at;
    new.updated_at := now();
    -- Pagamento e resgate imutáveis após a criação.
    new.pagamento_metodo := old.pagamento_metodo;
    new.pagamento_status := old.pagamento_status;
    new.stripe_session_id := old.stripe_session_id;
    new.stripe_payment_intent := old.stripe_payment_intent;
    new.pontos_usados := old.pontos_usados;
    new.desconto_pontos := old.desconto_pontos;
    -- Código de confirmação: gera ao sair para entrega; depois imutável.
    if old.codigo_confirmacao is not null and old.codigo_confirmacao <> '' then
      new.codigo_confirmacao := old.codigo_confirmacao;
    elsif new.status = 'saiu' then
      new.codigo_confirmacao := lpad((floor(random() * 10000))::int::text, 4, '0');
    else
      new.codigo_confirmacao := old.codigo_confirmacao;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedidos_clientes_guard on public.pedidos_clientes;
create trigger trg_pedidos_clientes_guard
  before insert or update on public.pedidos_clientes
  for each row execute function public.pedidos_clientes_guard();

-- ===========================================================================
-- 4. ACÚMULO: credita pontos ganhos e debita os resgatados após criar o pedido.
--    Ganhos = R$ efetivamente gastos em produtos (subtotal - desconto), floor.
-- ===========================================================================
create or replace function public.acumular_pontos_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ganhos integer;
  usados integer;
begin
  -- subtotal - desconto = (total - taxa). Pontua o valor pago em produtos.
  ganhos := floor(greatest(coalesce(new.total, 0) - coalesce(new.taxa_entrega, 0), 0))::int;
  usados := coalesce(new.pontos_usados, 0);

  if ganhos = 0 and usados = 0 then
    return new;
  end if;

  insert into public.pontos_clientes (cliente_id, loja_id, pontos, updated_at)
  values (new.cliente_id, new.loja_id, greatest(ganhos - usados, 0), now())
  on conflict (cliente_id, loja_id) do update
    set pontos = greatest(public.pontos_clientes.pontos + ganhos - usados, 0),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_acumular_pontos_pedido on public.pedidos_clientes;
create trigger trg_acumular_pontos_pedido
  after insert on public.pedidos_clientes
  for each row execute function public.acumular_pontos_pedido();

-- ===========================================================================
-- 5. Verificação (rode manualmente após aplicar):
--   select policyname, cmd from pg_policies
--     where schemaname='public' and tablename='pontos_clientes';
--   -- Após um pedido pago, o saldo deve refletir floor(subtotal):
--   select * from public.pontos_clientes order by updated_at desc limit 5;
-- ===========================================================================
