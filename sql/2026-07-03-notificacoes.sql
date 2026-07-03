-- Notificações em tempo real (Supabase Realtime).
--
-- Uma única tabela `notificacoes` para os TRÊS papéis (comerciante, cliente,
-- entregador). O destinatário é sempre um `auth.users.id` (lojas.user_id,
-- clientes.user_id ou entregadores.user_id), o que torna a RLS trivial:
-- cada um vê/atualiza apenas `where user_id = auth.uid()`.
--
-- As notificações são criadas por TRIGGERS (security definer), não pelo app —
-- assim o destinatário (que não é quem faz a ação) não precisa de permissão de
-- INSERT e ninguém consegue forjar notificação de terceiros. Eventos:
--   1. Novo pedido      -> notifica o dono da loja           (INSERT pedidos_clientes)
--   2. Status do pedido -> notifica o cliente                (UPDATE pedidos_clientes)
--   3. Parceria aceita  -> notifica o entregador             (UPDATE entregador_parcerias)
--
-- O app assina Realtime na tabela filtrando por user_id e recebe cada INSERT.
--
-- Rode no SQL Editor do Supabase (produção). Tudo é idempotente.

-- ===========================================================================
-- 1. TABELA
-- ===========================================================================
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, -- destinatário
  tipo text not null check (tipo in ('pedido_novo', 'pedido_status', 'parceria_aceita')),
  titulo text not null,
  mensagem text not null,
  link text,                          -- para onde navegar ao clicar
  dados jsonb not null default '{}',  -- ids extras (pedido_id, loja_id, status...)
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificacoes_user on public.notificacoes (user_id, created_at desc);
create index if not exists idx_notificacoes_nao_lidas on public.notificacoes (user_id) where not lida;

-- ===========================================================================
-- 2. RLS: cada um só enxerga/mexe nas próprias. Sem policy de INSERT — as
--    notificações entram só pelos triggers (security definer, bypass de RLS).
-- ===========================================================================
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

-- ===========================================================================
-- 3. TRIGGERS geradores (security definer p/ ler user_id de outras tabelas)
-- ===========================================================================

-- 3.1 Novo pedido -> dono da loja
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

-- 3.2 Mudança de status -> cliente (Preparando, Saiu, Entregue, Cancelado)
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

-- 3.3 Parceria aceita -> entregador
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

-- ===========================================================================
-- 4. REALTIME: adiciona a tabela à publicação do Supabase Realtime.
-- ===========================================================================
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

-- ===========================================================================
-- 5. Verificação (rode manualmente após aplicar):
--   select tablename from pg_publication_tables
--     where pubname='supabase_realtime' and tablename='notificacoes';  -- 1 linha
--   -- Dispara um teste: mude o status de um pedido e veja a notificação do cliente:
--   -- update public.pedidos_clientes set status='preparando' where id='<uuid>';
--   -- select * from public.notificacoes order by created_at desc limit 5;
-- ===========================================================================
