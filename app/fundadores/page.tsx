import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingShell, MCard } from '../components/MarketingShell'
import { createAdminClient } from '../lib/supabase-admin'
import { flagAtiva } from '../lib/featureFlags'
import { Check, Store } from 'lucide-react'
import { VAGAS_FUNDADOR, PRECO_FUNDADOR, PRECO_NORMAL, brl } from '../lib/precos'

export const metadata: Metadata = {
  title: 'Programa Fundadores — os 100 primeiros comerciantes',
  description: 'Os 100 primeiros comerciantes da Commerly ganham selo Fundador, R$ 29,90/mês para sempre, prioridade no suporte e reconhecimento permanente.',
  alternates: { canonical: '/fundadores' },
}

export const dynamic = 'force-dynamic'

const TOTAL_VAGAS = VAGAS_FUNDADOR
const BENEFICIOS = [
  'Selo “Fundador” permanente no perfil',
  `${brl(PRECO_FUNDADOR)}/mês para sempre (preço travado) — o normal é ${brl(PRECO_NORMAL)}`,
  'Destaque especial na busca e no app',
  'Prioridade no suporte',
  'Acesso antecipado a novas features',
  'Reconhecimento público permanente',
]

export default async function Fundadores() {
  const admin = createAdminClient()

  // Gating: programa pode ser desligado globalmente pelo admin.
  if (!(await flagAtiva('fundadores', null, admin))) {
    return (
      <MarketingShell
        eyebrow="Programa Fundadores"
        titulo="Programa temporariamente fechado"
        subtitulo="As vagas de fundador não estão abertas no momento. Fique de olho — em breve teremos novidades."
        cta={{ href: '/login', label: 'Cadastrar minha loja' }}
      >
        <MCard className="text-center py-10">
          <p className="text-4xl mb-2">🔒</p>
          <p className="text-white font-semibold">Inscrições encerradas por ora</p>
          <p className="text-gray-400 text-sm mt-1">Cadastre sua loja e comece a vender — o programa pode reabrir na sua cidade.</p>
        </MCard>
      </MarketingShell>
    )
  }

  const { data: fund } = await admin
    .from('fundadores').select('loja_id, ordem, cidade, created_at').order('ordem', { ascending: true }).limit(VAGAS_FUNDADOR)

  const lojaIds = (fund || []).map(f => f.loja_id)
  let lojas: Record<string, { nome: string; tipo: string; fotos_fachada?: string[] | null }> = {}
  if (lojaIds.length > 0) {
    const { data } = await admin.from('lojas_publicas').select('id, nome, tipo, fotos_fachada').in('id', lojaIds)
    for (const l of data || []) lojas[l.id] = l as any
  }
  const preenchidas = fund?.length || 0

  return (
    <MarketingShell
      eyebrow="Programa Fundadores"
      titulo="Os 100 primeiros. Para sempre."
      subtitulo="Quem chega primeiro constrói a Commerly com a gente — e nunca é esquecido."
      cta={{ href: '/login', label: 'Quero ser fundador' }}
    >
      <MCard className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-white font-semibold">Vagas de fundador</p>
          <p className="text-acento font-bold tabular-nums">{preenchidas}/{TOTAL_VAGAS}</p>
        </div>
        <div className="h-2 bg-elevado rounded-full overflow-hidden">
          <div className="h-full bg-acento rounded-full transition-all" style={{ width: `${Math.round((preenchidas / TOTAL_VAGAS) * 100)}%` }} />
        </div>
        <ul className="grid sm:grid-cols-2 gap-2 mt-4">
          {BENEFICIOS.map(b => (
            <li key={b} className="text-gray-300 text-sm flex items-start gap-2"><Check size={16} className="text-acento shrink-0 mt-0.5" /> {b}</li>
          ))}
        </ul>
      </MCard>

      {preenchidas === 0 ? (
        <MCard className="text-center py-10">
          <p className="text-4xl mb-2">🏅</p>
          <p className="text-white font-semibold">As vagas de fundador estão abertas</p>
          <p className="text-gray-400 text-sm mt-1">Seja um dos 100 primeiros comerciantes e apareça aqui para sempre.</p>
          <Link href="/login" className="inline-block mt-4 bg-acento hover:bg-acento-forte text-white font-semibold px-6 py-3 rounded-2xl transition">Cadastrar minha loja</Link>
        </MCard>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(fund || []).map(f => {
            const l = lojas[f.loja_id]
            return (
              <div key={f.loja_id} className="bg-card border border-borda rounded-2xl overflow-hidden">
                <div className="relative h-28 bg-elevado">
                  {l?.fotos_fachada?.[0]
                    ? <img src={l.fotos_fachada[0]} alt={l?.nome} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-azul/25 via-elevado to-acento/15"><Store size={24} className="text-white/40" /></div>}
                  <span className="absolute top-2 left-2 text-[11px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 backdrop-blur px-2 py-0.5 rounded-full font-semibold">🏅 Fundador #{f.ordem ?? '—'}</span>
                </div>
                <div className="p-3">
                  <p className="text-white font-semibold truncate">{l?.nome || 'Loja'}</p>
                  <p className="text-gray-500 text-xs">{l?.tipo}{f.cidade ? ` · ${f.cidade}` : ''}</p>
                  <p className="text-gray-600 text-[11px] mt-1">Desde {new Date(f.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </MarketingShell>
  )
}
