-- ============================================================================
-- COMMERLY — SCRIPT SQL CONSOLIDADO DAS MIGRATIONS PENDENTES DE PRODUÇÃO
-- Gerado em 2026-07-05. Rode UMA vez no SQL Editor do Supabase (produção).
--
-- É TOTALMENTE IDEMPOTENTE (if not exists / create or replace / drop-if-exists
-- antes de cada create). Pode rodar mais de uma vez sem efeito colateral, e é
-- seguro mesmo que parte já tenha sido aplicada. Roda dentro de uma transação:
-- se algo falhar, NADA é aplicado (all-or-nothing).
--
-- NÃO reinclui o que já está aplicado e é independente:
--   • 2026-07-01-google-maps-latlng  -> lojas.latitude / lojas.longitude
--   • 2026-07-02-entregadores        -> tabelas entregadores, entregador_parcerias,
--                                       entregas_localizacao, avaliacoes_entregadores,
--                                       buckets e policies desses ecossistemas
--   • 2026-07-03-entregadores-cadastro
-- ASSUME que lojas.latitude/longitude e a tabela public.entregadores já existem.
-- (As colunas que o entregadores.sql adiciona em pedidos_clientes SÃO recriadas
--  aqui via "add column if not exists", pois esta é a migration que garante a
--  própria tabela pedidos_clientes — necessário caso ela seja criada do zero.)
--
-- Objetos que várias migrations recriavam foram COLAPSADOS na versão final:
--   • função calcular_taxa_entrega -> modelo DINÂMICO por km (2026-07-03-taxa-dinamica-km)
--   • trigger pedidos_clientes_guard -> versão com FIDELIDADE (2026-07-04-fidelidade)
--   • view lojas_publicas -> versão com website_url + todas as colunas (2026-07-04-website-loja)
--
-- Migrations cobertas por este consolidado:
--   2026-06-30-validacoes-cadastro · 2026-07-02-lojas-rls-cobranca ·
--   2026-07-02-foto-fachada · 2026-07-02-pedidos-clientes · 2026-07-02-taxa-entrega ·
--   2026-07-03-taxa-distancia · 2026-07-03-taxa-dinamica-km · 2026-07-03-pagamento-pedido ·
--   2026-07-03-distancia-maxima · 2026-07-03-notificacoes ·
--   2026-07-03-entregador-pagamento-manual · 2026-07-04-website-loja ·
--   2026-07-04-fidelidade · 2026-07-04-push-subscriptions
--
-- APÓS rodar: setar na Vercel as env do Web Push — VAPID_PUBLIC_KEY,
-- VAPID_PRIVATE_KEY, VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY.
-- ============================================================================

begin;

-- ============================================================================
-- 1. TABELA lojas — colunas novas (cobrança + features). latitude/longitude
--    já existem (google-maps aplicado). Tudo add-if-not-exists.
-- ============================================================================
-- Cobrança (blindadas pelo trigger da seção 2).
alter table public.lojas add column if not exists plano text not null default 'inativo';
alter table public.lojas add column if not exists stripe_subscription_id text;
alter table public.lojas add column if not exists mp_assinatura_id text;
alter table public.lojas add column if not exists assinatura_ciclos integer not null default 0;
alter table public.lojas alter column plano set default 'inativo';

-- Fachada (foto_fachada_url = legado p/ backfill; fotos_fachada = array atual).
alter table public.lojas add column if not exists foto_fachada_url text;
alter table public.lojas add column if not exists fotos_fachada text[] not null default '{}';

-- Delivery / pagamento / site.
alter table public.lojas add column if not exists taxa_entrega numeric(10,2) not null default 0;
alter table public.lojas add column if not exists stripe_account_id text;
alter table public.lojas add column if not exists stripe_onboarded boolean not null default false;
alter table public.lojas add column if not exists distancia_maxima_entrega numeric(5,1) not null default 10
  check (distancia_maxima_entrega >= 1 and distancia_maxima_entrega <= 50);
alter table public.lojas add column if not exists website_url text;

-- Backfill: migra a foto única legada para o array, se ainda estiver vazio.
update public.lojas
   set fotos_fachada = array[foto_fachada_url]
 where foto_fachada_url is not null
   and foto_fachada_url <> ''
   and (fotos_fachada is null or array_length(fotos_fachada, 1) is null);

