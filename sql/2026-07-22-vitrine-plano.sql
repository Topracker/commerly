-- ============================================================================
-- VITRINE SEGUE O PLANO — loja vencida some do lado do cliente
-- ----------------------------------------------------------------------------
-- Complementa sql/2026-07-22-paywall-rls.sql. Lá o comerciante perdeu o painel
-- e os dados; aqui a loja para de aparecer para o consumidor.
--
-- O MOTIVO é concreto: com o paywall total, uma loja vencida continuaria
-- recebendo pedidos que o dono NÃO consegue ver nem despachar. Pedido órfão —
-- cliente paga e ninguém atende. Sumir da vitrine fecha essa porta.
--
-- POR QUE UMA COLUNA E NÃO UM FILTRO NA VIEW: `lojas_publicas` não serve só à
-- vitrine. Ela também resolve NOME DE LOJA em pedidos antigos
-- (app/cliente/pedidos), no clube, no dashboard do cliente, no feed e nos chats
-- de cliente e de fornecedor. Se a loja sumisse da view, quem já comprou lá
-- veria o histórico com o nome em branco e o chat quebraria. Então a view
-- continua devolvendo a loja e passa a dizer se ela está `disponivel`; quem é
-- vitrine (buscar, /cliente/loja/[id], /cardapio/[id]) filtra por isso.
--
-- ⚠️ ARMADILHA DESTA VIEW (já mordeu antes, ver memória lojas_publicas_view_trap):
-- ela é recriada inteira a cada migração e JÁ PERDEU colunas nesse processo
-- (`destaque` e `whatsapp_business` sumiram uma vez e quebraram /cliente/buscar).
-- A lista abaixo repete TODAS as colunas de propósito. Ao mexer aqui de novo,
-- rode antes:  select pg_get_viewdef('public.lojas_publicas'::regclass, true);
-- e confira coluna por coluna.
-- ============================================================================

begin;

drop view if exists public.lojas_publicas;

create view public.lojas_publicas
with (security_invoker = false)   -- definer: a vitrine lê sem a RLS owner-only
as
select
  id,
  nome,
  tipo,
  localizacao,
  telefone,
  instagram,
  horario,
  latitude,
  longitude,
  fotos_fachada,
  taxa_entrega,
  website_url,
  created_at,
  stripe_onboarded and stripe_account_id is not null as aceita_pagamento_online,
  distancia_maxima_entrega,
  preco_dinamico,
  aceita_drone,
  destaque_ate is not null and destaque_ate > now() as destaque,
  whatsapp_business,
  -- NOVA. Mesma regra de situacaoPlano() em app/lib/plano.ts e de
  -- plano_bloqueia() no paywall: em dia = assinatura ativa OU teste correndo.
  -- Repare que aqui NÃO há `user_id = auth.uid()`: no paywall a pergunta é
  -- "quem chama é o dono inadimplente?"; aqui é "esta loja está no ar?", que
  -- independe de quem pergunta.
  (plano = 'ativo' or (trial_expira_em is not null and trial_expira_em > now()))
    as disponivel
from lojas;

grant select on public.lojas_publicas to anon, authenticated;

comment on view public.lojas_publicas is
  'Dados publicos das lojas. `disponivel` = plano em dia; a vitrine (buscar, '
  'loja/[id], cardapio/[id]) deve filtrar por ele. NAO filtre a view inteira: '
  'ela tambem resolve nome de loja em pedidos antigos e nos chats.';

commit;

-- CONFERÊNCIA:
--   select count(*) filter (where disponivel) as no_ar,
--          count(*) filter (where not disponivel) as fora
--     from public.lojas_publicas;
