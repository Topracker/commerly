-- Web Push Notifications (PWA nativo do navegador).
--
-- Guarda as "subscriptions" (endpoint + chaves) de cada dispositivo/navegador
-- de um usuário. Um usuário pode ter várias (celular, desktop, etc.). O envio
-- do push é feito no servidor Next (rota /api/push/send) com as VAPID keys.
--
-- A ponte banco -> servidor reusa a tabela `notificacoes` que já existe
-- (sql/2026-07-03-notificacoes.sql): toda notificação criada pelos triggers
-- (pedido novo -> comerciante, status -> cliente, parceria -> entregador)
-- dispara AQUI um trigger que chama /api/push/send via pg_net. Ou seja: um
-- único ponto central envia push para os TRÊS papéis, inclusive com o app
-- fechado (o push é entregue pelo push service do navegador).
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
-- 3. PONTE banco -> servidor via pg_net.
--    A cada nova linha em `notificacoes`, chama /api/push/send passando o
--    destinatário e o texto. O servidor busca as subscriptions e dispara o push.
--
--    CONFIGURAÇÃO (rode UMA vez, com os seus valores reais — NÃO versionar o
--    segredo). Preferimos GUCs para manter o segredo fora do corpo da função:
--
--      alter database postgres set app.settings.push_endpoint =
--        'https://SEU-DOMINIO/api/push/send';
--      alter database postgres set app.settings.push_secret =
--        'MESMO_VALOR_DE_PUSH_DISPATCH_SECRET';
--
--    Depois rode `select pg_reload_conf();` (ou reconecte) para os GUCs valerem.
-- ===========================================================================
create extension if not exists pg_net;

create or replace function public.push_dispatch_notificacao()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  endpoint text := current_setting('app.settings.push_endpoint', true);
  secret   text := current_setting('app.settings.push_secret', true);
begin
  -- Sem configuração, não faz nada (a notificação in-app continua funcionando).
  if endpoint is null or endpoint = '' then
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || coalesce(secret, '')
               ),
    body    := jsonb_build_object(
                 'user_id',  new.user_id,
                 'tipo',     new.tipo,
                 'titulo',   new.titulo,
                 'mensagem', new.mensagem,
                 'link',     new.link,
                 'dados',    new.dados
               )
  );
  return new;
exception when others then
  -- Push é um extra: nunca deixe a falha do envio quebrar o INSERT da notificação.
  return new;
end; $$;

drop trigger if exists trg_push_dispatch on public.notificacoes;
create trigger trg_push_dispatch after insert on public.notificacoes
  for each row execute function public.push_dispatch_notificacao();

-- ===========================================================================
-- 4. Verificação (após configurar os GUCs e publicar o app):
--   select current_setting('app.settings.push_endpoint', true);   -- sua URL
--   -- Dispare um teste inserindo uma notificação de teste para o seu user:
--   -- insert into public.notificacoes (user_id, tipo, titulo, mensagem, link)
--   --   values ('<seu-auth-uid>', 'pedido_novo', 'Teste', 'Push funcionando!', '/');
--   -- e confira o push no dispositivo inscrito. Veja a fila do pg_net:
--   -- select * from net._http_response order by created desc limit 5;
-- ===========================================================================
