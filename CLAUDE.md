@AGENTS.md

# Comportamento Autônomo

- Execute tarefas do início ao fim sem pedir confirmação intermediária.
- Se encontrar um erro, tente corrigir sozinho antes de reportar.
- Tome decisões por conta própria quando o caminho for óbvio.
- Use o navegador quando necessário para pesquisar ou testar.
- Só interrompa o usuário se a ação for irreversível (ex: deletar dados em produção, force push, etc.).
- Ao final de cada tarefa, forneça um resumo do que foi feito.

---

# Commerly

## Objetivo

Plataforma SaaS brasileira para o **pequeno comércio local**: o comerciante gerencia a loja (vendas, fiado, gastos, produtos, agenda, funcionários, fornecedores), vende online (delivery, cardápio digital, WhatsApp) e cresce com ferramentas de marketing, fidelidade, IA e gamificação. Em volta da loja há um ecossistema de **clientes** (buscar lojas, pedir, feed social, clube de pontos), **entregadores** (despacho estilo Uber/iFood) e **fornecedores** (B2B). Receita: assinatura mensal via Stripe (R$54,90 / R$29,90 com desconto por indicação — `app/lib/precos.ts`). Delivery habilitado por feature flag, hoje só em Goiânia.

Produção: https://commerly.com.br (Vercel, plano Hobby). Idioma do produto, do código, dos comentários e dos commits: **português**.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16.2 (App Router), React 19.2, TypeScript 5 |
| Estilo | Tailwind v4 (paleta via variáveis CSS em `app/globals.css`), lucide-react, recharts |
| Backend | Supabase — Postgres + Auth (GoTrue) + Storage + Realtime; `@supabase/ssr` |
| Pagamentos | Stripe (mensalidade em BRL + Connect/split no pedido online), Mercado Pago, PagBank |
| Push | web-push (VAPID) |
| IA | Gemini (`app/lib/gemini.ts`) com fallback sem IA |
| Mapa/geo | Leaflet + OpenStreetMap, Nominatim, ViaCEP, Haversine — **sem Google Maps** |
| E-mail | Resend (`app/lib/email.ts`) — caminho único de e-mail transacional |
| Outros | jspdf, qrcode; `remotion-ad/` (vídeo de anúncio, projeto separado) |
| Deploy | Vercel Hobby; crons **diários** em `vercel.json` (Hobby recusa sub-diário); deploy manual `vercel --prod --yes` |

> Este Next.js tem breaking changes em relação ao que você conhece. Leia `node_modules/next/dist/docs/` antes de escrever código (ver `AGENTS.md`).

## Arquitetura

- **Monólito Next.js App Router.** O painel é majoritariamente **client-side e fala direto com o Supabase pela chave anon**. Consequência central: **a segurança real mora na RLS do Postgres**, não em rotas ou middleware. Bloquear uma rota HTTP não impede um `fetch` no `/rest/v1` com sessão válida.
- **`proxy.ts`** (raiz) — guard server-side de rotas por papel + paywall. Usa listas EXPLÍCITAS de páginas e a MESMA regra do banco (`situacaoPlano()` em `app/lib/plano.ts` ↔ `plano_bloqueia()` no SQL). Mexeu em uma, mexa na outra.
- **Rotas `/api/*`** (~98) — só para o que precisa de service role, segredos ou webhooks: Stripe, Mercado Pago, PagBank, push, Gemini, e-mail, geocode, despacho, crons. Service role via `app/lib/supabase-admin.ts`.
- **Domínio em `app/lib/`** (~70 módulos): cada feature tem seu módulo (`dispatch.ts`, `pedidosClientes.ts`, `fidelidade.ts`, `gamificacaoServer.ts`, `notificacoes.ts`, `precos.ts`, `plano.ts`, `menu.ts`, `nichos.ts`…). Lógica de negócio vive aqui, não nas páginas.
- **Banco:** triggers e funções fazem trabalho pesado (notificações, XP, guard de pedidos, pontos do clube). Views públicas (`lojas_publicas`, `entregadores_contato`) filtram o que o cliente pode ver.
- **Tempo real:** Supabase Realtime para notificações, ofertas de corrida (janela de 30s) e GPS do entregador; Web Push como segundo canal.
- **Multi-nicho:** o dashboard e o menu mudam por nicho da loja (`app/lib/nichos.ts`, `app/lib/menu.ts`, `nicheStore.ts`). Delivery só existe para nichos de delivery.
- **Feature flags por cidade** (`app/lib/featureFlags.ts`, `useFlags.ts`): flag `delivery` global OFF + `goiania` ON. Apagar a linha `__global__` reabre o Brasil inteiro.

