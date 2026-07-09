-- ============================================================================
-- Commerly — 2026-07-12
-- WhatsApp Commerce: número de WhatsApp Business da loja.
--
-- O comerciante informa o número em Configurações; as páginas públicas
-- (/loja/[id], /cliente/loja/[id]) e o cardápio digital (/cardapio/[id]) usam-no
-- para montar um link wa.me com o texto do pedido já preenchido.
--
-- Quando o campo está vazio, o front cai no `telefone` da loja (ver
-- `whatsappDaLoja` em app/lib/whatsapp.ts) — nenhuma loja perde o botão.
--
-- Idempotente.
-- ============================================================================

alter table public.lojas add column if not exists whatsapp_business text;

-- View pública: acrescenta `whatsapp_business` para que as páginas públicas
-- leiam o número sem acesso direto à tabela `lojas` (RLS restritivo).
--
-- `create or replace` (em vez de `drop view`) preserva as dependências que já
-- existem sobre a view. Ele exige que as colunas antigas mantenham nome, tipo e
-- ORDEM — por isso a nova entra no fim. A lista abaixo reproduz a definição em
-- produção (inclui `destaque`, do Commerly Ads).
create or replace view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, fotos_fachada, taxa_entrega,
         distancia_maxima_entrega, website_url, created_at,
         (stripe_onboarded = true and stripe_account_id is not null) as aceita_pagamento_online,
         (destaque_ate is not null and destaque_ate > now()) as destaque,
         whatsapp_business
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

-- Verificação:
-- select id, whatsapp_business from public.lojas_publicas limit 1;