-- ============================================================================
-- 2. SEGURANÇA DO PAYWALL — trigger que blinda os campos de cobrança de `lojas`
--    contra escrita por anon/authenticated (só service role/webhooks alteram).
-- ============================================================================
create or replace function public.lojas_bloqueia_cobranca_cliente()
returns trigger
language plpgsql
security invoker
as $$
begin
  -- Papéis administrativos/servidor não são restringidos.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.plano := 'inativo';
    new.stripe_subscription_id := null;
    new.mp_assinatura_id := null;
    new.assinatura_ciclos := 0;
  elsif tg_op = 'UPDATE' then
    new.plano := old.plano;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.mp_assinatura_id := old.mp_assinatura_id;
    new.assinatura_ciclos := old.assinatura_ciclos;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lojas_bloqueia_cobranca on public.lojas;
create trigger trg_lojas_bloqueia_cobranca
  before insert or update on public.lojas
  for each row
  execute function public.lojas_bloqueia_cobranca_cliente();

-- ----------------------------------------------------------------------------
-- 2.1 RLS de `lojas` — escopo por dono (leitura pública é pela view definer).
--     Remove TODAS as policies antigas para este arquivo ser autoritativo.
-- ----------------------------------------------------------------------------
alter table public.lojas enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'lojas'
  loop
    execute format('drop policy if exists %I on public.lojas', pol.policyname);
  end loop;
end $$;

grant select, insert, update, delete on public.lojas to authenticated;

create policy "lojas_select_own" on public.lojas
  for select to authenticated using (auth.uid() = user_id);
create policy "lojas_insert_own" on public.lojas
  for insert to authenticated with check (auth.uid() = user_id);
create policy "lojas_update_own" on public.lojas
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lojas_delete_own" on public.lojas
  for delete to authenticated using (auth.uid() = user_id);

-- ============================================================================
-- 3. VALIDAÇÕES DE CADASTRO — colunas + índices de anti-duplicação.
-- ============================================================================
alter table public.fornecedores add column if not exists cnpj text;
alter table public.clientes     add column if not exists telefone text;

create index if not exists idx_fornecedores_cnpj     on public.fornecedores (cnpj);
create index if not exists idx_fornecedores_telefone on public.fornecedores (telefone);
create index if not exists idx_clientes_cpf          on public.clientes (cpf);
create index if not exists idx_clientes_telefone     on public.clientes (telefone);
create index if not exists idx_lojas_documento       on public.lojas (documento);
create index if not exists idx_lojas_telefone        on public.lojas (telefone);

-- ============================================================================
-- 4. STORAGE — bucket público "lojas" (fotos de fachada) + policies.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('lojas', 'lojas', true)
on conflict (id) do update set public = true;

drop policy if exists "lojas_public_read" on storage.objects;
create policy "lojas_public_read" on storage.objects
  for select to public using (bucket_id = 'lojas');

drop policy if exists "lojas_auth_insert" on storage.objects;
create policy "lojas_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'lojas');

drop policy if exists "lojas_auth_update" on storage.objects;
create policy "lojas_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'lojas');

drop policy if exists "lojas_auth_delete" on storage.objects;
create policy "lojas_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'lojas');

-- ============================================================================
-- 5. ENTREGADOR — flag de pagamento manual (fallback quando Connect falha).
--    (A tabela entregadores já existe; só a coluna é nova.)
-- ============================================================================
alter table public.entregadores
  add column if not exists pagamento_manual boolean not null default false;

-- ============================================================================
-- 6. FUNÇÕES DE TAXA — Haversine (km) + taxa dinâmica por km (modelo final).
-- ============================================================================
create or replace function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns numeric
language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round((2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )))::numeric, 3)
  end
$$;

-- Modelo DINÂMICO (iFood-like): base 3 + 1/km, mínimo 3, máximo 25.
create or replace function public.calcular_taxa_entrega(dist_km numeric)
returns numeric
language sql immutable as $$
  select round(
    least(25, greatest(3, 3 + 1 * coalesce(dist_km, 0)))::numeric
  , 2)