## Estrutura de pastas

```
app/
  page.tsx, layout.tsx, globals.css   landing + layout raiz + tema
  api/                                 ~98 route.ts (webhooks, crons, service role)
  lib/                                 domínio (~70 módulos) — ver acima
  components/  hooks/  supabase.ts     UI compartilhada, useAuth etc., client anon
  dashboard/ vendas/ produtos/ pedidos/ fiado/ gastos/ financeiro/ clientes/
  agenda/ servicos/ funcionarios/ fornecedores/ mensagens/ configuracoes/
  promocoes/ combos/ ads/ posts/ integracoes/ assistente/ academy/ ...   painel do comerciante
  cliente/                             área do cliente (buscar, pedido, feed, clube)
  entregador-delivery/  entregador/    área do entregador (despacho, GPS, perfil público)
  fornecedor/                          área do fornecedor (B2B)
  admin/                               painel master (guard por e-mail)
  loja/[id]  cardapio/[id]  comerciante|entregador|cliente/[slug]   páginas públicas
  login/ onboarding/ planos/ recuperar-senha/ nova-senha/ auth/ convite/
  sobre/ termos/ privacidade/ suporte/ blog/ para-*/ parceiros/ investidores/   institucional
  sitemap.ts  robots.ts
proxy.ts            guard de rotas + paywall (server)
sql/                migrações datadas (YYYY-MM-DD-*.sql) + consolidados
supabase/migrations/  migrações no formato do CLI
scripts/            backfills e utilitários (ex.: achar-builder-nao-consumido.mjs)
vercel.json         crons diários + redirect www
CHECKLIST-TESTES.md roteiro manual de testes
remotion-ad/        vídeo de anúncio (projeto à parte)
```

## Áreas do sistema (papéis)

| Papel | Entrada | Conta de teste |
|---|---|---|
| Comerciante | `/dashboard` e as 24 páginas do painel (lista em `proxy.ts`) | matheus@teste.com |
| Cliente | `/cliente/*` | cliente@teste.com |
| Entregador | `/entregador-delivery/*` | entregador@teste.com |
| Fornecedor | `/fornecedor/*` | fornecedor@teste.com |
| Admin | `/admin` (guard por e-mail) | — |

Senhas das contas de teste diferem por conta — estão na memória do projeto, não chute.

## Funcionalidades implementadas

**Conta e acesso:** auth dos 4 papéis, reset de senha (Admin API `generateLink` + Resend), Google OAuth (código pronto; provider pendente no painel Supabase), validações de CPF/CNPJ/telefone + anti-duplicação, onboarding por nicho com IA, paywall (proxy + RLS `paywall_plano` em 32 tabelas), assinatura Stripe BRL com desconto por indicação (10%/indicação que assina, até 40%).

**Gestão da loja:** vendas, fiado, gastos, produtos, histórico, funcionários, fornecedores, agenda/serviços, mensagens, configurações, Commerly Score (0-100, 4 pilares), CRM `/clientes`, ranking de produtos, financeiro, foto da fachada, website da loja, cidade/cobertura (`cidade_slug` nulo = loja não vende).

**Venda online / delivery:** pedidos cliente↔loja, pagamento online (Stripe Checkout + Connect, split) ou na entrega, taxa por distância (precisa de lat/lng da loja), pool de entregadores online, oferta de corrida 30s via Realtime+push, "Buscar entregador próximo", GPS em tempo real, código de confirmação (`pedido_codigos`; `codigo_confirmacao` é coluna legada), multi-entrega (2 pedidos/viagem, teto de 2), Modo Festa (pedido em grupo, 3 lojas/1 endereço), avaliações com integridade HMAC, watchdog de despacho, cardápio digital `/cardapio/[id]` + QR, WhatsApp Commerce, Clube de pontos (credita em `entregue`, estorna no cancelamento), garantia, drone (experimental).

