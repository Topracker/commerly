-- Web Push Notifications (PWA nativo do navegador).
--
-- Guarda as "subscriptions" (endpoint + chaves) de cada dispositivo/navegador
-- de um usuário. Um usuário pode ter várias (celular, desktop, etc.). O envio
-- do push é feito no servidor Next com as VAPID keys.
--
-- ARQUITETURA DO DISPARO (sem pg_net):
--   O push é disparado no CÓDIGO DO SERVIDOR, logo após cada escrita que gera
--   notificação. As rotas server-side (webhook do Stripe, cancelar-pedido,
--   confirmar-entrega) chamam lib/pushDispatch diretamente; as ações feitas no
--   navegador (novo pedido na entrega, avanço de status, aceite de parceria)
--   chamam a rota autenticada /api/push/dispatch. Em ambos os casos o
--   destinatário e o texto vêm das linhas que os triggers já gravaram em
--   `notificacoes` — nada é duplicado e não é preciso GUC nem pg_net.
--
-- Rode no SQL Editor do Supabase (produção). Tudo é idempotente.

-- ===========================================================================
-- 1. TABELA push_subscriptions
-- ===========================================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,          -- URL única do push service (dedup)
  p256dh text not null,                   -- chave pública do cliente (ECDH)
  auth text not null,                     -- segredo de autenticação do cliente
  user_agent text,                        -- só para diagnóstico
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subs_user on public.push_subscriptions (user_id);

-- ===========================================================================
-- 2. RLS: cada usuário administra apenas as próprias subscriptions.
--    O servidor (service role) ignora RLS para ler todas ao enviar o push.
-- ===========================================================================
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

-- ===========================================================================
-- 3. Limpeza da abordagem anterior (pg_net + GUCs), caso tenha sido aplicada.
--    O disparo agora é 100% no servidor Next — este trigger não é mais usado.
--    (Não removemos a extensão pg_net: pode estar em uso por outra coisa.)
-- ===========================================================================
drop trigger if exists trg_push_dispatch on public.notificacoes;
drop function if exists public.push_dispatch_notificacao();

-- ===========================================================================
-- 4. Verificação:
--   -- Após habilitar as notificações no app (com permissão concedida),
--   -- deve aparecer 1 linha por dispositivo inscrito:
--   select user_id, left(endpoint, 40) as endpoint, created_at
--     from public.push_subscriptions order by created_at desc limit 10;
-- ===========================================================================