$$;

-- ============================================================================
-- 7. TABELA pedidos_clientes — base + TODAS as colunas das migrations do chain.
--    (create-if-not-exists com a base; add-if-not-exists p/ o resto, cobrindo
--     tanto criação do zero quanto tabela parcial já existente em produção.)
-- ============================================================================
create table if not exists public.pedidos_clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  itens jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0,
  endereco_entrega text not null,
  observacao text,
  cliente_nome text,
  cliente_telefone text,
  status text not null default 'recebido'
    check (status in ('recebido', 'preparando', 'saiu', 'entregue', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Colunas do ecossistema entregador (originalmente em 2026-07-02-entregadores).
alter table public.pedidos_clientes
  add column if not exists entregador_id uuid references public.entregadores(id) on delete set null;
alter table public.pedidos_clientes
  add column if not exists valor_corrida numeric(10,2) not null default 0;
alter table public.pedidos_clientes
  add column if not exists codigo_confirmacao text;
alter table public.pedidos_clientes
  add column if not exists pagamento_corrida text not null default 'pendente'
    check (pagamento_corrida in ('pendente', 'pago'));

-- Taxa congelada + ponto de entrega + distância.
alter table public.pedidos_clientes
  add column if not exists taxa_entrega numeric(10,2) not null default 0;
alter table public.pedidos_clientes
  add column if not exists entrega_latitude  double precision,
  add column if not exists entrega_longitude double precision,
  add column if not exists distancia_km numeric(10,2);

-- Pagamento online (Stripe).
alter table public.pedidos_clientes
  add column if not exists pagamento_metodo text not null default 'entrega'
    check (pagamento_metodo in ('online', 'entrega')),
  add column if not exists pagamento_status text not null default 'pendente'
    check (pagamento_status in ('pendente', 'pago')),
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text;

-- Fidelidade (resgate de pontos).
alter table public.pedidos_clientes
  add column if not exists pontos_usados integer not null default 0
    check (pontos_usados >= 0),
  add column if not exists desconto_pontos numeric(10,2) not null default 0
    check (desconto_pontos >= 0);

create index if not exists idx_pedidos_clientes_loja    on public.pedidos_clientes (loja_id, created_at desc);
create index if not exists idx_pedidos_clientes_cliente on public.pedidos_clientes (cliente_id, created_at desc);
create index if not exists idx_pedidos_clientes_status  on public.pedidos_clientes (loja_id, status);
create index if not exists idx_pedidos_entregador       on public.pedidos_clientes (entregador_id);

-- ============================================================================
-- 8. TABELA pontos_clientes — saldo de fidelidade (um registro por cliente+loja).
-- ============================================================================
create table if not exists public.pontos_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  pontos integer not null default 0 check (pontos >= 0),
  updated_at timestamptz not null default now(),
  unique (cliente_id, loja_id)
);

create index if not exists idx_pontos_clientes_cliente on public.pontos_clientes (cliente_id);
create index if not exists idx_pontos_clientes_loja    on public.pontos_clientes (loja_id);

alter table public.pontos_clientes enable row level security;

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

create policy "pontos_cli_select_dono" on public.pontos_clientes
  for select to authenticated using (
    exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  );
create policy "pontos_loja_select_dono" on public.pontos_clientes
  for select to authenticated using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );

-- ============================================================================
-- 9. TABELA pedidos_pendentes — guarda o pedido até o pagamento online confirmar.
--    Só o service role (checkout + webhook) acessa — RLS ligada, sem policy.
-- ============================================================================
create table if not exists public.pedidos_pendentes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  itens jsonb not null,
  endereco_entrega text not null,
  entrega_latitude double precision,
  entrega_longitude double precision,
  observacao text,
  cliente_nome text,
  cliente_telefone text,
  subtotal numeric(10,2) not null default 0,
  taxa_entrega numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  stripe_session_id text,
  created_at timestamptz not null default now()
);

alter table public.pedidos_pendentes
  add column if not exists pontos_usados integer not null default 0,
  add column if not exists desconto_pontos numeric(10,2) not null default 0;

create index if not exists idx_pedidos_pendentes_session on public.pedidos_pendentes (stripe_session_id);

