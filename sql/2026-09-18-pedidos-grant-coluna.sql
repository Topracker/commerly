-- ============================================================================
-- B2B: A POLICY "fornecedor atualiza status" SÓ PODE MUDAR O STATUS
-- (defesa em profundidade sobre o guard de 2026-09-17)
-- ----------------------------------------------------------------------------
-- A policy de UPDATE de `pedidos` promete uma coisa no nome e permite outra:
--
--   fornecedor atualiza status | UPDATE | {authenticated} | PERMISSIVE
--     USING      (fornecedor_id IN (select id from fornecedores where user_id = auth.uid()))
--     WITH CHECK (idem)
--
-- Ela verifica DE QUEM é a linha, nunca O QUE mudou. Foi por essa brecha que o
-- fornecedor inflava um pedido pendente de R$0,02 para R$17.980,00
-- (sql/2026-09-17-b2b-guard-preco.sql). O `pedidos_b2b_guard` fechou o efeito
-- prático congelando as colunas no ramo de UPDATE, mas a permissão continuou
-- larga: a escrita ainda CHEGA ao trigger e volta 200 OK.
--
-- Baseline medido em produção instantes antes deste arquivo, JWT de
-- fornecedor@teste.com:
--
--   PATCH /rest/v1/pedidos?id=eq.<id>  {"total": 17980}
--   -> 200 OK, e o total permanece 179.80 (o guard congelou)
--
-- ----------------------------------------------------------------------------
-- POR QUE ISTO NÃO É UMA MUDANÇA DE POLICY
--
-- RLS no Postgres NÃO tem granularidade de coluna. `WITH CHECK` avalia a LINHA
-- RESULTANTE, não quais colunas foram tocadas, e não enxerga `OLD`. Não existe
-- forma de escrever "só `status` pode mudar" numa policy — qualquer tentativa
-- vira uma policy que não restringe nada, ou vira um trigger (que é o que o
-- guard já é).
--
-- O mecanismo que fala de coluna é o GRANT. E era lá que estava a largura real:
-- `authenticated` tinha UPDATE em nível de TABELA, ou seja, nas 14 colunas,
-- inclusive itens, total, comissao, pagamento_status e os dois campos do Stripe.
--
-- ----------------------------------------------------------------------------
-- O QUE MUDA NA PRÁTICA
--
--   antes:  PATCH {total: 17980} -> 200 OK, guard congela em silêncio
--   depois: PATCH {total: 17980} -> 403, 42501 permission denied for column total
--
-- Duas camadas independentes, e a de fora agora falha ALTO em vez de baixo. O
-- guard continua sendo a autoridade — este arquivo não substitui nada dele.
--
-- `updated_at` entra no grant junto com `status` porque a tela manda os dois
-- (`app/fornecedor/dashboard/page.tsx:70` envia {status, updated_at}). Sem ele o
-- PATCH viraria 403 e a área do fornecedor quebraria. Incluí-lo é inofensivo: o
-- guard sobrescreve `updated_at` com now() em todo update, então o valor que o
-- cliente manda é descartado de qualquer jeito.
--
-- Granular só (status) obrigaria a tirar o `updated_at` do cliente ANTES deste
-- SQL — rollout em 2 fases, acoplado a deploy, sem ganho real de segurança.
-- Por isso o recorte é (status, updated_at).
--
-- `anon` também tinha UPDATE de tabela. É inócuo (não existe policy de UPDATE
-- para anon, a RLS barra antes), mas sai junto por higiene. INSERT e DELETE do
-- anon ficam como estão — fora do escopo deste arquivo.
--
-- `service_role` NÃO É TOCADO. Os dois caminhos de service role dependem do
-- GRANT de tabela dele:
--   app/api/stripe/webhook/route.ts:173  -> pagamento_status, stripe_payment_intent
--   app/api/b2b/checkout/route.ts:120    -> stripe_session_id, comissao, pagamento_metodo
-- Mexer nisso quebraria o pagamento B2B em silêncio. É o teste P6.
--
-- ROLLBACK: grant update on public.pedidos to authenticated, anon;
--
-- APLICADO em produção em 2026-09-18 via MCP do Supabase.
-- ============================================================================

revoke update on public.pedidos from authenticated, anon;
grant  update (status, updated_at) on public.pedidos to authenticated;

-- Para quem ler a policy daqui a seis meses e tirar a mesma conclusão que
-- motivou este arquivo.
comment on policy "fornecedor atualiza status" on public.pedidos is
  'Decide DE QUEM e a linha, nao O QUE mudou — RLS nao tem granularidade de coluna. '
  'O recorte de coluna esta no GRANT (status, updated_at) de sql/2026-09-18-pedidos-grant-coluna.sql, '
  'e o valor autoritativo de itens/total vem do trigger pedidos_b2b_guard.';
