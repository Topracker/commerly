import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '../../lib/supabase-admin'

export const metadata: Metadata = {
  title: 'Dashboard de Expansão — Commerly',
  description: 'Cidades em análise, próximas a serem lançadas e quanto falta para cada meta.',
  alternates: { canonical: '/expansao/dashboard' },
}
export const dynamic = 'force-dynamic'

export default async function ExpansaoDashboard() {
  const admin = createAdminClient()
  const { data: cidades } = await admin
    .from('cidades_expansao').select('*').order('pontos', { ascending: false })

  const lista = cidades || []
  const ativas = lista.filter(c => c.status === 'ativa')
  const lancando = lista.filter(c => c.status === 'lancando')
  const analise = lista.filter(c => c.status === 'analise' || c.status === 'pre')
  const proximas = [...analise].sort((a, b) => (b.pontos / b.meta_pontos) - (a.pontos / a.meta_pontos)).slice(0, 3)

  const Bloco = ({ titulo, itens }: { titulo: string; itens: typeof lista }) => (
    <div className="bg-card border border-borda rounded-2xl p-5">
      <p className="text-white font-semibold mb-3">{titulo} <span className="text-gray-500 font-normal text-sm">({itens.length})</span></p>
      {itens.length === 0 ? <p className="text-gray-500 text-sm">Nenhuma por enquanto.</p> : (
        <ul className="flex flex-col gap-3">
          {itens.map(c => {
            const pct = Math.min(100, Math.round((c.pontos / c.meta_pontos) * 100))
            const faltam = Math.max(0, c.meta_pontos - c.pontos)
            return (
              <li key={c.slug}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <Link href={`/expansao/${c.slug}`} className="text-white hover:text-acento">{c.nome}/{c.uf}</Link>
                  <span className="text-gray-500 text-xs tabular-nums">{faltam > 0 ? `faltam ${faltam} pts` : 'meta batida 🎉'}</span>
                </div>
                <div className="h-1.5 bg-elevado rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-yellow-400' : 'bg-acento'}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/expansao" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Expansão</Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="font-display text-3xl font-bold text-white mb-1">Dashboard de expansão</h1>
        <p className="text-gray-400 text-sm mb-6">Onde a Commerly está, para onde vai e quanto falta.</p>

        <div className="grid sm:grid-cols-2 gap-4">
          <Bloco titulo="🎯 Próximas cidades" itens={proximas as any} />
          <Bloco titulo="🎉 Lançando agora" itens={lancando as any} />
          <Bloco titulo="🔎 Em análise" itens={analise as any} />
          <Bloco titulo="✅ Ativas" itens={ativas as any} />
        </div>
      </div>
    </main>
  )
}