alter table public.pedidos_pendentes enable row level security;
-- Sem policies: authenticated não acessa; só service role (checkout/webhook).

-- ============================================================================
-- 10. GUARD FINAL de pedidos_clientes (versão fidelidade) + acúmulo de pontos.
--     SECURITY DEFINER: lê lojas (coords/dist máx) e pontos_clientes sob RLS.
-- ============================================================================
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
    -- status, entregador_id, pagamento_corrida passam livres.
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedidos_clientes_guard on public.pedidos_clientes;
create trigger trg_pedidos_clientes_guard
  before insert or update on public.pedidos_clientes
  for each row execute function public.pedidos_clientes_guard();

-- Acúmulo/débito de pontos após criar o pedido.
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

-- ----------------------------------------------------------------------------
-- 10.1 RLS de pedidos_clientes — cliente (dono), comerciante (loja),
--      entregador parceiro/atribuído. Autoritativo (remove policies antigas).
-- ----------------------------------------------------------------------------
alter table public.pedidos_clientes enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pedidos_clientes'
  loop
    execute format('drop policy if exists %I on public.pedidos_clientes', pol.policyname);
  end loop;
end $$;

grant select, insert, update, delete on public.pedidos_clientes to authenticated;

create policy "pedidos_cli_insert_dono" on public.pedidos_clientes
  for insert to authenticated with check (
    exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  );
create policy "pedidos_cli_select_dono" on public.pedidos_clientes
  for select to authenticated using (
    exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  );
create policy "pedidos_loja_select_dono" on public.pedidos_clientes
  for select to authenticated using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );
create policy "pedidos_loja_update_dono" on public.pedidos_clientes
  for update to authenticated using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );
-- Entregador parceiro (aceito) ou já atribuído vê os pedidos.
create policy "pedidos_entregador_select" on public.pedidos_clientes
  for select to authenticated using (
    exists (select 1 from public.entregadores e where e.id = entregador_id and e.user_id = auth.uid())
    or exists (
      select 1 from public.entregador_parcerias pa
        join public.entregadores e on e.id = pa.entregador_id
       where pa.loja_id = pedidos_clientes.loja_id
         and pa.status = 'aceita'
         and e.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 11. NOTIFICAÇÕES em tempo real — tabela + RLS + triggers + Realtime.
-- ============================================================================
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('pedido_novo', 'pedido_status', 'parceria_aceita')),
  titulo text not null,
  mensagem text not null,
  link text,
  dados jsonb not null default '{}',
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificacoes_user      on public.notificacoes (user_id, created_at desc);
create index if not exists idx_notificacoes_nao_lidas on public.notificacoes (user_id) where not lida;

alter table public.notificacoes enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='notificacoes'
  loop execute format('drop policy if exists %I on public.notificacoes', pol.policyname); end loop;
end $$;

grant select, update, delete on public.notificacoes to authenticated;

create policy "notif_select_dono" on public.notificacoes
  for select to authenticated using (user_id = auth.uid());
create policy "notif_update_dono" on public.notificacoes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notif_delete_dono" on public.notificacoes
  for delete to authenticated using (user_id = auth.uid());

-- 11.1 Novo pedido -> dono da loja
create or replace function public.notif_pedido_novo()
returns trigger language plpgsql security definer set search_path = public as $$
declare dono uuid;
begin
  select user_id into dono from public.lojas where id = new.loja_id;
  if dono is not null then
    insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)
    values (
      dono, 'pedido_novo', 'Novo pedido! 🛎️',
      coalesce(new.cliente_nome, 'Cliente') || ' • R$ ' || to_char(new.total, 'FM999990.00'),
      '/pedidos',
      jsonb_build_object('pedido_id', new.id, 'loja_id', new.loja_id)
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_pedido_novo on public.pedidos_clientes;
create trigger trg_notif_pedido_novo after insert on public.pedidos_clientes
  for each row execute function public.notif_pedido_novo();

-- 11.2 Mudança de status -> cliente
create or replace function public.notif_pedido_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare dono uuid; t text; m text;
begin
  if new.status is distinct from old.status
     and new.status in ('preparando', 'saiu', 'entregue', 'cancelado') then
    select user_id into dono from public.clientes where id = new.cliente_id;
    if dono is not null then
      t := case new.status
             when 'preparando' then 'Pedido em preparo 👨‍🍳'
             when 'saiu'       then 'Saiu para entrega 🛵'
             when 'entregue'   then 'Pedido entregue ✅'
             when 'cancelado'  then 'Pedido cancelado ✖️'
           end;
      m := case new.status
             when 'preparando' then 'Seu pedido já está sendo preparado.'
             when 'saiu'       then 'Seu pedido saiu para entrega. Já está a caminho!'
             when 'entregue'   then 'Seu pedido foi entregue. Bom proveito!'
             when 'cancelado'  then 'Seu pedido foi cancelado.'
           end;
      insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)
      values (
        dono, 'pedido_status', t, m, '/cliente/pedidos',
        jsonb_build_object('pedido_id', new.id, 'status', new.status, 'loja_id', new.loja_id)
      );
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_pedido_status on public.pedidos_clientes;
create trigger trg_notif_pedido_status after update on public.pedidos_clientes
  for each row execute function public.notif_pedido_status();

