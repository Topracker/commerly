// Gera TODOS os ícones do app a partir de scripts/assets/icone-fonte.png.
//
// A fonte é o ícone original (raster 512, quadrado azul arredondado com a
// loja branca) — que vinha com ~34% de BRANCO embutido em volta, sem alpha:
// era a "borda branca" no celular. Daqui extraímos só o glifo (a loja) como
// máscara de opacidade e redesenhamos sobre o azul chapado da marca, tirado
// do próprio ícone (cor mais frequente dos pixels azuis), sem chute.
//
// Saídas:
//   public/icon-{192,512}.png           manifest "any": quadrado arredondado,
//                                       cantos transparentes, sem margem
//   public/icon-maskable-{192,512}.png  manifest "maskable" (Android/TWA):
//                                       azul até a borda, glifo inteiro dentro
//                                       do círculo de 80% (zona segura)
//   public/icon-og-512.png              og:image — opaco (WhatsApp/Facebook
//                                       pintam transparência de branco)
//   app/icon1.png 48, icon2.png 96, icon3.png 192   <link rel="icon"> — o
//                                       Google só aceita lado múltiplo de 48
//   app/apple-icon.png 180              apple-touch-icon (opaco; o iOS recorta)
//   app/favicon.ico 16+32+48            navegadores antigos / /favicon.ico
//
// Rodar: node scripts/gerar-icones.mjs   (sharp já vem com o Next)
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONTE = join(raiz, 'scripts', 'assets', 'icone-fonte.png')

const { data, info } = await sharp(FONTE).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width
const H = info.height
const rgb = (x, y) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]] }
const ehAzul = ([r, , b]) => b - r > 120

// 1) Quadrado azul: bounding box dos pixels azuis.
let sq = { x0: W, y0: H, x1: -1, y1: -1 }
const contagem = new Map()
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = rgb(x, y)
  if (!ehAzul(c)) continue
  sq = { x0: Math.min(sq.x0, x), y0: Math.min(sq.y0, y), x1: Math.max(sq.x1, x), y1: Math.max(sq.y1, y) }
  const k = c.join(',')
  contagem.set(k, (contagem.get(k) || 0) + 1)
}
const LADO_SQ = Math.max(sq.x1 - sq.x0, sq.y1 - sq.y0) + 1

// 2) Azul da marca: a cor exata mais frequente entre os pixels azuis.
const [AZUL_RGB] = [...contagem].sort((a, b) => b[1] - a[1])[0]
const [AR, AG, AB] = AZUL_RGB.split(',').map(Number)
const AZUL = '#' + [AR, AG, AB].map(v => v.toString(16).padStart(2, '0')).join('')

// 3) Raio dos cantos: anda na diagonal de cada canto até achar azul.
//    Num arco de raio r o encontro fica a r·(1 − 1/√2) do canto do bbox.
const passos = []
for (const [cx, cy, dx, dy] of [[sq.x0, sq.y0, 1, 1], [sq.x1, sq.y0, -1, 1], [sq.x0, sq.y1, 1, -1], [sq.x1, sq.y1, -1, -1]]) {
  let t = 0
  while (!ehAzul(rgb(cx + dx * t, cy + dy * t))) t++
  passos.push(t)
}
const RAIO = passos.reduce((a, b) => a + b, 0) / passos.length / (1 - Math.SQRT1_2) / LADO_SQ

// 4) Glifo: no miolo do quadrado (longe dos cantos), opacidade = quão
//    "branco" o pixel está entre o azul e o branco — preserva o antialias.
const m = Math.round(LADO_SQ * 0.12)
const alfaEm = (x, y) => { const [r] = rgb(x, y); return Math.max(0, Math.min(1, (r - AR) / (255 - AR))) }
let g = { x0: W, y0: H, x1: -1, y1: -1 }
for (let y = sq.y0 + m; y <= sq.y1 - m; y++) for (let x = sq.x0 + m; x <= sq.x1 - m; x++) {
  if (alfaEm(x, y) > 0.08) g = { x0: Math.min(g.x0, x), y0: Math.min(g.y0, y), x1: Math.max(g.x1, x), y1: Math.max(g.y1, y) }
}
const PAD = 2
g = { x0: g.x0 - PAD, y0: g.y0 - PAD, x1: g.x1 + PAD, y1: g.y1 + PAD }
const GW = g.x1 - g.x0 + 1
const GH = g.y1 - g.y0 + 1
const glifoRGBA = Buffer.alloc(GW * GH * 4)
let raioMax = 0 // maior distância de pixel do glifo ao centro do glifo (px da fonte)
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
  const a = alfaEm(g.x0 + x, g.y0 + y)
  const i = (y * GW + x) * 4
  glifoRGBA[i] = glifoRGBA[i + 1] = glifoRGBA[i + 2] = 255
  glifoRGBA[i + 3] = Math.round(a * 255)
  if (a > 0.08) raioMax = Math.max(raioMax, Math.hypot(x + 0.5 - GW / 2, y + 0.5 - GH / 2))
}
const glifo = await sharp(glifoRGBA, { raw: { width: GW, height: GH, channels: 4 } }).png().toBuffer()

