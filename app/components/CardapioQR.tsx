'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, Download, Copy, ExternalLink } from 'lucide-react'

// QR code do cardápio digital da loja (só nichos de delivery). Gera a imagem
// no client com a biblioteca `qrcode` e permite baixar como PNG para imprimir
// e colar na mesa/balcão. O link aponta para /cardapio/{loja_id}.
export function CardapioQR({ lojaId, lojaNome }: { lojaId: string; lojaNome: string }) {
  const [dataUrl, setDataUrl] = useState('')
  const [link, setLink] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const url = `${base}/cardapio/${lojaId}`
    setLink(url)
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 512,
      color: { dark: '#12161B', light: '#FFFFFF' },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(''))
  }, [lojaId])

  function baixarPng() {
    if (!dataUrl) return
    const slug = lojaNome.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'loja'
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `cardapio-${slug}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch { /* ignore */ }
  }

  return (
    <div className="bg-gray-900 rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <QrCode size={18} className="text-blue-400" />
        <h2 className="text-white font-semibold">QR code do cardápio</h2>
      </div>
      <p className="text-gray-400 text-sm mb-4">
        Imprima e cole na mesa, no balcão ou na vitrine. Ao escanear, o cliente
        abre seu cardápio digital e pode fazer o pedido — sem precisar de login.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="bg-white rounded-2xl p-3 shrink-0">
          {dataUrl ? (
            <img src={dataUrl} alt="QR code do cardápio" width={176} height={176} className="w-44 h-44" />
          ) : (
            <div className="w-44 h-44 flex items-center justify-center text-gray-400 text-sm">Gerando…</div>
          )}
        </div>

        <div className="flex-1 w-full flex flex-col gap-2">
          <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-gray-300 text-xs break-all">
            {link}
          </div>
          <button
            onClick={baixarPng}
            disabled={!dataUrl}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            <Download size={16} />
            Baixar PNG
          </button>
          <div className="flex gap-2">
            <button
              onClick={copiar}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-medium px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm"
            >
              <Copy size={15} />
              {copiado ? 'Copiado!' : 'Copiar link'}
            </button>
            <a
              href={link || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-medium px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm"
            >
              <ExternalLink size={15} />
              Abrir
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
