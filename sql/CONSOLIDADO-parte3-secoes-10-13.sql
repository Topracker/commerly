-- ============================================================================
-- COMMERLY - CONSOLIDADO PARTE 3/3 (secoes 10-13)
-- Guard final + acumulo de pontos + RLS de pedidos_clientes | Notificacoes |
-- Web Push | View lojas_publicas (final)
--
-- Rode DEPOIS das Partes 1 e 2. Ordem: Parte 1 -> Parte 2 -> Parte 3.
-- Idempotente e envolto em begin/commit (all-or-nothing).
-- Depende de: colunas de lojas (Parte 1), funcoes de taxa + pedidos_clientes
-- + pontos_clientes (Parte 2) e da tabela entregador_parcerias (ja aplicada).
--
-- APOS rodar: setar na Vercel as env do Web Push - VAPID_PUBLIC_KEY,
-- VAPID_PRIVATE_KEY, VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY.
--
-- OBS: os emojis dentro dos textos das notificacoes (secao 11) sao DADOS
-- (o texto exibido no app), nao comentarios - por isso permanecem.
-- ============================================================================

begin;

-- ============================================================================
-- 10. GUARD FINAL de pedidos_clientes (versao fidelidade) + acumulo de pontos.
--     SECURITY DEFINER: le lojas (coords/dist max) e pontos_clientes sob RLS.
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

    -- Anti-burla: fora da area de entrega -> rejeita o pedido.
    if dist is not null and max_dist is not null and dist > max_dist then
      raise exception 'Endereco fora da area de entrega. Esta loja entrega ate % km.', max_dist
        using errcode = 'P0001';
    end if;

    -- Resgate de pontos (opcional). Multiplos de 100; 100 pontos = R$ 5.
    usados := coalesce(new.pontos_usados, 0);
    if usados < 0 then usados := 0; end if;
    if usados > 0 then
      if usados % 100 <> 0 then
        raise exception 'Pontos resgatados devem ser multiplos de 100.'
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
    -- Pagamento e resgate imutaveis apos a criacao.
    new.pagamento_metodo := old.pagamento_metodo;
    new.pagamento_status := old.pagamento_status;
    new.stripe_session_id := old.stripe_session_id;
    new.stripe_payment_intent := old.stripe_payment_intent;
    new.pontos_usados := old.pontos_usados;
    new.desconto_pontos := old.desconto_pontos;
    -- Codigo de confirmacao: gera ao sair para entrega; depois imutavel.
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

-- Acumulo/debito de pontos apos criar o pedido.
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
-- 10.1 RLS de pedidos_clientes - cliente (dono), comerciante (loja),
--      entregador parceiro/atribuido. Autoritativo (remove policies antigas).
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
-- Entregador parceiro (aceito) ou ja atribuido ve os pedidos.
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
-- 11. NOTIFICACOES em tempo real - tabela + RLS + triggers + Realtime.
--     (Os emojis nas strings abaixo sao o texto exibido no app - sao dados.)
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

-- 11.2 Mudanca de status -> cliente
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

-- 11.4 Realtime: adiciona notificacoes a publicacao (se ainda nao estiver).
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
-- 12. WEB PUSH - tabela push_subscriptions + RLS. (Depois: env VAPID na Vercel.)
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
-- 13. VIEW PUBLICA lojas_publicas - versao FINAL (todas as colunas). POR ULTIMO,
--     pois depende de todas as colunas de lojas criadas na Parte 1.
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
-- FIM DA PARTE 3/3. VERIFICACAO RAPIDA (rode manualmente apos aplicar):
--   select public.calcular_taxa_entrega(2.3);   -- 5.30
--   select website_url, aceita_pagamento_online, distancia_maxima_entrega
--     from public.lojas_publicas limit 1;
--   select tablename from pg_publication_tables
--     where pubname='supabase_realtime' and tablename='notificacoes';   -- 1 linha
--   select table_name from information_schema.tables where table_schema='public'
--     and table_name in ('pedidos_clientes','pedidos_pendentes','pontos_clientes',
--       'notificacoes','push_subscriptions');                            -- 5 linhas
--   -- Paywall: como authenticated, este update NAO deve mudar o plano:
--   -- update public.lojas set plano='ativo' where id='<sua_loja>';
-- ============================================================================
