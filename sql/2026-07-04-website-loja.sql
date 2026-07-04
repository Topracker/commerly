-- Website da loja (URL opcional do site próprio do comerciante).
--
-- Rode este SQL no SQL Editor do Supabase (produção) ANTES do deploy com o
-- campo "Website da loja" no onboarding/configurações e o botão "Visitar site"
-- nas páginas públicas.
--
-- O que ele faz:
--   1. Adiciona a coluna `website_url` (text) na tabela `lojas`.
--   2. Recria a view pública `lojas_publicas` incluindo `website_url`, para as
--      páginas públicas (/loja/[id] e /cliente/loja/[id]) mostrarem o botão
--      sem dar acesso direto à tabela `lojas`.
--
-- Tudo é idempotente — pode rodar mais de uma vez sem problema. A lista de
-- colunas da view reproduz a definição atual (com taxa_entrega, distância
-- máxima e aceita_pagamento_online) e só acrescenta website_url.

alter table public.lojas add column if not exists website_url text;

-- View pública: recriada para incluir website_url. security_invoker=false
-- (security definer) para que anon/authenticated enxerguem as lojas mesmo com
-- o RLS restritivo da tabela base.
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, fotos_fachada, taxa_entrega, website_url, created_at,
         (stripe_onboarded and stripe_account_id is not null) as aceita_pagamento_online,
         distancia_maxima_entrega
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

-- Verificação:
-- select id, website_url from public.lojas_publicas limit 1;
