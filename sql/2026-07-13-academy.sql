-- ============================================================================
-- Commerly — 2026-07-13
-- Commerly Academy: progresso do comerciante nas mini aulas.
--
-- O CONTEÚDO das aulas mora no código (app/lib/academy.ts), não no banco: são
-- textos estáveis, versionados junto com as features que ensinam. Aqui guardamos
-- apenas quais aulas cada loja concluiu.
--
-- `aula_slug` referencia `Aula.slug` do TypeScript. Não há FK possível; o app
-- ignora slugs desconhecidos (ver `aulaValida`), então remover uma aula do código
-- não quebra nada — só some do progresso.
--
-- Idempotente.
-- ============================================================================

create table if not exists public.academy_progresso (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  aula_slug text not null,
  concluida_em timestamptz not null default now()
);

-- Uma aula só pode ser concluída uma vez por loja. É o que permite usar
-- `upsert ... on conflict do nothing` no app sem duplicar linhas.
create unique index if not exists academy_progresso_loja_aula_uniq
  on public.academy_progresso (loja_id, aula_slug);

-- Leitura mais frequente: "quais aulas esta loja concluiu".
create index if not exists academy_progresso_loja_idx
  on public.academy_progresso (loja_id);

alter table public.academy_progresso enable row level security;

-- Progresso é privado do comerciante: sem policy de leitura pública (ao
-- contrário de `combos`, que tem `select_public` para as páginas da loja).
drop policy if exists academy_progresso_loja on public.academy_progresso;
create policy academy_progresso_loja on public.academy_progresso
  for all
  using (loja_id in (select id from public.lojas where user_id = auth.uid()))
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));

-- Verificação:
-- select aula_slug, concluida_em from public.academy_progresso where loja_id = '...';