**Marketing e crescimento:** promoções, combos, flash sale, campanhas, Ads, cupons, preço dinâmico, cardápio/Vision por IA (Gemini), Copilot / `/commerly-ai`, material de marketing (adesivo/selo/QR em PNG/SVG/PDF), indicação, fundadores, embaixador, gamificação (XP/missões/medalhas/streak — motor em `gamificacaoServer.ts`), `/medalhas`, `/ranking`, `/timeline`, `/hall-da-fama`, certificados PDF, perfis públicos por slug, Academy (12 mini aulas), retenção via cron, expansão por cidades com feature flags, SEO (sitemap/robots/og), blog, páginas legais.

**Cliente:** busca de lojas com mapa, favoritos, pedido com modal, feed social em formato reels (posts/stories/seguir), fidelidade, notificações.

**Fornecedor (B2B):** catálogo, pedidos loja↔fornecedor com notificações por trigger.

**Transversal:** notificações Realtime (tabela `notificacoes` + triggers) com badge/som/toast, Web Push nativo (`push_subscriptions`, VAPID), e-mail transacional Resend, admin master, feature flags, rate limit (`rate-limit.ts`), tema claro, menu em seções por nicho.

**Pendências conhecidas (não são bugs de código):** SMTP do Supabase (Gmail) não envia OTP — cadastro/login por e-mail quebrado; provider Google não habilitado; `AVALIACOES_HMAC_SECRET` e mais 3 env vars faltam na Vercel; bucket `produtos` sem policy de storage; carência do paywall venceu em 28/07/2026; dados legais da empresa são placeholder; Stripe Connect (split do pedido) não testado em produção.

## Regras para futuras alterações

