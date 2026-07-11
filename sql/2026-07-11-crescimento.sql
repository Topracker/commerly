-- ============================================================================
-- Commerly — Fundação de CRESCIMENTO (ecossistema / efeito de rede)
-- 2026-07-11
-- ----------------------------------------------------------------------------
-- Backbone das mecânicas de comunidade: expansão por cidades, indicações,
-- fundadores, feed de conquistas ao vivo e XP.
--
-- Padrão de acesso: tudo é lido/escrito por rotas server-side com service role
-- (como o resto do app — ver /api/cliente/lojas). Por isso as tabelas ficam com
-- RLS LIGADO e SEM policies (bloqueadas para anon/authenticated); o bypass do
-- service role é quem serve os dados públicos, já filtrados.
-- ============================================================================

-- Pontuação de cada ação na corrida das cidades (fonte única de verdade).
-- cliente=+1, download=+2, entregador=+15, comerciante=+30, indicacao=+5,
-- missao=+10, evento=+20.

-- ---------------------------------------------------------------------------
-- Cidades em expansão
-- ---------------------------------------------------------------------------
create table if not exists public.cidades_expansao (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  uf          text not null,
  slug        text not null unique,
  meta_pontos integer not null default 500,
  pontos      integer not null default 0,
  -- pre = pré-cadastro | analise = juntando pontos | lancando = evento de
  -- lançamento | ativa = delivery disponível
  status      text not null default 'analise'
              check (status in ('pre','analise','lancando','ativa')),
  lancada_em  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.cidades_expansao enable row level security;

-- Log de pontos por cidade (auditável; a soma alimenta cidades_expansao.pontos).
create table if not exists public.expansao_pontos (
  id         uuid primary key default gen_random_uuid(),
  cidade_id  uuid not null references public.cidades_expansao(id) on delete cascade,
  user_id    uuid,
  tipo       text not null,
  pontos     integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_expansao_pontos_cidade on public.expansao_pontos(cidade_id);
alter table public.expansao_pontos enable row level security;

-- Recalcula o total da cidade sempre que entra/atualiza um evento de pontos.
create or replace function public.recalc_pontos_cidade() returns trigger
language plpgsql security definer as $$
declare cid uuid;
begin
  cid := coalesce(new.cidade_id, old.cidade_id);
  update public.cidades_expansao c
     set pontos = coalesce((select sum(pontos) from public.expansao_pontos where cidade_id = cid), 0)
   where c.id = cid;
  return null;
end; $$;
drop trigger if exists trg_recalc_pontos_cidade on public.expansao_pontos;
create trigger trg_recalc_pontos_cidade
after insert or update or delete on public.expansao_pontos
for each row execute function public.recalc_pontos_cidade();

-- Lista de espera / pré-cadastro por cidade (delivery indisponível ainda).
create table if not exists public.expansao_interesse (
  id         uuid primary key default gen_random_uuid(),
  cidade_slug text,
  cidade_nome text,
  uf         text,
  email      text not null,
  nome       text,
  papel      text default 'cliente',
  created_at timestamptz not null default now()
);
create index if not exists idx_expansao_interesse_slug on public.expansao_interesse(cidade_slug);
alter table public.expansao_interesse enable row level security;

-- ---------------------------------------------------------------------------
-- Indicações (referral)
-- ---------------------------------------------------------------------------
-- Código único por usuário (tipo PEDRO123). Um usuário só tem um código ativo.
create table if not exists public.codigos_indicacao (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique,
  papel      text not null,           -- comerciante | cliente | entregador | fornecedor
  codigo     text not null unique,
  usos       integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.codigos_indicacao enable row level security;

create table if not exists public.indicacoes (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null,
  indicador_user_id uuid,
  indicado_user_id  uuid,
  papel_indicado    text,
  status            text not null default 'pendente'
                    check (status in ('pendente','confirmada','recompensada')),
  recompensa        text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_indicacoes_codigo on public.indicacoes(codigo);
create index if not exists idx_indicacoes_indicador on public.indicacoes(indicador_user_id);
alter table public.indicacoes enable row level security;

-- ---------------------------------------------------------------------------
-- Fundadores (primeiros 50 comerciantes)
-- ---------------------------------------------------------------------------
create table if not exists public.fundadores (
  id         uuid primary key default gen_random_uuid(),
  loja_id    uuid not null unique references public.lojas(id) on delete cascade,
  ordem      integer,                 -- 1..50 (posição de entrada)
  cidade     text,
  created_at timestamptz not null default now()
);
alter table public.fundadores enable row level security;

-- ---------------------------------------------------------------------------
-- Feed de conquistas ao vivo (homepage)
-- ---------------------------------------------------------------------------
create table if not exists public.feed_conquistas (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null default 'geral',  -- entrou | nivel | cidade | marco | geral
  texto      text not null,
  cidade     text,
  created_at timestamptz not null default now()
);
create index if not exists idx_feed_conquistas_data on public.feed_conquistas(created_at desc);
alter table public.feed_conquistas enable row level security;

-- ---------------------------------------------------------------------------
-- XP dos usuários (gamificação; nível derivado no código)
-- ---------------------------------------------------------------------------
create table if not exists public.xp_usuarios (
  user_id    uuid primary key,
  papel      text,
  xp         integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.xp_usuarios enable row level security;

-- ---------------------------------------------------------------------------
-- Seeds — cidades iniciais e alguns itens de feed (placeholders vivos)
-- ---------------------------------------------------------------------------
insert into public.cidades_expansao (nome, uf, slug, meta_pontos, pontos, status)
values
  ('Goiânia', 'GO', 'goiania', 800, 640, 'analise'),
  ('Uberlândia', 'MG', 'uberlandia', 800, 510, 'analise'),
  ('Anápolis', 'GO', 'anapolis', 500, 300, 'analise'),
  ('Aparecida de Goiânia', 'GO', 'aparecida-de-goiania', 500, 180, 'analise'),
  ('Brasília', 'DF', 'brasilia', 1000, 260, 'analise')
on conflict (slug) do nothing;

insert into public.feed_conquistas (tipo, texto, cidade)
values
  ('cidade', '🎉 Goiânia passou Uberlândia no ranking', 'Goiânia'),
  ('entrou', '🎉 Mercado Silva entrou na Commerly', 'Goiânia'),
  ('nivel', '🎉 João virou Ouro', 'Anápolis'),
  ('marco', '🚀 A Commerly passou de 100 pedidos!', null)
on conflict do nothing;
