import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'

// ============================================================================
// Certificado em PDF de verdade (jsPDF), sem passar pelo diálogo de impressão.
// ----------------------------------------------------------------------------
// Antes o "Baixar PDF" era `window.print()`: dependia de o usuário escolher
// "Salvar como PDF" e ligar o fundo do papel, e no celular quase nunca saía
// direito. Agora o arquivo é montado aqui e baixa com um clique.
//
// ⚠️ EMOJI NÃO ENTRA NO PDF. As fontes padrão do jsPDF (Helvetica etc.) são
// WinAnsi: acentos do português funcionam, emoji vira caractere quebrado. Por
// isso o selo é DESENHADO (círculo + inicial), não escrito. Se algum dia
// precisar do emoji real, seria preciso embutir uma fonte TTF com essa faixa —
// o que pesa centenas de KB no bundle.
// ============================================================================

export type CertificadoPdf = {
  tipo: string
  titulo: string
  subtitulo: string
  corpo: string
  cor: string
  nome: string
  /** Vai dentro do QR — leva quem escaneia ao perfil público. */
  urlPerfil: string
}

/** #rrggbb -> [r,g,b]; devolve dourado se vier algo inesperado. */
function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [245, 195, 75]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export async function baixarCertificadoPdf(c: CertificadoPdf): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const L = 297, A = 210
  const [r, g, b] = rgb(c.cor)

  // Fundo creme claro — imprime bem e não gasta tinta como um fundo escuro.
  doc.setFillColor(252, 251, 248)
  doc.rect(0, 0, L, A, 'F')

  // Moldura dupla na cor do certificado.
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(1.6); doc.rect(10, 10, L - 20, A - 20)
  doc.setLineWidth(0.3); doc.rect(13.5, 13.5, L - 27, A - 27)

  doc.setTextColor(120, 120, 120)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('C O M M E R L Y', L / 2, 30, { align: 'center' })

  // Selo desenhado (ver nota sobre emoji no topo do arquivo).
  doc.setFillColor(r, g, b)
  doc.circle(L / 2, 46, 9, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.text((c.titulo[0] || 'C').toUpperCase(), L / 2, 50, { align: 'center' })

  doc.setTextColor(25, 25, 25)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(34)
  doc.text(c.titulo, L / 2, 72, { align: 'center' })

  doc.setFont('helvetica', 'normal'); doc.setFontSize(12)
  doc.setTextColor(110, 110, 110)
  doc.text(c.subtitulo, L / 2, 82, { align: 'center' })

  // Nome do titular, com régua embaixo.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(26)
  doc.setTextColor(r, g, b)
  doc.text(c.nome || '—', L / 2, 105, { align: 'center' })
  doc.setDrawColor(220, 216, 208); doc.setLineWidth(0.4)
  doc.line(L / 2 - 60, 110, L / 2 + 60, 110)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5)
  doc.setTextColor(70, 70, 70)
  doc.text(doc.splitTextToSize(c.corpo, 190), L / 2, 124, { align: 'center' })

  // QR do perfil público, canto inferior direito.
  try {
    const dataUrl = await QRCode.toDataURL(c.urlPerfil, {
      margin: 0, width: 320, color: { dark: '#191919', light: '#FCFBF8' },
    })
    doc.addImage(dataUrl, 'PNG', L - 52, A - 62, 30, 30)
    doc.setFontSize(7.5); doc.setTextColor(140, 140, 140)
    doc.text('Verifique o perfil', L - 37, A - 28, { align: 'center' })
  } catch {
    // Sem QR o certificado ainda vale — não vale abortar o download por isso.
  }

  const emissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.setTextColor(140, 140, 140)
  doc.text(`Emitido em ${emissao}`, 26, A - 30)
  doc.setDrawColor(200, 196, 190); doc.setLineWidth(0.3)
  doc.line(26, A - 24, 96, A - 24)
  doc.setFontSize(8)
  doc.text('Commerly — Sistema Operacional do Pequeno Comercio', 26, A - 19)

  const slug = (c.nome || 'certificado').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  doc.save(`commerly-${c.tipo}-${slug || 'certificado'}.pdf`)
}
