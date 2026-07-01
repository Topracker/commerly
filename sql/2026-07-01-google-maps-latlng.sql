-- Google Maps: coordenadas de lojas e fornecedores.
--
-- Rode este SQL no SQL Editor do Supabase (produção) ANTES do deploy com o
-- mapa de comércios e a distância dos fornecedores.
--
-- O que ele faz:
--   1. Adiciona `latitude` / `longitude` (double precision) em `lojas` e
--      `fornecedores` — preenchidas pelo autocomplete do Google no cadastro.
--   2. Recria a view pública `lojas_publicas` expondo lat/long, para o mapa
--      em /cliente/buscar poder plotar os pins sem dar acesso à tabela `lojas`.
--
-- Tudo é idempotente — pode rodar mais de uma vez sem problema.

alter table public.lojas        add column if not exists latitude  double precision;
alter table public.lojas        add column if not exists longitude double precision;
alter table public.fornecedores add column if not exists latitude  double precision;
alter table public.fornecedores add column if not exists longitude double precision;

-- View pública: só as colunas seguras + coordenadas. security_invoker=false
-- (security definer) para que anon/authenticated enxerguem as lojas mesmo com
-- o RLS restritivo da tabela base. Recriamos para incluir latitude/longitude.
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, created_at
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

-- Verificação (deve retornar > 0 se houver lojas cadastradas):
-- select count(*) from public.lojas_publicas;
