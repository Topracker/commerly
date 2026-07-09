-- ============================================================================
-- Commerly — 2026-07-14
-- Feed Social: posts, stories (24h), likes, comentários, seguidores e métricas.
--
-- Modelo:
--   loja_seguidores  — cliente segue loja (o feed prioriza quem ele segue)
--   posts            — foto/vídeo com legenda, opcionalmente marcando um produto
--   stories          — igual, mas expira em 24h (`expira_em`)
--   post_likes       — 1 curtida por cliente/post
--   post_comentarios — texto livre
--   post_eventos     — 'view' e 'pedir' (clique em "Pedir agora"), 1 por
--                      cliente/post/tipo. É o que alimenta as métricas.
--
-- As métricas saem da view `posts_metricas` (security_invoker: cada um só vê o
-- que a RLS deixa).
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Corrige o CHECK de `notificacoes.tipo`.
--
-- BUG PRÉ-EXISTENTE: /api/campanha-retorno insere `tipo = 'cupom'`, que o CHECK
-- atual rejeita — a notificação da campanha nunca chegou a ninguém (0 linhas em
-- produção). Aproveitamos para permitir 'cupom' e o novo 'post_novo'.
-- ---------------------------------------------------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('pedido_novo', 'pedido_status', 'parceria_aceita', 'corrida_oferta', 'cupom', 'post_novo'));

