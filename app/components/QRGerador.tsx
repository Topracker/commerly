'use client'
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Download, FileText, Code2, ImageIcon } from 'lucide-react'

export type DestinoQR = { chave: string; label: string; url: string }

const OPCOES = { errorCorrectionLevel: 'M' as const, margin: 2, width: 512, color: { dark: '#12161B', light: '#FFFFFF' } }

// Gera QR code para um ou mais destinos, com download em PNG, SVG e PDF (impressão).
export function QRGerador({ destinos, nomeArquivo = 'commerly-qr' }: { destinos: DestinoQR[]; nomeArquivo?: string }) {
  const [chave, setChave] = useState(destinos[0]?.chave || '')
  const [png, setPng] = useState('')
  const destino = useMemo(() => destinos.find(d => d.chave === chave) || destinos[0], [chave, destinos])

  useEffect(() => {
    if (!destino) return
    QRCode.toDataURL(destino.url, OPCOES).then(setPng).catch(() => setPng(''))
  }, [destino?.url])

  if (!destino) return null

  function baixarPng() {
    if (!png) return
    const a = document.createElement('a'); a.href = png; a.download = `${nomeArquivo}-${destino.chave}.png`
    document.body.appendChild(a); a.click(); a.remove()
  }
  async function baixarSvg() {
    const svg = await QRCode.toString(destino.url, { type: 'svg', margin: 2, color: OPCOES.color })
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${nomeArquivo}-${destino.chave}.svg`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
  }
  function baixarPdf() {
    if (!png) return
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><title>${nomeArquivo}</title><style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui}img{width:60vmin;height:60vmin}p{color:#333}</style></head><body><img src="${png}"/><p>${destino.label} · Commerly</p><script>onload=()=>{print()}</script></body></html>`)
    w.document.close()
  }

  return (
    <div className="bg-card border border-borda rounded-2xl p-5">
      {destinos.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {destinos.map(d => (
            <button key={d.chave} onClick={() => setChave(d.chave)} className={`px-3 py-1.5 rounded-lg text-sm transition ${d.chave === chave ? 'bg-acento text-white' : 'bg-elevado border border-borda text-gray-400 hover:text-white'}`}>{d.label}</button>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="bg-white rounded-2xl p-3 shrink-0">
          {png ? <img src={png} alt="QR code" className="w-44 h-44" /> : <div className="w-44 h-44 flex items-center justify-center text-gray-400 text-sm">Gerando…</div>}
        </div>
        <div className="flex-1 w-full">
          <div className="bg-elevado rounded-xl px-3 py-2.5 text-gray-400 text-xs break-all mb-3">{destino.url}</div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={baixarPng} disabled={!png} className="flex items-center justify-center gap-1.5 bg-acento hover:bg-acento-forte disabled:opacity-50 text-white text-sm font-semibold px-3 py-2.5 rounded-xl"><ImageIcon size={15} /> PNG</button>
            <button onClick={baixarSvg} className="flex items-center justify-center gap-1.5 bg-elevado border border-borda text-white text-sm px-3 py-2.5 rounded-xl"><Code2 size={15} /> SVG</button>
            <button onClick={baixarPdf} disabled={!png} className="flex items-center justify-center gap-1.5 bg-elevado border border-borda text-white text-sm px-3 py-2.5 rounded-xl"><FileText size={15} /> PDF</button>
          </div>
          <p className="text-gray-500 text-xs mt-2 flex items-center gap-1"><Download size={12} /> Baixe, imprima e cole na loja. O PDF abre a janela de impressão.</p>
        </div>
      </div>
    </div>
  )
}

export default QRGerador
