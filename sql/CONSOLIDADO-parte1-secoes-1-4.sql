-- ============================================================================
-- COMMERLY - CONSOLIDADO PARTE 1/3 (secoes 1-4)
-- Colunas de lojas | Paywall (trigger+RLS) | Validacoes de cadastro | Storage
--
-- Rode ESTA parte PRIMEIRO no SQL Editor do Supabase (producao).
-- Ordem: Parte 1 -> Parte 2 -> Parte 3.
-- Idempotente e envolto em begin/commit (all-or-nothing).
-- ============================================================================

begin;

-- ============================================================================
-- 1. TABELA lojas - colunas novas (cobranca + features). latitude/longitude
--    ja existem (google-maps aplicado). Tudo add-if-not-exists.
-- ============================================================================
-- Cobranca (blindadas pelo trigger da secao 2).
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

-- Backfill: migra a foto unica legada para o array, se ainda estiver vazio.
update public.lojas
   set fotos_fachada = array[foto_fachada_url]
 where foto_fachada_url is not null
   and foto_fachada_url <> ''
   and (fotos_fachada is null or array_length(fotos_fachada, 1) is null);

-- ============================================================================
-- 2. SEGURANCA DO PAYWALL - trigger que blinda os campos de cobranca de lojas
--    contra escrita por anon/authenticated (so service role/webhooks alteram).
-- ============================================================================
create or replace function public.lojas_bloqueia_cobranca_cliente()
returns trigger
language plpgsql
security invoker
as $$
begin
  -- Papeis administrativos/servidor nao sao restringidos.
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
-- 2.1 RLS de lojas - escopo por dono (leitura publica e pela view definer).
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
-- 3. VALIDACOES DE CADASTRO - colunas + indices de anti-duplicacao.
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
-- 4. STORAGE - bucket publico "lojas" (fotos de fachada) + policies.
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

commit;

-- FIM DA PARTE 1/3 - em seguida rode a Parte 2 (secoes 5-9).
