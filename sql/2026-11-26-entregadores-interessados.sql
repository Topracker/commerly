-- ============================================================================
-- Lista de espera de entregadores — 2026-11-26
-- APLICADO em produção em 2026-11-26 (via MCP do Supabase).
-- ----------------------------------------------------------------------------
-- Recrutamento SEM ligar o delivery: /entregador/em-breve coleta o interesse e
-- NÃO cria conta de entregador. Vira a base para cadastrar de verdade quando o
-- bairro abrir (admin mostra a contagem por bairro ao lado da flag).
--
-- RLS ligada e SEM policy de propósito: só o service role lê/escreve, pela rota
-- /api/publico/entregador-interesse (com rate limit). Telefone é a chave: o
-- mesmo número reenviando o formulário ATUALIZA a linha, não duplica.
-- ============================================================================

create table if not exists public.entregadores_interessados (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  telefone text not null unique check (telefone ~ '^[0-9]{10,13}$'),
  cidade text not null check (char_length(cidade) between 2 and 80),
  cidade_slug text not null,
  bairro text not null check (char_length(bairro) between 2 and 80),
  bairro_slug text not null,
  tem_moto boolean not null,
  tem_cnh boolean not null,
  codigo_indicacao text,
  origem text,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.entregadores_interessados enable row level security;
create index if not exists entregadores_interessados_area_idx
  on public.entregadores_interessados (cidade_slug, bairro_slug);
