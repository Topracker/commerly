-- =============================================================================
-- Tabela de origem de clique — mede de onde vem a visita em /conheca
-- =============================================================================
-- STATUS: PRONTO, AINDA NÃO APLICADO (preparado em 2026-11-26; esta sessão não
--   tem acesso ao MCP do Supabase pra rodar). Rode este arquivo e confira com
--   o SELECT no fim.
--
-- Por quê: o panfleto físico tem um QR que aponta pra /conheca?origem=panfleto.
-- Pra saber se o panfleto deu retorno de verdade (e comparar com outros canais
-- — Instagram, indicação, etc.) a visita registra a origem aqui. Append-only,
-- sem dado pessoal (não tem IP, não tem user, só o rótulo da origem).
--
-- Rota que escreve: app/api/conheca/origem/route.ts (POST, público, sem auth,
-- rate-limited por IP). Ninguém lê de volta pelo site — leitura é manual
-- (painel admin, se/quando criar uma tela pra isso) ou direto no SQL editor.
-- =============================================================================

begin;

create table if not exists public.cliques_origem (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (char_length(origem) <= 60),
  pagina text,
  created_at timestamptz not null default now()
);

create index if not exists cliques_origem_origem_idx on public.cliques_origem (origem, created_at desc);

alter table public.cliques_origem enable row level security;

-- Só o service_role escreve (a rota usa supabase-admin). Sem policy de
-- select/insert para anon/authenticated de propósito — ninguém no cliente
-- precisa ler ou escrever aqui direto.
drop policy if exists "cliques_origem_service_role" on public.cliques_origem;
create policy "cliques_origem_service_role" on public.cliques_origem
  for all to service_role using (true) with check (true);

commit;

-- ---------------------------------------------------------------------------
-- Conferência pós-aplicação:
--   insert into public.cliques_origem (origem, pagina) values ('teste', '/conheca');
--   select * from public.cliques_origem order by created_at desc limit 5;
--   (depois apague a linha de teste)
-- ---------------------------------------------------------------------------
