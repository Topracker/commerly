'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { createClient } from '../supabase'
import { perfilSlug } from '../lib/crescimento'
import { gerarStickerStory, gerarCardConquista, baixarDataUrl } from '../lib/cardImagem'
import { QRGerador, type DestinoQR } from '../components/QRGerador'
import {
  ArrowLeft, Sparkles, ImageIcon, Download, Loader2, Copy, Check, QrCode, Sticker, BadgeCheck,
} from 'lucide-react'

export default function Marketing() {
  const [loja, setLoja] = useState<any>(null)
  const [semLoja, setSemLoja] = useState(false)
  const [base, setBase] = useState('')
  const [post, setPost] = useState(''); const [gerandoPost, setGerandoPost] = useState(false); const [copiado, setCopiado] = useState(false)
  const [sticker, setSticker] = useState(''); const [gerandoSticker, setGerandoSticker] = useState(false)

  useEffect(() => {
    setBase(process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
    const sb = createClient()
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setSemLoja(true); return }
      const { data: l } = await sb.from('lojas').select('id, nome, tipo').eq('user_id', data.user.id).maybeSingle()
      if (l) setLoja(l); else setSemLoja(true)
    })
  }, [])

  async function gerarPost() {
    setGerandoPost(true); setPost('')
    const r = await fetch('/api/commerly-ai/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'post_instagram' }) })
    const d = await r.json().catch(() => null)
    setPost(d?.texto || 'Não consegui gerar agora.'); setGerandoPost(false)
  }
  async function gerarSticker() {
    if (!loja) return
    setGerandoSticker(true)
    const qr = await QRCode.toDataURL(`${base}/cardapio/${loja.id}`, { margin: 1, width: 520, color: { dark: '#12161B', light: '#FFFFFF' } }).catch(() => undefined)
    const png = await gerarStickerStory({ lojaNome: loja.nome, qrDataUrl: qr })
    setSticker(png); setGerandoSticker(false)
  }
  function baixarSelo() {
    if (!loja) return
    const png = gerarCardConquista({ emoji: '✅', titulo: 'Powered by', subtitulo: 'Este comércio usa a Commerly para vender mais.', nome: loja.nome, cor: '#f5c34b' })
    baixarDataUrl(png, `selo-commerly-${loja.id}.png`)
  }

  if (semLoja) return (
    <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center px-6 text-center">
      <div><p className="text-white font-semibold mb-1">Kit de marketing</p><p className="text-gray-400 text-sm mb-3">Entre como comerciante para usar.</p><Link href="/login" className="text-acento text-sm">Fazer login</Link></div>
    </main>
  )
  if (!loja) return <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center"><Loader2 className="animate-spin text-acento" /></main>

  const destinos: DestinoQR[] = [
    { chave: 'loja', label: 'Loja', url: `${base}/loja/${loja.id}` },
    { chave: 'cardapio', label: 'Cardápio', url: `${base}/cardapio/${loja.id}` },
    { chave: 'perfil', label: 'Perfil', url: `${base}/comerciante/${perfilSlug(loja.nome, loja.id)}` },
    { chave: 'app', label: 'Baixar app', url: `${base}/` },
  ]

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Painel</Link>
          <Link href="/commerly-ai" className="ml-auto text-gray-400 hover:text-white text-sm flex items-center gap-1"><Sparkles size={14} /> Commerly AI</Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Kit de marketing</h1>
          <p className="text-gray-400 text-sm mt-1">Materiais prontos da {loja.nome} para bombar nas redes.</p>
        </div>

        {/* Post Instagram */}
        <section className="bg-card border border-borda rounded-2xl p-5">
          <p className="text-white text-sm font-semibold flex items-center gap-1.5 mb-1"><ImageIcon size={16} className="text-acento" /> Post para Instagram</p>
          <p className="text-gray-500 text-xs mb-3">Legenda gerada com os dados reais da sua loja.</p>
          {post && (
            <div className="bg-superficie border border-borda rounded-xl p-3 mb-3">
              <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{post}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={gerarPost} disabled={gerandoPost} className="flex items-center gap-1.5 bg-acento hover:bg-acento-forte text-white text-sm font-semibold px-4 py-2 rounded-xl">{gerandoPost ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {post ? 'Gerar outro' : 'Gerar post'}</button>
            {post && <button onClick={() => { navigator.clipboard?.writeText(post); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }} className="flex items-center gap-1.5 bg-elevado border border-borda text-white text-sm px-4 py-2 rounded-xl">{copiado ? <Check size={14} className="text-green-400" /> : <Copy size={14} />} Copiar</button>}
          </div>
        </section>

        {/* Adesivo de story */}
        <section className="bg-card border border-borda rounded-2xl p-5">
          <p className="text-white text-sm font-semibold flex items-center gap-1.5 mb-1"><Sticker size={16} className="text-acento" /> Adesivo &quot;Peça aqui pela Commerly&quot;</p>
          <p className="text-gray-500 text-xs mb-3">Imagem para o story com o QR do seu cardápio.</p>
          <div className="flex items-center gap-4">
            {sticker && <img src={sticker} alt="Adesivo de story" className="w-28 rounded-xl border border-borda" />}
            <div className="flex flex-col gap-2">
              <button onClick={gerarSticker} disabled={gerandoSticker} className="flex items-center gap-1.5 bg-acento hover:bg-acento-forte text-white text-sm font-semibold px-4 py-2 rounded-xl">{gerandoSticker ? <Loader2 size={14} className="animate-spin" /> : <Sticker size={14} />} Gerar adesivo</button>
              {sticker && <button onClick={() => baixarDataUrl(sticker, `pedir-commerly-${loja.id}.png`)} className="flex items-center gap-1.5 bg-elevado border border-borda text-white text-sm px-4 py-2 rounded-xl"><Download size={14} /> Baixar PNG</button>}
            </div>
          </div>
        </section>

        {/* Selo Powered by Commerly */}
        <section className="bg-card border border-borda rounded-2xl p-5">
          <p className="text-white text-sm font-semibold flex items-center gap-1.5 mb-1"><BadgeCheck size={16} className="text-acento" /> Selo &quot;Powered by Commerly&quot;</p>
          <p className="text-gray-500 text-xs mb-3">Mostre que sua loja é movida pela Commerly.</p>
          <button onClick={baixarSelo} className="flex items-center gap-1.5 bg-elevado border border-borda text-white text-sm px-4 py-2 rounded-xl"><Download size={14} /> Baixar selo PNG</button>
        </section>

        {/* QR codes */}
        <section>
          <p className="text-white text-sm font-semibold flex items-center gap-1.5 mb-2"><QrCode size={16} className="text-acento" /> QR codes</p>
          <QRGerador destinos={destinos} nomeArquivo={`commerly-${loja.id}`} />
        </section>
      </div>
    </main>
  )
}
