// Gera public/icon-maskable-512.png e icon-maskable-192.png.
//
// Ícone "maskable" (Android/TWA): o sistema recorta o PNG na forma que quiser
// (círculo, squircle, gota...), então o FUNDO precisa cobrir 100% da área,
// sem transparência, e todo o conteúdo importante precisa caber na "zona
// segura" — um círculo com 80% do lado (raio 40%) no centro. Aqui o glifo
// ocupa ~48% do lado (±24% do centro), com folga.
//
// Identidade: fundo `--color-fundo` (#0a0f1a) e o storefront do lucide
// (`Store`, o mesmo da landing) na cor de acento #00c896.
//
// Rodar: node scripts/gerar-icones-maskable.mjs   (sharp já vem com o Next)
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const FUNDO = '#0a0f1a'
const ACENTO = '#00c896'
const LADO = 512
// Path do lucide `store` (viewBox 24x24), versão instalada em node_modules.
const PATHS = [
  'M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5',
  'M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244',
  'M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05',
]

// Glifo com 48% do lado: 24 unidades → 0.48*LADO px.
const escala = (0.48 * LADO) / 24
const deslocamento = (LADO - 24 * escala) / 2

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}" viewBox="0 0 ${LADO} ${LADO}">
  <rect width="${LADO}" height="${LADO}" fill="${FUNDO}"/>
  <g transform="translate(${deslocamento} ${deslocamento}) scale(${escala})"
     fill="none" stroke="${ACENTO}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    ${PATHS.map(d => `<path d="${d}"/>`).join('\n    ')}
  </g>
</svg>`

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const tamanho of [512, 192]) {
  const png = await sharp(Buffer.from(svg)).resize(tamanho, tamanho).flatten({ background: FUNDO }).removeAlpha().png({ compressionLevel: 9 }).toBuffer()
  const destino = join(raiz, 'public', `icon-maskable-${tamanho}.png`)
  writeFileSync(destino, png)
  const meta = await sharp(png).metadata()
  console.log(destino, `${meta.width}x${meta.height}`, meta.hasAlpha ? 'COM alpha (errado!)' : 'sem alpha', `${png.length} bytes`)
}