-- 11.3 Parceria aceita -> entregador
create or replace function public.notif_parceria_aceita()
returns trigger language plpgsql security definer set search_path = public as $$
declare dono uuid; loja_nome text;
begin
  if new.status = 'aceita' and old.status is distinct from 'aceita' then
    select user_id into dono from public.entregadores where id = new.entregador_id;
    select nome    into loja_nome from public.lojas where id = new.loja_id;
    if dono is not null then
      insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)
      values (
        dono, 'parceria_aceita', 'Parceria aceita! 🎉',
        coalesce(loja_nome, 'A loja') || ' aceitou você como entregador parceiro.',
        '/entregador-delivery/dashboard',
        jsonb_build_object('loja_id', new.loja_id, 'parceria_id', new.id)
      );
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_parceria_aceita on public.entregador_parcerias;
create trigger trg_notif_parceria_aceita after update on public.entregador_parcerias
  for each row execute function public.notif_parceria_aceita();

-- 11.4 Realtime: adiciona notificacoes à publicação (se ainda não estiver).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes'
     )
  then
    alter publication supabase_realtime add table public.notificacoes;
  end if;
end $$;

-- ============================================================================
-- 12. WEB PUSH — tabela push_subscriptions + RLS. (Depois: env VAPID na Vercel.)
-- ============================================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subs_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname='public' and tablename='push_subscriptions'
  loop execute format('drop policy if exists %I on public.push_subscriptions', pol.policyname); end loop;
end $$;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "push_select_dono" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push_insert_dono" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push_update_dono" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_delete_dono" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Limpeza da abordagem antiga (pg_net + GUC), se tiver sido aplicada.
drop trigger if exists trg_push_dispatch on public.notificacoes;
drop function if exists public.push_dispatch_notificacao();

-- ============================================================================
-- 13. VIEW PÚBLICA lojas_publicas — versão FINAL (todas as colunas). POR ÚLTIMO,
--     pois depende de todas as colunas de `lojas` criadas acima.
-- ============================================================================
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, fotos_fachada, taxa_entrega, website_url, created_at,
         (stripe_onboarded and stripe_account_id is not null) as aceita_pagamento_online,
         distancia_maxima_entrega
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

commit;

-- ============================================================================
-- VERIFICAÇÃO RÁPIDA (rode manualmente após aplicar):
--   select public.calcular_taxa_entrega(2.3);   -- 5.30
--   select website_url, aceita_pagamento_online, distancia_maxima_entrega
--     from public.lojas_publicas limit 1;
--   select tablename from pg_publication_tables
--     where pubname='supabase_realtime' and tablename='notificacoes';   -- 1 linha
--   select table_name from information_schema.tables where table_schema='public'
--     and table_name in ('pedidos_clientes','pedidos_pendentes','pontos_clientes',
--       'notificacoes','push_subscriptions');                            -- 5 linhas
--   -- Paywall: como authenticated, este update NÃO deve mudar o plano:
--   -- update public.lojas set plano='ativo' where id='<sua_loja>';
-- ============================================================================