// Proporção e posição do glifo no ícone original (relativas ao quadrado).
const ESCALA_ORIG = 1 / LADO_SQ
const CX_ORIG = ((g.x0 + g.x1 + 1) / 2 - sq.x0) / LADO_SQ
const CY_ORIG = ((g.y0 + g.y1 + 1) / 2 - sq.y0) / LADO_SQ

// Desenha em 1024 e reduz no fim (antialias melhor nos tamanhos pequenos).
const BASE = 1024
async function desenhar({ cantos, escala, cx, cy }) {
  const r = Math.round(cantos * BASE)
  const fundo = `<svg xmlns="http://www.w3.org/2000/svg" width="${BASE}" height="${BASE}"><rect width="${BASE}" height="${BASE}" rx="${r}" ry="${r}" fill="${AZUL}"/></svg>`
  const w = Math.round(GW * escala * BASE)
  const h = Math.round(GH * escala * BASE)
  const gl = await sharp(glifo).resize(w, h, { kernel: 'lanczos3' }).toBuffer()
  return sharp(Buffer.from(fundo))
    .composite([{ input: gl, left: Math.round(cx * BASE - w / 2), top: Math.round(cy * BASE - h / 2) }])
    .png().toBuffer()
}

// "any": igual ao original, só que o quadrado ocupa o PNG inteiro.
const arteAny = await desenhar({ cantos: RAIO, escala: ESCALA_ORIG, cx: CX_ORIG, cy: CY_ORIG })
// Opaco (apple/og): mesmo glifo, azul até a borda.
const arteOpaca = await desenhar({ cantos: 0, escala: ESCALA_ORIG, cx: CX_ORIG, cy: CY_ORIG })
// Maskable: glifo centrado e escalado para o pixel mais distante cair a 36%
// do lado do centro — zona segura é 40% (círculo de 80%), sobra margem.
const ESCALA_MASK = 0.36 / raioMax
const arteMask = await desenhar({ cantos: 0, escala: ESCALA_MASK, cx: 0.5, cy: 0.5 })

async function salvar(arte, lado, destino, opaco) {
  let img = sharp(arte).resize(lado, lado, { kernel: 'lanczos3' })
  if (opaco) img = img.flatten({ background: AZUL }).removeAlpha()
  const png = await img.png({ compressionLevel: 9 }).toBuffer()
  if (destino) writeFileSync(join(raiz, destino), png)
  const meta = await sharp(png).metadata()
  if (destino) console.log(destino.padEnd(30), `${meta.width}x${meta.height}`, meta.hasAlpha ? 'com alpha' : 'opaco', `${png.length} bytes`)
  return png
}

console.log(`fonte ${W}x${H} | quadrado ${LADO_SQ}px em (${sq.x0},${sq.y0}) | azul ${AZUL} | cantos ${(RAIO * 100).toFixed(1)}% | glifo ${GW}x${GH}`)
console.log(`maskable: pixel mais distante do glifo a ${(raioMax * ESCALA_MASK * 100).toFixed(1)}% do lado (limite 40%)`)

for (const lado of [192, 512]) await salvar(arteAny, lado, `public/icon-${lado}.png`, false)
for (const lado of [192, 512]) await salvar(arteMask, lado, `public/icon-maskable-${lado}.png`, true)
await salvar(arteOpaca, 512, 'public/icon-og-512.png', true)
await salvar(arteOpaca, 180, 'app/apple-icon.png', true)
for (const [n, lado] of [[1, 48], [2, 96], [3, 192]]) await salvar(arteAny, lado, `app/icon${n}.png`, false)

// favicon.ico com PNGs embutidos (formato aceito desde o Windows Vista).
const tamanhosIco = [16, 32, 48]
const pngs = []
for (const lado of tamanhosIco) pngs.push(await salvar(arteAny, lado, null, false))
const cab = Buffer.alloc(6 + 16 * pngs.length)
cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4)
let offset = cab.length
pngs.forEach((png, i) => {
  const e = 6 + 16 * i
  cab.writeUInt8(tamanhosIco[i] % 256, e); cab.writeUInt8(tamanhosIco[i] % 256, e + 1)
  cab.writeUInt8(0, e + 2); cab.writeUInt8(0, e + 3)
  cab.writeUInt16LE(1, e + 4); cab.writeUInt16LE(32, e + 6)
  cab.writeUInt32LE(png.length, e + 8); cab.writeUInt32LE(offset, e + 12)
  offset += png.length
})
writeFileSync(join(raiz, 'app', 'favicon.ico'), Buffer.concat([cab, ...pngs]))
console.log('app/favicon.ico'.padEnd(30), tamanhosIco.join('+'))