-- ---------------------------------------------------------------------------
-- 1. Seguidores
-- ---------------------------------------------------------------------------
create table if not exists public.loja_seguidores (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists loja_seguidores_uniq on public.loja_seguidores (loja_id, cliente_id);
create index if not exists loja_seguidores_cliente_idx on public.loja_seguidores (cliente_id);

alter table public.loja_seguidores enable row level security;

-- Contagem de seguidores é pública (aparece na página da loja).
drop policy if exists loja_seguidores_select on public.loja_seguidores;
create policy loja_seguidores_select on public.loja_seguidores for select using (true);

drop policy if exists loja_seguidores_cliente on public.loja_seguidores;
create policy loja_seguidores_cliente on public.loja_seguidores
  for all
  using (cliente_id in (select id from public.clientes where user_id = auth.uid()))
  with check (cliente_id in (select id from public.clientes where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Posts e Stories
--
-- Mesmas colunas; a diferença é `expira_em`, que só o story tem. Duas tabelas em
-- vez de uma com flag: o feed lê posts sem filtro de tempo o tempo todo, e o
-- índice parcial de stories vivos fica limpo.
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  tipo text not null check (tipo in ('foto', 'video')),
  midia_url text not null,
  legenda text,
  -- Produto marcado: alimenta o botão "Pedir agora". `set null` porque apagar um
  -- produto não deve apagar o post que o divulgou.
  produto_id uuid references public.produtos(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists posts_loja_idx on public.posts (loja_id);
create index if not exists posts_recentes_idx on public.posts (created_at desc);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  tipo text not null check (tipo in ('foto', 'video')),
  midia_url text not null,
  produto_id uuid references public.produtos(id) on delete set null,
  created_at timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '24 hours'
);

-- Não dá para fazer um índice parcial `where expira_em > now()`: o predicado
-- precisa ser IMMUTABLE e `now()` não é. Índice comum em `expira_em`, que é o
-- filtro de toda leitura de story.
create index if not exists stories_expira_idx on public.stories (expira_em desc);
create index if not exists stories_loja_idx on public.stories (loja_id, created_at desc);

alter table public.posts enable row level security;
alter table public.stories enable row level security;

-- Leitura pública: o feed do cliente e as páginas da loja.
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select using (true);

drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories for select using (true);

-- Escrita: só o dono da loja.
drop policy if exists posts_loja_write on public.posts;
create policy posts_loja_write on public.posts
  for all
  using (loja_id in (select id from public.lojas where user_id = auth.uid()))
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));

drop policy if exists stories_loja_write on public.stories;
create policy stories_loja_write on public.stories
  for all
  using (loja_id in (select id from public.lojas where user_id = auth.uid()))
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Likes e comentários
-- ---------------------------------------------------------------------------
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists post_likes_uniq on public.post_likes (post_id, cliente_id);

create table if not exists public.post_comentarios (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  texto text not null check (length(trim(texto)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists post_comentarios_post_idx on public.post_comentarios (post_id, created_at);

alter table public.post_likes enable row level security;
alter table public.post_comentarios enable row level security;

drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes for select using (true);

drop policy if exists post_likes_cliente on public.post_likes;
create policy post_likes_cliente on public.post_likes
  for all
  using (cliente_id in (select id from public.clientes where user_id = auth.uid()))
  with check (cliente_id in (select id from public.clientes where user_id = auth.uid()));

drop policy if exists post_comentarios_select on public.post_comentarios;
create policy post_comentarios_select on public.post_comentarios for select using (true);

drop policy if exists post_comentarios_cliente on public.post_comentarios;
create policy post_comentarios_cliente on public.post_comentarios
  for all
  using (cliente_id in (select id from public.clientes where user_id = auth.uid()))
  with check (cliente_id in (select id from public.clientes where user_id = auth.uid()));

-- O dono da loja pode apagar comentário no post dele (moderação).
drop policy if exists post_comentarios_loja_delete on public.post_comentarios;
create policy post_comentarios_loja_delete on public.post_comentarios
  for delete
  using (post_id in (
    select p.id from public.posts p
    join public.lojas l on l.id = p.loja_id
    where l.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- 4. Eventos (métricas)
--
-- 'view'  = o post entrou na tela do cliente
-- 'pedir' = clicou em "Pedir agora"
-- O índice único faz do INSERT repetido um no-op (upsert ignora duplicata), então
-- as métricas contam CLIENTES ÚNICOS, não impressões.
-- ---------------------------------------------------------------------------
create table if not exists public.post_eventos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null check (tipo in ('view', 'pedir')),
  created_at timestamptz not null default now()
);

create unique index if not exists post_eventos_uniq on public.post_eventos (post_id, cliente_id, tipo);

alter table public.post_eventos enable row level security;

-- O cliente grava os próprios eventos.
drop policy if exists post_eventos_cliente_insert on public.post_eventos;
create policy post_eventos_cliente_insert on public.post_eventos
  for insert
  with check (cliente_id in (select id from public.clientes where user_id = auth.uid()));

-- Quem lê: o cliente (os seus) e o dono da loja (os do post dele) — é o que
-- alimenta as métricas do painel.
drop policy if exists post_eventos_select on public.post_eventos;
create policy post_eventos_select on public.post_eventos
  for select
  using (
    cliente_id in (select id from public.clientes where user_id = auth.uid())
    or post_id in (
      select p.id from public.posts p
      join public.lojas l on l.id = p.loja_id
      where l.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Métricas agregadas
--
-- `security_invoker = true`: a view roda com as permissões de quem consulta, então
-- a RLS de `post_eventos` continua valendo (o cliente não enxerga as métricas de
-- ninguém). É o oposto de `lojas_publicas`, que é security definer de propósito.
-- ---------------------------------------------------------------------------
create or replace view public.posts_metricas
  with (security_invoker = true) as
  select
    p.id as post_id,
    p.loja_id,
    (select count(*) from public.post_likes pl where pl.post_id = p.id) as likes,
    (select count(*) from public.post_comentarios pc where pc.post_id = p.id) as comentarios,
    (select count(*) from public.post_eventos pe where pe.post_id = p.id and pe.tipo = 'view') as visualizacoes,
    (select count(*) from public.post_eventos pe where pe.post_id = p.id and pe.tipo = 'pedir') as cliques_pedir
  from public.posts p;

grant select on public.posts_metricas to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Notificação para os seguidores quando a loja publica um post
--
-- SECURITY DEFINER: o comerciante não tem permissão de escrever em
-- `notificacoes` de outros usuários — o trigger escreve por ele.
-- ---------------------------------------------------------------------------
create or replace function public.notif_post_novo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare loja_nome text;
begin
  select nome into loja_nome from public.lojas where id = new.loja_id;

  insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)
  select c.user_id,
         'post_novo',
         coalesce(loja_nome, 'Uma loja') || ' publicou algo novo',
         coalesce(nullif(trim(new.legenda), ''), 'Toque para ver a novidade.'),
         '/cliente/feed',
         jsonb_build_object('loja_id', new.loja_id, 'post_id', new.id)
    from public.loja_seguidores s
    join public.clientes c on c.id = s.cliente_id
   where s.loja_id = new.loja_id
     and c.user_id is not null;

  return new;
end;
$$;

drop trigger if exists trg_notif_post_novo on public.posts;
create trigger trg_notif_post_novo
  after insert on public.posts
  for each row execute function public.notif_post_novo();

-- ---------------------------------------------------------------------------
-- 7. Bucket de mídia do feed (fotos e vídeos curtos)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('feed', 'feed', true)
  on conflict (id) do nothing;

drop policy if exists feed_public_read on storage.objects;
create policy feed_public_read on storage.objects
  for select using (bucket_id = 'feed');

-- Só comerciante logado publica. O app grava em `feed/{loja_id}/...`.
drop policy if exists feed_loja_insert on storage.objects;
create policy feed_loja_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feed' and (storage.foldername(name))[1] in (
    select id::text from public.lojas where user_id = auth.uid()
  ));

drop policy if exists feed_loja_delete on storage.objects;
create policy feed_loja_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'feed' and (storage.foldername(name))[1] in (
    select id::text from public.lojas where user_id = auth.uid()
  ));

-- Verificação:
-- select * from public.posts_metricas limit 5;
