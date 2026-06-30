-- Rode este SQL no SQL Editor do Supabase (produção).
--
-- Cria a tabela usada pelo limite anti-spam de 1 conta por dia por IP
-- (/api/cadastro/registrar). A rota grava aqui via service role e conta
-- quantos cadastros saíram do mesmo IP nas últimas 24h.
--
-- Idempotente (IF NOT EXISTS) — pode rodar mais de uma vez.

create table if not exists public.cadastro_ips (
  id         bigint generated always as identity primary key,
  ip         text not null,
  area       text,
  criado_em  timestamptz not null default now()
);

create index if not exists idx_cadastro_ips_ip_data
  on public.cadastro_ips (ip, criado_em);

-- A tabela é acessada apenas pelo backend (service role), que ignora RLS.
-- Mantemos RLS ligada sem policies, então nenhum acesso anônimo/cliente é
-- permitido — só o service role enxerga/escreve.
alter table public.cadastro_ips enable row level security;