1. **Leia a doc do Next.js em `node_modules/next/dist/docs/` antes de escrever código.** As APIs mudaram.
2. **Toda mudança de schema vira arquivo em `sql/YYYY-MM-DD-nome.sql`** e é aplicada em produção (via MCP do Supabase ou painel). Nada de DDL só no painel sem versionar. Registre no arquivo se já foi aplicado.
3. **`CREATE TABLE IF NOT EXISTS` não adiciona coluna em tabela existente.** Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para colunas novas. Isso já quebrou o push por 3 semanas com um 500 mudo.
4. **A view `lojas_publicas` é recriada a cada migração e já perdeu colunas** (`destaque`, `whatsapp_business` — quebrou `/cliente/buscar`). Ao recriá-la, inclua TODAS as colunas. Filtre `disponivel` nas telas, nunca na view.
5. **Funções/triggers: sempre puxe o corpo vivo do banco antes de recriar.** O guard de pedidos já perdeu o preço autoritativo por ter sido recriado de uma cópia antiga.
6. **Fórmula de XP existe em dois lugares** (SQL e `gamificacaoServer.ts`). Mudar só um faz o XP oscilar.
7. **Paywall em dois lugares** (`situacaoPlano()` em TS e `plano_bloqueia()` em SQL). Mantenha idênticos.
8. **`void supabase.from(...)` NUNCA dispara o fetch** — o builder do PostgREST é preguiçoso. Sempre `await`. Já matou `post_eventos` e o ping de GPS (pool de despacho vazio). Varra com `scripts/achar-builder-nao-consumido.mjs`.
9. **Sempre `.select()` após `update`/`insert` e cheque o resultado** — RLS bloqueia silenciosamente (204 sem `error`, zero linhas).
10. **`router.refresh()` não relê a loja** — `useAuth` só roda no mount. Atualize o estado local ou force reload.
11. **Bucket de storage novo precisa de policy** — RLS ligado + zero policy = upload 400 mudo. A policy casa por PASTA (`{loja_id}/arquivo`), nome plano não funciona.
12. **Testar RLS só vale via REST com JWT real.** `set_config('role')` em SQL não aplica RLS e inventa vazamentos.
13. **`entregadores_publicos` sempre devolve 0 linhas ao navegador** — use `entregadores_contato`.
14. **CHECK de `notificacoes.tipo`** — ao criar um tipo novo de notificação, altere o CHECK ou o insert falha.
15. **Crons são diários (Hobby).** Não adicione cron sub-diário em `vercel.json`: o deploy falha em silêncio. Lógica que precisa de frequência maior roda no cliente (watchdog) ou em webhook.
16. **Segredos na Vercel são "Sensitive"** — `vercel env pull` vem vazio para Stripe/Resend. Não conclua que a var não existe.
17. **Preços só em `app/lib/precos.ts`;** Stripe por `lookup_key`, nunca por price id hardcoded.
18. **`rm -rf .next` ao mexer em `globals.css`** (Tailwind v4 cacheia as variáveis).
19. **Kit/bolsa térmica do entregador NÃO é gate** de corrida; `kit_comprado` é coluna legada (estado real em `kit_pedidos`).
20. **Idempotência do Clube de pontos** é pelo saldo LÍQUIDO, não por `exists('ganho')`.
21. **Contas de teste:** senhas diferem por conta; use a Admin API do GoTrue para redefinir, não chute.
22. **Commits em português**, mensagem no formato `tipo(escopo): descrição` (ex.: `fix(entrega): ...`). Commit/push só quando pedido.
23. **Preço de pedido é do banco, nunca do navegador.** `pedidos_clientes` (delivery) e `pedidos` (B2B) têm guard `BEFORE INSERT OR UPDATE` que reescreve `itens[].preco` e `total` a partir de `produtos`/`fornecedor_produtos`. **Tela nova que cria pedido não precisa validar preço — mas também não pode ser a autoridade dele.** Recalcular o total no servidor a partir dos itens que o comprador mandou não é validação: é autoconsistência (foi exatamente o bug do B2B). Nos dois guards, o UPDATE congela conteúdo e só o `service_role` escreve campos de pagamento — mexeu no guard, rode o teste do webhook, senão o pagamento quebra em silêncio (204, zero linhas, sem `error`).

## Cuidados para não quebrar o que existe

- **Antes de alterar uma tabela, veja quem depende dela:** views (`lojas_publicas`, `entregadores_contato`), triggers de notificação/XP/guard, policies `paywall_plano`, e o fluxo E2E de delivery.
- **Fluxo de delivery é o mais sensível** (despacho → oferta 30s → aceite → GPS → código → entregue → pontos/avaliação). Quem avança cada status está documentado no E2E; não mude status por atalho. Sessão do Playwright é única por contexto; GPS via `addInitScript`.
- **Não mexa no `proxy.ts` sem atualizar as listas explícitas** — página nova do comerciante que chama `useAuth()` precisa entrar em `PAGINAS_COMERCIANTE`, senão fica fora do paywall.
- **Não troque a chave anon por service role no cliente** nem exponha `SUPABASE_SERVICE_ROLE_KEY`; service role só em `app/api/*` via `supabase-admin.ts`.
- **Não reative Google Maps** — a decisão foi Leaflet/OSM sem API key.
- **Não rode renders do Remotion concorrentes em background** nem use múltiplos drop-shadows (render trava).
- **Não apague a linha `__global__` de `feature_flags`** sem querer — reabre delivery no Brasil inteiro.
- **`media-src` no CSP** precisa permitir o Storage do Supabase, senão os vídeos do feed ficam cinzas em 00:00.
- **Migrações parciais já aconteceram** (haversine, pontos, agenda) — ao aplicar SQL grande, confira depois com `SELECT` que tudo entrou.
- **Depois de qualquer mudança, rode `npm run build` e `npm run lint`** — não há suíte de testes automatizada; o roteiro manual está em `CHECKLIST-TESTES.md`.
- **Deploy é manual** (`vercel --prod --yes`). Confirme no painel que o deploy concluiu; falhas de cron já mataram deploys em silêncio.
