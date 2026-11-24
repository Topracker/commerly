# App Android da Commerly (Capacitor)

App nativo de verdade (pacote `br.com.commerly.app`, Capacitor 8, targetSdk 36),
que carrega o commerly.com.br num WebView próprio — sem Chrome, sem barra de
endereço — e acrescenta recursos nativos:

| Recurso | Como |
|---|---|
| GPS do entregador em segundo plano | **Desligado na v1** (delivery ainda não está ativo; a Play exige declaração com vídeo). O código em `app/entregador-delivery/dashboard/page.tsx` já usa `@capgo/background-geolocation` se o plugin voltar ao `mobile/package.json`. |
| Login com Google | O Google bloqueia login dentro de WebView. O botão abre no navegador do sistema (`@capacitor/browser`) e o App Link `https://commerly.com.br/auth/callback` traz de volta ao app (`app/components/NativeBridge.tsx`). |
| Câmera nos campos de foto | permissão `CAMERA` (os `<input capture>` já existentes funcionam). |
| Tela sem internet | `www/offline.html`. |
| Botão voltar do Android | volta no histórico; na primeira tela, fecha o app. |

O site detecta o app por `window.Capacitor` (ver `app/lib/nativo.ts`) e pelo
user-agent, que termina em `CommerlyApp/1.0`. No navegador comum nada muda.

> **Push:** notificação push web (`PushManager.tsx`) **não funciona dentro do
> WebView do Android**. Para ter push no app é preciso um projeto Firebase
> (FCM) + `@capacitor/push-notifications` + envio por FCM no backend. Fica para
> a v1.1.

## Gerar o AAB (pelo GitHub, sem instalar nada)

1. Commit + push destes arquivos (a pasta `.android-keys/` está no .gitignore — **não** vai junto).
2. No GitHub → **Settings → Secrets and variables → Actions → New repository secret**, crie os 3 secrets
   descritos em `.android-keys/LEIA-ME-CHAVE.txt`.
3. **Actions → "App Android (AAB assinado)" → Run workflow.** Em ~10 min sai o
   artefato `commerly-android-N` com o `.aab`.
4. Faça **deploy do site** (Vercel) — as mudanças em `app/` e o novo
   `public/.well-known/assetlinks.json` precisam estar no ar para o login Google
   e o GPS nativo funcionarem no app.

Local (opcional, precisa Node 22 + JDK 21 + Android SDK), dentro de `mobile/`:
`npm install && npx cap add android && node scripts/patch-android.mjs && npx cap sync android && npx cap open android`.

## Play Console — o que falta

1. **Criar app** na conta Commerly: nome "Commerly", idioma pt-BR, App, Gratuito.
2. **Teste interno** → criar versão → subir o `.aab` → aceitar o Play App Signing.
3. **Integridade do app → Assinatura do app**: copiar a SHA-256 da *chave de
   assinatura do app* e ACRESCENTAR no array de `public/.well-known/assetlinks.json`
   (mantenha a da upload key). Deploy. Sem isso o login Google no app instalado
   pela loja não volta pro app.
4. Supabase → Auth → URL Configuration: `https://commerly.com.br/auth/callback`
   já é usado pelo site; não precisa mudar.
5. Conteúdo do app (Painel → "Configurar seu app"):
   - Política de privacidade: `https://commerly.com.br/privacidade`
   - Exclusão de conta: `https://commerly.com.br/excluir-conta`
   - Acesso ao app: precisa de **login de teste** para o revisor (crie uma conta
     de comerciante de demonstração e informe e-mail/senha no formulário).
   - Anúncios: confirmar se o app exibe anúncios de terceiros (provavelmente não).
   - Classificação de conteúdo, público-alvo (18+ / negócios), Segurança dos dados.
   - **Permissões de serviço em primeiro plano**: declarar `location` (entregador
     compartilha localização durante corridas) — a Google pede um vídeo curto
     mostrando o recurso.
6. Ficha da loja (rascunho abaixo) + ícone 512×512 (`assets/icon.png`), banner
   1024×500 e pelo menos 2 capturas de tela de celular.

## Rascunho da ficha da loja

**Nome:** Commerly

**Descrição curta (≤ 80):**
Vendas, estoque, delivery e clientes do seu comércio num app só.

**Descrição completa:**
A Commerly é o app de gestão feito para o pequeno comércio brasileiro.

Para quem vende:
• Registre vendas em segundos e acompanhe o caixa do dia
• Controle produtos, estoque, fiado e gastos
• Receba pedidos de delivery e acompanhe a entrega
• Publique posts e stories da sua loja para os clientes
• Relatórios e financeiro sem planilha

Para clientes:
• Encontre lojas do bairro, faça pedidos e acompanhe em tempo real
• Junte pontos do Clube que valem em todas as lojas da rede

Para entregadores:
• Fique online, receba corridas próximas e veja a rota no mapa
• Localização compartilhada só enquanto você está online

Uma mensalidade, sem taxa escondida por pedido.

**Categoria:** Empresas · **E-mail de contato:** (preencher) · **Site:** https://commerly.com.br
