-- ============================================================================
-- AUDITORIA DE ACESSO AO PAINEL MASTER
-- ----------------------------------------------------------------------------
-- Toda tentativa de abrir o painel vira uma linha aqui — aprovada OU negada.
-- Sendo conta única, negativa é sinal: se aparecer `permitido=false` com um
-- user_id que não é o seu, alguém descobriu o caminho e está batendo na porta.
--
-- Escrita e leitura SÓ por service role (`app/lib/admin.ts`). RLS ligada e
-- ZERO policies de propósito: `authenticated` não lê nem escreve nada aqui.
-- (Service role ignora RLS — é assim que a rota grava.)
--
-- STATUS: APLICADO em produção em 2026-09-19 via MCP do Supabase (migração
-- `admin_auditoria_2026_09_18`). Conferido: 9 colunas, 3 índices, RLS on, 0 policies.
-- Enquanto não for aplicado, o app funciona normal: o insert da auditoria é
-- best-effort e só emite um console.warn.
-- ============================================================================

create table if not exists public.admin_acessos (
  id uuid primary key default gen_random_uuid()
);

-- Colunas em ALTER separado: `create table if not exists` NÃO adiciona coluna
-- em tabela que já existe (regra 3 do CLAUDE.md — isso já matou o push por
-- 3 semanas com um 500 mudo).
alter table public.admin_acessos add column if not exists user_id    uuid;
alter table public.admin_acessos add column if not exists email      text;
alter table public.admin_acessos add column if not exists rota       text;
alter table public.admin_acessos add column if not exists ip         text;
alter table public.admin_acessos add column if not exists user_agent text;
alter table public.admin_acessos add column if not exists permitido  boolean not null default false;
alter table public.admin_acessos add column if not exists motivo     text;
alter table public.admin_acessos add column if not exists created_at timestamptz not null default now();

create index if not exists admin_acessos_created_idx
  on public.admin_acessos (created_at desc);

-- Índice parcial: a consulta que importa é "quem tentou e NÃO entrou".
create index if not exists admin_acessos_negados_idx
  on public.admin_acessos (created_at desc)
  where permitido = false;

alter table public.admin_acessos enable row level security;

-- Sem policies. Intencional: nenhum papel do app (anon/authenticated) enxerga
-- esta tabela. Se um dia o painel for ler daqui, a leitura passa pela rota com
-- service role, nunca pelo navegador.

comment on table public.admin_acessos is
  'Auditoria de acesso ao painel master. Só service role escreve/lê. Ver app/lib/admin.ts.';
