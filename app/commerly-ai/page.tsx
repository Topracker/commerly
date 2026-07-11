'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '../supabase'
import {
  Sparkles, ArrowLeft, ImageIcon, MessageCircle, FileBarChart, Copy, Check, Loader2,
  Boxes, MessageSquareReply, LineChart, Wand2,
} from 'lucide-react'

type Gerador = { tipo: string; label: string; icone: any; desc: string }
const GERADORES: Gerador[] = [
  { tipo: 'post_instagram', label: 'Post para Instagram', icone: ImageIcon, desc: 'Legenda pronta com hashtags e dados reais da sua loja.' },
  { tipo: 'post_whatsapp', label: 'Mensagem de WhatsApp', icone: MessageCircle, desc: 'Texto curto para lista de transmissão.' },
  { tipo: 'relatorio', label: 'Relatório inteligente', icone: FileBarChart, desc: 'Leitura dos seus números + 3 sugestões da semana.' },
]
const EM_BREVE = [
  { label: 'Sugestões de estoque', icone: Boxes, desc: 'Quando repor cada produto, com base no giro.' },
  { label: 'Respostas automáticas', icone: MessageSquareReply, desc: 'IA responde clientes no seu tom de voz.' },
  { label: 'Análise de vendas', icone: LineChart, desc: 'Padrões, horários de pico e oportunidades.' },
]

export default function CommerlyAI() {
  const [nome, setNome] = useState<string | null>(null)
  const [semLoja, setSemLoja] = useState(false)
  const [ativo, setAtivo] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [fonte, setFonte] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setSemLoja(true); return }
      const { data: loja } = await sb.from('lojas').select('nome').eq('user_id', data.user.id).maybeSingle()
      if (loja) setNome(loja.nome); else setSemLoja(true)
    })
  }, [])

  async function gerar(tipo: string) {
    setAtivo(tipo); setTexto(''); setFonte('')
    const r = await fetch('/api/commerly-ai/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo }) })
    const d = await r.json().catch(() => null)
    setAtivo(null)
    if (d?.texto) { setTexto(d.texto); setFonte(d.fonte || '') }
    else setTexto(d?.erro || 'Não consegui gerar agora. Tente novamente.')
  }
  function copiar() {
    navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }).catch(() => {})
  }

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Painel</Link>
          <Link href="/marketing" className="ml-auto text-gray-400 hover:text-white text-sm flex items-center gap-1"><ImageIcon size={14} /> Kit de marketing</Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="font-display text-3xl font-bold text-white flex items-center gap-2"><Sparkles size={26} className="text-acento" /> Commerly AI</h1>
        <p className="text-gray-400 text-sm mt-1 mb-6">Sua central de inteligência{nome ? ` para a ${nome}` : ''}. Conteúdo e análises com dados reais.</p>

        {semLoja ? (
          <div className="bg-card border border-borda rounded-2xl p-6 text-center">
            <p className="text-white font-semibold mb-1">Área do comerciante</p>
            <p className="text-gray-400 text-sm mb-3">Entre com sua conta de comerciante para usar a Commerly AI.</p>
            <Link href="/login" className="text-acento text-sm">Fazer login</Link>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              {GERADORES.map(g => (
                <button key={g.tipo} onClick={() => gerar(g.tipo)} disabled={!!ativo} className="text-left bg-card border border-borda hover:border-acento/40 rounded-2xl p-4 transition disabled:opacity-60">
                  <g.icone size={20} className="text-acento mb-2" />
                  <p className="text-white text-sm font-semibold">{g.label}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{g.desc}</p>
                  <span className="inline-flex items-center gap-1 text-acento text-xs mt-2 font-medium">
                    {ativo === g.tipo ? <><Loader2 size={12} className="animate-spin" /> Gerando…</> : <><Wand2 size={12} /> Gerar</>}
                  </span>
                </button>
              ))}
            </div>

            {texto && (
              <div className="bg-card border border-borda rounded-2xl p-5 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white text-sm font-semibold">Resultado {fonte === 'template' && <span className="text-gray-500 font-normal">· modelo base</span>}</p>
                  <div className="flex gap-2">
                    <button onClick={copiar} className="flex items-center gap-1 bg-elevado border border-borda text-white text-xs px-3 py-1.5 rounded-lg">{copiado ? <Check size={13} className="text-green-400" /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}</button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-[#25D366] text-white text-xs px-3 py-1.5 rounded-lg"><MessageCircle size={13} /></a>
                  </div>
                </div>
                <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{texto}</p>
              </div>
            )}

            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Em breve</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {EM_BREVE.map(f => (
                <div key={f.label} className="bg-card/60 border border-borda border-dashed rounded-2xl p-4">
                  <f.icone size={18} className="text-gray-500 mb-2" />
                  <p className="text-gray-300 text-sm font-medium">{f.label}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
