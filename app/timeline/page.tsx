import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '../lib/supabase-admin'

export const metadata: Metadata = {
  title: 'A história da Commerly — Timeline',
  description: 'Os marcos reais da construção da maior comunidade de pequenos comércios do Brasil.',
  alternates: { canonical: '/timeline' },
}
export const dynamic = 'force-dynamic'

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null)

export default async function Timeline() {
  const admin = createAdminClient()
  const first = (t: string, order = 'created_at') => admin.from(t).select('nome, created_at').order(order, { ascending: true }).limit(1)

  const [
    { data: loja }, { data: cli }, { data: ent }, { data: ped },
    { count: comerciantes }, { count: pedidos }, { data: cidadesAtivas },
  ] = await Promise.all([
    first('lojas'), first('clientes'), first('entregadores'),
    admin.from('pedidos_clientes').select('created_at').order('created_at', { ascending: true }).limit(1),
    admin.from('lojas').select('id', { count: 'exact', head: true }),
    admin.from('pedidos_clientes').select('id', { count: 'exact', head: true }).neq('status', 'cancelado'),
    admin.from('cidades_expansao').select('nome, uf, lancada_em').eq('status', 'ativa').order('lancada_em', { ascending: true }),
  ])

  type Ev = { data: string | null; icone: string; titulo: string; texto: string }
  const eventos: Ev[] = []
  const primeiroReg = [loja?.[0]?.created_at, cli?.[0]?.created_at, ent?.[0]?.created_at].filter(Boolean).sort()[0]
  if (primeiroReg) eventos.push({ data: primeiroReg, icone: '🚀', titulo: 'A Commerly nasceu', texto: 'O começo do Sistema Operacional do Pequeno Comércio.' })
  if (loja?.[0]) eventos.push({ data: loja[0].created_at, icone: '🏪', titulo: 'Primeiro comerciante', texto: `${loja[0].nome} foi o primeiro comércio a entrar.` })
  if (ent?.[0]) eventos.push({ data: ent[0].created_at, icone: '🛵', titulo: 'Primeiro entregador', texto: `${ent[0].nome} entrou na rede oficial.` })
  if (cli?.[0]) eventos.push({ data: cli[0].created_at, icone: '🙂', titulo: 'Primeiro cliente', texto: `${cli[0].nome} fez parte do começo.` })
  if (ped?.[0]) eventos.push({ data: ped[0].created_at, icone: '📦', titulo: 'Primeiro pedido', texto: 'A primeira venda passou pela plataforma.' })
  for (const c of cidadesAtivas || []) {
    if (c.lancada_em) eventos.push({ data: c.lancada_em, icone: '🎉', titulo: `Commerly chegou em ${c.nome}/${c.uf}`, texto: 'Mais uma cidade escolhida pela comunidade.' })
  }
  eventos.sort((a, b) => String(a.data).localeCompare(String(b.data)))

  // Próximos marcos (thresholds) com progresso.
  const marcos = [
    { atual: comerciantes || 0, metas: [100, 500, 1000], label: 'comerciantes', emoji: '🏪' },
    { atual: pedidos || 0, metas: [100, 1000, 10000], label: 'pedidos', emoji: '📦' },
    { atual: (cidadesAtivas || []).length, metas: [1, 10, 50, 100], label: 'cidades', emoji: '🗺️' },
  ]

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Commerly</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="font-display text-4xl font-bold text-white text-center">A nossa história</h1>
        <p className="text-gray-400 text-center mt-3 mb-10">Marcos reais de quem está construindo a maior comunidade de pequenos comércios do Brasil.</p>

        {eventos.length === 0 ? (
          <p className="text-gray-500 text-center">A história está só começando. Volte em breve. 💛</p>
        ) : (
          <ol className="relative border-l border-borda ml-3">
            {eventos.map((e, i) => (
              <li key={i} className="mb-8 ml-6">
                <span className="absolute -left-3.5 flex items-center justify-center w-7 h-7 rounded-full bg-card border border-borda text-sm">{e.icone}</span>
                <p className="text-acento text-xs font-semibold">{fmt(e.data)}</p>
                <p className="text-white font-semibold">{e.titulo}</p>
                <p className="text-gray-400 text-sm">{e.texto}</p>
              </li>
            ))}
          </ol>
        )}

        {/* Próximos marcos */}
        <h2 className="font-display text-xl font-bold text-white mt-12 mb-4">Próximos marcos</h2>
        <div className="space-y-3">
          {marcos.map((m, i) => {
            const proxima = m.metas.find(x => m.atual < x)
            const atingidas = m.metas.filter(x => m.atual >= x)
            return (
              <div key={i} className="bg-card border border-borda rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white text-sm font-medium">{m.emoji} {m.atual} {m.label}</span>
                  {proxima ? <span className="text-gray-500 text-xs tabular-nums">próximo: {proxima}</span> : <span className="text-acento text-xs">todos os marcos batidos 🎉</span>}
                </div>
                {proxima && (
                  <div className="h-1.5 bg-elevado rounded-full overflow-hidden"><div className="h-full bg-acento rounded-full" style={{ width: `${Math.min(100, Math.round((m.atual / proxima) * 100))}%` }} /></div>
                )}
                {atingidas.length > 0 && <p className="text-gray-500 text-xs mt-1.5">Batidos: {atingidas.join(', ')}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
