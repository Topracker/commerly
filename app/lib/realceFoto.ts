// #4 Realce de foto do produto — no NAVEGADOR, sem IA generativa.
//
// POR QUE NÃO É IA. A ideia original era "Gemini melhora a foto: remove fundo,
// ajusta iluminação, centraliza". Modelos de visão como o gemini-2.5-flash leem
// imagem e escrevem texto; eles não editam imagem. Quem edita é um modelo de
// GERAÇÃO, e gerar significa repintar: o hambúrguer da foto deixa de ser o
// hambúrguer que o cliente vai receber. Numa vitrine de delivery isso é
// propaganda enganosa (CDC art. 37), não retoque.
//
// Então aqui fazemos correções fotográficas de verdade, determinísticas e
// reversíveis, sobre os pixels que já existem:
//   - enquadramento quadrado centrado, no maior recorte possível;
//   - alongamento de contraste (normaliza a faixa tonal usando percentis);
//   - correção de exposição para uma luminância média alvo;
//   - leve aumento de saturação.
//
// Nenhum pixel é inventado. Se a foto está escura, ela clareia; se está torta,
// continua torta — e isso é honesto.

/** Lado da imagem de saída, em pixels. */
export const LADO_SAIDA = 1024

/** Luminância média alvo (0-255). Fotos de comida ficam boas por volta daqui. */
const LUMINANCIA_ALVO = 138
/** Percentis usados no alongamento de contraste; recortar as pontas evita que um
 *  único pixel branco (um reflexo) trave a normalização. */
const PERCENTIL_BAIXO = 0.005
const PERCENTIL_ALTO = 0.995
/** Ganho de saturação. Acima de ~1.25 a comida começa a parecer plástico. */
const SATURACAO = 1.12
/** Teto do ajuste de exposição, para não estourar fotos já bem expostas. */
const GANHO_MAX = 1.6
const GANHO_MIN = 0.7

export type ResultadoRealce = {
  /** Data URL JPEG da imagem realçada. */
  dataUrl: string
  /** O que foi aplicado, para mostrar ao comerciante. */
  ajustes: string[]
}

function carregarImagem(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem.')) }
    img.src = url
  })
}

/** Recorte quadrado centrado — o maior que cabe na foto. */
function recorteCentral(img: HTMLImageElement): { sx: number; sy: number; lado: number } {
  const lado = Math.min(img.naturalWidth, img.naturalHeight)
  return {
    sx: Math.floor((img.naturalWidth - lado) / 2),
    sy: Math.floor((img.naturalHeight - lado) / 2),
    lado,
  }
}

/** Valor no percentil `p` do histograma acumulado. */
function percentil(hist: Uint32Array, total: number, p: number): number {
  const alvo = total * p
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= alvo) return i
  }
  return 255
}

const limitar = (v: number, min = 0, max = 255) => (v < min ? min : v > max ? max : v)

/**
 * Aplica o realce e devolve a data URL. Roda só no cliente (usa canvas).
 * A imagem original nunca é sobrescrita — quem decide é o comerciante.
 */
export async function realcarFoto(file: File): Promise<ResultadoRealce> {
  if (typeof document === 'undefined') throw new Error('realcarFoto só roda no navegador.')

  const img = await carregarImagem(file)
  const { sx, sy, lado } = recorteCentral(img)

  const canvas = document.createElement('canvas')
  canvas.width = LADO_SAIDA
  canvas.height = LADO_SAIDA
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas indisponível neste navegador.')

  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, lado, lado, 0, 0, LADO_SAIDA, LADO_SAIDA)

  const dados = ctx.getImageData(0, 0, LADO_SAIDA, LADO_SAIDA)
  const px = dados.data
  const nPixels = LADO_SAIDA * LADO_SAIDA

  // Histograma de luminância (Rec. 601) e média.
  const hist = new Uint32Array(256)
  let somaLuma = 0
  for (let i = 0; i < px.length; i += 4) {
    const luma = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0
    hist[luma]++
    somaLuma += luma
  }
  const lumaMedia = somaLuma / nPixels

  const baixo = percentil(hist, nPixels, PERCENTIL_BAIXO)
  const alto = percentil(hist, nPixels, PERCENTIL_ALTO)
  // Faixa degenerada (foto chapada): não alonga, só ajusta exposição.
  const faixa = alto - baixo
  const alongar = faixa > 24

  const ganho = limitar(LUMINANCIA_ALVO / Math.max(1, lumaMedia), GANHO_MIN, GANHO_MAX)

  const ajustes: string[] = ['Enquadrado em quadrado, centralizado']
  if (alongar) ajustes.push('Contraste normalizado')
  if (Math.abs(ganho - 1) > 0.04) ajustes.push(ganho > 1 ? 'Iluminação aumentada' : 'Iluminação reduzida')
  ajustes.push('Saturação levemente realçada')

  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], g = px[i + 1], b = px[i + 2]

    if (alongar) {
      r = ((r - baixo) * 255) / faixa
      g = ((g - baixo) * 255) / faixa
      b = ((b - baixo) * 255) / faixa
    }

    r *= ganho; g *= ganho; b *= ganho

    // Saturação: afasta cada canal da luminância local.
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    r = luma + (r - luma) * SATURACAO
    g = luma + (g - luma) * SATURACAO
    b = luma + (b - luma) * SATURACAO

    px[i] = limitar(r)
    px[i + 1] = limitar(g)
    px[i + 2] = limitar(b)
    // alpha (px[i+3]) intocado
  }

  ctx.putImageData(dados, 0, 0)

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), ajustes }
}

/** Converte a data URL do realce de volta para File, para subir ao storage. */
export function dataUrlParaFile(dataUrl: string, nome: string): File {
  const [cabecalho, base64] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(cabecalho)?.[1] ?? 'image/jpeg'
  const bin = atob(base64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return new File([buf], nome, { type: mime })
}
