-- ============================================================================
-- FIX: lojas_publicas perdeu `destaque` (Commerly Ads) e `whatsapp_business`
--      (WhatsApp Commerce)                                          2026-07-16
--
-- A migração 2026-07-15 (features-12) recriou a view adicionando `preco_dinamico`
-- e `aceita_drone`, mas ESQUECEU de recolocar duas colunas que já existiam:
--   - `destaque`          -> do Commerly Ads (2026-07-10)
--   - `whatsapp_business` -> do WhatsApp Commerce (2026-07-12)
--
-- Consequência (bug em produção): /api/cliente/lojas seleciona `destaque` e a
-- página da loja seleciona `whatsapp_business`. Como as colunas sumiram da view,
-- a query falha ("column does not exist") e o cliente vê ZERO lojas em
-- /cliente/buscar. Esta migração recria a view com TODAS as colunas.
--
-- security_invoker = false: a view lê `lojas` com o privilégio do dono (bypassa
-- a RLS owner-only da tabela), expondo só os campos públicos.
--
-- Rode no SQL Editor do Supabase (produção). Idempotente.
-- ============================================================================
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, fotos_fachada, taxa_entrega, website_url, created_at,
         (stripe_onboarded and stripe_account_id is not null) as aceita_pagamento_online,
         distancia_maxima_entrega,
         preco_dinamico,
         aceita_drone,
         (destaque_ate is not null and destaque_ate > now()) as destaque,
         whatsapp_business
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO:
--   select id, nome, destaque, whatsapp_business, aceita_drone from public.lojas_publicas limit 3;
--   -- deve listar linhas sem erro de coluna.
-- ============================================================================
