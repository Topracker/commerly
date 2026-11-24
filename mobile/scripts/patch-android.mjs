// Ajusta o projeto android/ gerado por `npx cap add android` para a Commerly.
// Idempotente: pode rodar várias vezes. Roda no CI (ver .github/workflows/android.yml)
// e também localmente, de dentro de mobile/:  node scripts/patch-android.mjs
//
// O que faz:
//  1. Permissões: GPS com o app aberto (busca de lojas, entregador) e câmera.
//     Sem serviço em primeiro plano: GPS em segundo plano exige declaração com
//     vídeo na Play e o delivery ainda não está ativo. Volta quando ativar.
//  2. App Link verificado para https://commerly.com.br/auth/callback — é por
//     onde o login com Google volta do navegador do sistema para dentro do app.
//  3. Ícones (adaptativo + legado) e splash a partir de mobile/assets/.
//  4. versionCode/versionName a partir de VERSION_CODE / VERSION_NAME.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = join(raiz, 'android', 'app')
const res = join(app, 'src', 'main', 'res')
if (!existsSync(app)) {
  console.error('android/ não existe. Rode antes: npx cap add android')
  process.exit(1)
}

const COR_FUNDO = '#0a0f1a'
const HOST = 'commerly.com.br'

function editar(arquivo, fn) {
  const antes = readFileSync(arquivo, 'utf8')
  const depois = fn(antes)
  if (depois !== antes) writeFileSync(arquivo, depois)
  return depois !== antes
}

// 1 + 2) AndroidManifest.xml
const manifest = join(app, 'src', 'main', 'AndroidManifest.xml')
editar(manifest, xml => {
  const permissoes = [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.CAMERA',
  ].filter(p => !xml.includes(`"${p}"`))
  if (permissoes.length) {
    const linhas = permissoes.map(p => `    <uses-permission android:name="${p}" />`).join('\n')
    xml = xml.replace('</manifest>', `${linhas}\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>`)
  }
  if (!xml.includes(`android:host="${HOST}"`)) {
    const filtro = `
            <!-- Login com Google: o navegador do sistema devolve para este App Link -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${HOST}" android:pathPrefix="/auth/callback" />
            </intent-filter>
        </activity>`
    xml = xml.replace('</activity>', filtro)
  }
  return xml
})

// strings.xml — nome do canal da notificação de GPS em segundo plano
const strings = join(res, 'values', 'strings.xml')
editar(strings, xml => {
  if (xml.includes('capacitor_background_geolocation_notification_channel_name')) return xml
  return xml.replace('</resources>',
    '    <string name="capacitor_background_geolocation_notification_channel_name">Localização da entrega</string>\n</resources>')
})

// 3) Ícones e splash (ImageMagick: `magick` no IM7, `convert` no IM6)
const im = (() => {
  for (const bin of ['magick', 'convert']) {
    try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); return bin } catch {}
  }
  return null
})()
const fundoIcone = join(res, 'values', 'ic_launcher_background.xml')
if (existsSync(fundoIcone)) editar(fundoIcone, xml => xml.replace(/#[0-9A-Fa-f]{6,8}/, COR_FUNDO))

if (!im) {
  console.warn('ImageMagick não encontrado: ícones e splash ficam os padrões do Capacitor.')
} else {
  const icone = join(raiz, 'assets', 'icon.png')
  const maskable = join(raiz, 'assets', 'icon-maskable.png')
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  for (const [d, f] of Object.entries(dens)) {
    const pasta = join(res, `mipmap-${d}`)
    if (!existsSync(pasta)) continue
    const lado = Math.round(48 * f)
    execFileSync(im, [icone, '-resize', `${lado}x${lado}`, join(pasta, 'ic_launcher.png')])
    execFileSync(im, [icone, '-resize', `${lado}x${lado}`,
      '(', '+clone', '-threshold', '-1', '-negate', '-fill', 'white', '-draw', `circle ${lado / 2},${lado / 2} ${lado / 2},0`, ')',
      '-alpha', 'off', '-compose', 'copy_opacity', '-composite', join(pasta, 'ic_launcher_round.png')])
    // Adaptativo: 108dp de tela, 72dp visíveis. O maskable já traz a arte na
    // zona segura (80%), então ocupa os 108dp inteiros.
    const fg = Math.round(108 * f)
    execFileSync(im, [maskable, '-resize', `${fg}x${fg}`, join(pasta, 'ic_launcher_foreground.png')])
  }
  // Splash: fundo escuro + ícone central, no mesmo tamanho de cada splash.png do template
  const splashes = []
  for (const nome of readdirSync(res)) {
    const p = join(res, nome, 'splash.png')
    if (nome.startsWith('drawable') && existsSync(p)) splashes.push(p)
  }
  for (const p of splashes) {
    const [w, h] = execFileSync(im === 'magick' ? 'magick' : 'identify',
      im === 'magick' ? ['identify', '-format', '%w %h', p] : ['-format', '%w %h', p]).toString().trim().split(' ').map(Number)
    const lado = Math.round(Math.min(w, h) * 0.28)
    execFileSync(im, ['-size', `${w}x${h}`, `xc:${COR_FUNDO}`, '(', icone, '-resize', `${lado}x${lado}`, ')',
      '-gravity', 'center', '-composite', p])
  }
  console.log(`Ícones gerados; ${splashes.length} splash(es) refeito(s).`)
}

// 4) Versão
const gradle = join(app, 'build.gradle')
const versionCode = process.env.VERSION_CODE
const versionName = process.env.VERSION_NAME
editar(gradle, g => {
  if (versionCode) g = g.replace(/versionCode\s+\d+/, `versionCode ${Number(versionCode)}`)
  if (versionName) g = g.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`)
  return g
})

console.log('android/ ajustado para a Commerly', { versionCode, versionName })
