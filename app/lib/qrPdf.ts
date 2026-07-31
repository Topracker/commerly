import { jsPDF } from 'jspdf'

// ============================================================================
// Cartaz do QR code em PDF de verdade (jsPDF), sem passar pelo diálogo de
// impressão.
// ----------------------------------------------------------------------------
// Antes o "PDF" era `window.open(...)` + `print()`: não gerava arquivo nenhum,
// dependia de o usuário escolher "Salvar como PDF" e sumia em silêncio quando o
// bloqueador de pop-up barrava a janela (`if (!w) return`). Mesmo motivo que
// levou o certificado para o jsPDF — ver `certificadoPdf.ts`.
//
// ⚠️ EMOJI NÃO ENTRA NO PDF: as fontes padrão do jsPDF são WinAnsi. Acento do
// português passa, emoji vira caractere quebrado. Por isso só texto simples.
// ============================================================================

export type QrPdf = {
  /** Data URL PNG do QR já renderizado na tela. */
  png: string
  /** Nome da loja/dono do código — vai no topo do cartaz. */
  titulo: string
  /** Ex.: "Cardápio digital" — o que o código abre. */
  legenda: string
  /** URL de destino, impressa por extenso para quem não puder escanear. */
  url: string
  nomeArquivo: string
}

export function baixarQrPdf({ png, titulo, legenda, url, nomeArquivo }: QrPdf) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const L = 210 // largura A4 em mm
  const centro = L / 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(18, 22, 27)
  doc.text(titulo, centro, 34, { align: 'center', maxWidth: L - 30 })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(15)
  doc.setTextColor(90, 98, 110)
  doc.text(legenda, centro, 46, { align: 'center', maxWidth: L - 30 })

  // QR centralizado. Fundo branco explícito: o PNG tem margem, mas se o papel
  // for colorido na impressão o quiet zone precisa existir mesmo assim.
  const lado = 110
  const x = centro - lado / 2
  const y = 60
  doc.setFillColor(255, 255, 255)
  doc.rect(x - 5, y - 5, lado + 10, lado + 10, 'F')
  doc.addImage(png, 'PNG', x, y, lado, lado)

  doc.setFontSize(11)
  doc.setTextColor(120, 128, 140)
  doc.text('Aponte a câmera do celular', centro, y + lado + 16, { align: 'center' })

  doc.setFontSize(9)
  doc.setTextColor(150, 156, 166)
  doc.text(url, centro, y + lado + 26, { align: 'center', maxWidth: L - 24 })

  doc.setFontSize(10)
  doc.setTextColor(0, 129, 95)
  doc.text('Commerly', centro, 280, { align: 'center' })

  doc.save(`${nomeArquivo}.pdf`)
}
