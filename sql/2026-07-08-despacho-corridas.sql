-- Despacho de corridas estilo iFood/Uber.
--
-- Substitui o modelo "entregador so recebe pedidos de loja com parceria" por um
-- POOL de entregadores disponiveis: qualquer entregador cadastrado que esteja
-- Online e proximo da loja pode receber uma corrida, tenha parceria ou nao.
--
-- Fluxo:
--   1. Entregador fica Online (entregadores.disponivel = true) e o app envia a
--      posicao atual (latitude/longitude/localizacao_at) a cada poucos segundos.
--   2. Comerciante, num pedido sem entregador, toca "Buscar entregador proximo".
--      A API busca entregadores Online num raio de 5 km, ordena por distancia e
--      OFERTA a corrida ao mais proximo (linha em corrida_ofertas, expira em 30s).
--   3. O entregador recebe a oferta em tempo real (Realtime) + push nativo, com
--      30s para aceitar ou recusar. Se recusar/expirar, a loja oferta ao proximo.
--   4. Ao aceitar, o pedido recebe entregador_id (atomico) e as demais ofertas do
--      mesmo pedido expiram. Segue o fluxo normal (saiu -> codigo -> entregue).
--
-- Rode no SQL Editor do Supabase (producao). Tudo e idempotente.

-- ===========================================================================
-- 1. ENTREGADORES: disponibilidade + posicao corrente (para o pool)
-- ===========================================================================
alter table public.entregadores add column if not exists disponivel boolean not null default false;
alter table public.entregadores add column if not exists latitude double precision;
alter table public.entregadores add column if not exists longitude double precision;
alter table public.entregadores add column if not exists localizacao_at timestamptz;

-- Indice parcial: o pool so consulta quem esta disponivel.
create index if not exists idx_entregadores_disponiveis
  on public.entregadores (disponivel) where disponivel;

-- A RLS de entregadores (entregador_update_dono) ja permite o proprio entregador
-- atualizar essas colunas. A leitura do pool e feita pela API com service role
-- (nunca expomos a posicao dos entregadores diretamente a lojas/clientes).

-- ===========================================================================
-- 2. CORRIDA_OFERTAS: oferta de um pedido a um entregador (com validade)
-- ===========================================================================
create table if not exists public.corrida_ofertas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_clientes(id) on delete cascade,
  entregador_id uuid not null references public.entregadores(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'aceita', 'recusada', 'expirada')),
  distancia_km numeric(6,2),
  expira_em timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um entregador so recebe UMA oferta por pedido (nao re-oferta a mesma corrida).
  unique (pedido_id, entregador_id)
);

create index if not exists idx_ofertas_pedido on public.corrida_ofertas (pedido_id, status);
create index if not exists idx_ofertas_entregador on public.corrida_ofertas (entregador_id, status, created_at desc);
create index if not exists idx_ofertas_loja on public.corrida_ofertas (loja_id, created_at desc);

-- Mantem updated_at.
create or replace function public.corrida_ofertas_touch()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists trg_ofertas_touch on public.corrida_ofertas;
create trigger trg_ofertas_touch before update on public.corrida_ofertas
  for each row execute function public.corrida_ofertas_touch();

alter table public.corrida_ofertas enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='corrida_ofertas'
  loop execute format('drop policy if exists %I on public.corrida_ofertas', pol.policyname); end loop;
end $$;

-- Somente leitura para authenticated. A criacao das ofertas e a resposta
-- (aceita/recusa) sao feitas pelas APIs com service role, de forma atomica.
grant select on public.corrida_ofertas to authenticated;

-- Entregador enxerga as proprias ofertas (para receber via Realtime).
create policy "ofertas_select_entregador" on public.corrida_ofertas
  for select to authenticated using (
    exists (select 1 from public.entregadores e where e.id = entregador_id and e.user_id = auth.uid())
  );
-- Comerciante enxerga as ofertas da propria loja (para acompanhar o despacho).
create policy "ofertas_select_loja" on public.corrida_ofertas
  for select to authenticated using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );

-- Entregador do POOL (sem parceria) precisa ver os detalhes do pedido enquanto
-- tem uma oferta PENDENTE dele (valor, endereco, itens, no modal da corrida).
-- Depois de aceitar, entregador_id passa a ser ele e a policy antiga ja cobre.
drop policy if exists "pedidos_select_oferta" on public.pedidos_clientes;
create policy "pedidos_select_oferta" on public.pedidos_clientes
  for select to authenticated using (
    exists (
      select 1 from public.corrida_ofertas o
        join public.entregadores e on e.id = o.entregador_id
       where o.pedido_id = pedidos_clientes.id
         and o.status = 'pendente'
         and e.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- 3. NOTIFICACAO da oferta (push nativo reusa a tabela notificacoes)
-- ===========================================================================
-- Amplia o check de tipo para aceitar a nova notificacao de corrida.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('pedido_novo', 'pedido_status', 'parceria_aceita', 'corrida_oferta'));

-- Ao criar uma oferta, grava a notificacao do entregador. O app assina o
-- Realtime de corrida_ofertas (modal com contagem) e a API dispara o push a
-- partir desta notificacao (pushDispatch por oferta_id).
create or replace function public.notif_corrida_oferta()
returns trigger language plpgsql security definer set search_path = public as $$
declare dono uuid; loja_nome text;
begin
  select user_id into dono from public.entregadores where id = new.entregador_id;
  select nome into loja_nome from public.lojas where id = new.loja_id;
  if dono is not null then
    insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)
    values (
      dono, 'corrida_oferta', 'Nova corrida! 🛵',
      'Corrida de ' || coalesce(loja_nome, 'uma loja') ||
        ' a ' || to_char(coalesce(new.distancia_km, 0), 'FM990.0') || ' km. Aceite em 30s.',
      '/entregador-delivery/dashboard',
      jsonb_build_object('oferta_id', new.id, 'pedido_id', new.pedido_id, 'loja_id', new.loja_id)
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_corrida_oferta on public.corrida_ofertas;
create trigger trg_notif_corrida_oferta after insert on public.corrida_ofertas
  for each row execute function public.notif_corrida_oferta();

-- ===========================================================================
-- 4. REALTIME: entregador recebe a INSERT da oferta em tempo real
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'corrida_ofertas'
     )
  then
    alter publication supabase_realtime add table public.corrida_ofertas;
  end if;
end $$;

-- ===========================================================================
-- 5. Verificacao (rode manualmente apos aplicar):
--   select column_name from information_schema.columns
--     where table_name='entregadores'
--       and column_name in ('disponivel','latitude','longitude','localizacao_at');  -- 4 linhas
--   select policyname from pg_policies where tablename='corrida_ofertas';           -- 2 linhas
--   select tablename from pg_publication_tables
--     where pubname='supabase_realtime' and tablename='corrida_ofertas';            -- 1 linha
-- ===========================================================================
