# TWA (Play Store) — assetlinks.json

`public/.well-known/assetlinks.json` é servido em
`https://commerly.com.br/.well-known/assetlinks.json` e é o que faz o Android
abrir o app **sem a barra de URL** (Digital Asset Links). Hoje está com
**placeholder**: o app instalado até abre, mas com a barra do Chrome, até a
impressão digital real entrar.

## O que preencher

Dois campos, os dois em `target`:

| Campo | Valor | De onde vem |
|---|---|---|
| `package_name` | `br.com.commerly.twa` (ou o que for escolhido no `bubblewrap init`) | `twa-manifest.json` gerado pelo Bubblewrap, chave `packageId`. Tem que ser IDÊNTICO. |
| `sha256_cert_fingerprints[0]` | `AA:BB:CC:…` (32 pares hex, maiúsculos, separados por `:`) | **Do Play App Signing, não da upload key** — ver abaixo. |

Pode haver mais de uma impressão digital no array (ex.: a da upload key para
testar um APK local + a do Play App Signing para a versão da loja).

## De onde tirar a SHA-256 (a armadilha)

O Bubblewrap gera uma keystore local (`android.keystore`) e assina o AAB com
ela. Essa é a **upload key**. Quando o AAB sobe no Play Console, a Google
**reassina** com a chave do *Play App Signing* — e é ESSA a assinatura que o
telefone vê. Se o assetlinks tiver só a upload key, a verificação falha e a
barra de URL aparece.

1. Play Console → seu app → **Configuração → Integridade do app → Assinatura
   do app** ("App signing").
2. Em *Certificado da chave de assinatura do app* copie **"Impressão digital
   do certificado SHA-256"**.
3. Cole no array. Para testar um APK assinado localmente (antes de publicar),
   acrescente também a da upload key:
   `keytool -list -v -keystore android.keystore -alias <alias>` → linha `SHA256:`.

## Como conferir

- `https://commerly.com.br/.well-known/assetlinks.json` responde 200 com
  `content-type: application/json` (sem redirecionamento — o `vercel.json` só
  redireciona `www`).
- Validador da Google:
  `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://commerly.com.br&relation=delegate_permission/common.handle_all_urls`
- No telefone: `adb shell pm get-app-links br.com.commerly.twa` → `verified`.

## Bubblewrap — o resto que já foi decidido

- `start_url` do manifest é `/entrar?source=twa` (porta que detecta o papel;
  `/login` deslogaria cliente/entregador/fornecedor).
- Entregador usa GPS → `bubblewrap init` com **location delegation** ligada.
- Ícones: `any` = `/icon-512.png`, `maskable` = `/icon-maskable-512.png`
  (regenerar com `node scripts/gerar-icones-maskable.mjs`).
- Política da Play "Excluir conta": em `/excluir-conta` (pública) e dentro do
  app em Configurações → Excluir minha conta. A URL vai no formulário Data safety.
