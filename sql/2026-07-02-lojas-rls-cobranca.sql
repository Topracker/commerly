-- Segurança do paywall: blindar os campos de cobrança da tabela `lojas` e
-- versionar as policies RLS da tabela.
--
-- Rode este SQL no SQL Editor do Supabase (produção).
-- Tudo é idempotente — pode rodar mais de uma vez sem problema.
--
-- CONTEXTO / POR QUÊ:
--   O acesso ao dashboard é liberado quando `lojas.plano = 'ativo'`. Antes
--   desta migração, o app escrevia em `lojas` pelo navegador com a anon key
--   (onboarding e configurações), e o RLS do Postgres é POR LINHA, não por
--   coluna: um usuário logado podia rodar no console
--       supabase.from('lojas').update({ plano: 'ativo' }).eq('user_id', ...)
--   e liberar o dashboard SEM PAGAR.
--
--   RLS sozinho não resolve: uma policy não enxerga o valor ANTIGO da linha
--   num UPDATE, nem restringe uma coluna específica. Por isso a proteção dos
--   campos de cobrança é feita por um TRIGGER, e o RLS cuida do escopo por
--   dono (cada um só mexe na própria loja).
--
--   Campos de cobrança (só o service role / webhooks podem alterar):
--     plano, stripe_subscription_id, mp_assinatura_id, assinatura_ciclos

-- ---------------------------------------------------------------------------
-- 0. Garante que as colunas de cobrança existem (idempotente) e o default.
-- ---------------------------------------------------------------------------
alter table public.lojas add column if not exists plano text not null default 'inativo';
alter table public.lojas add column if not exists stripe_subscription_id text;
alter table public.lojas add column if not exists mp_assinatura_id text;
alter table public.lojas add column if not exists assinatura_ciclos integer not null default 0;

alter table public.lojas alter column plano set default 'inativo';

-- ---------------------------------------------------------------------------
-- 1. TRIGGER: bloqueia alteração dos campos de cobrança pelos papéis do app.
--
--    Só `anon`/`authenticated` (o navegador) são restringidos. `service_role`
--    (webhooks Stripe/Mercado Pago via createAdminClient), `postgres` e o
--    dashboard do Supabase passam direto.
--
--    Em INSERT: força os valores seguros (plano 'inativo', sem assinatura).
--    Em UPDATE: mantém os valores antigos — a tentativa de mudar é ignorada
--    silenciosamente (o resto do update, ex. nome/endereço, é preservado).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. RLS: policies canônicas da tabela `lojas` (fonte da verdade no repo).
--
--    Escopo por dono: cada usuário autenticado só enxerga/mexe na própria
--    loja (auth.uid() = user_id). A leitura pública das lojas é feita pela
--    view `lojas_publicas` (security definer), NÃO pela tabela base — por isso
--    aqui não há policy para `anon`.
--
--    Primeiro removemos TODAS as policies existentes da tabela para que este
--    arquivo seja a definição autoritativa (remove qualquer policy antiga mais
--    permissiva que possa ter sido criada à mão no painel).
-- ---------------------------------------------------------------------------
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

-- Garante os privilégios de tabela para o papel do app (o RLS + trigger acima
-- é que restringem linha e colunas de cobrança).
grant select, insert, update, delete on public.lojas to authenticated;

create policy "lojas_select_own" on public.lojas
  for select to authenticated
  using (auth.uid() = user_id);

create policy "lojas_insert_own" on public.lojas
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "lojas_update_own" on public.lojas
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Exclusão da própria loja. Remova esta policy se não quiser permitir
-- auto-exclusão pelo comerciante.
create policy "lojas_delete_own" on public.lojas
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Verificação (rode manualmente após aplicar):
--
--   -- Como usuário logado (anon/authenticated), o update abaixo NÃO deve
--   -- mudar o plano — deve continuar 'inativo':
--   -- update public.lojas set plano = 'ativo' where id = '<sua_loja>';
--   -- select plano from public.lojas where id = '<sua_loja>';
--
--   -- Policies aplicadas:
--   select policyname, cmd from pg_policies
--     where schemaname='public' and tablename='lojas' order by policyname;
-- ---------------------------------------------------------------------------
