import Link from 'next/link'
import { ArrowLeft, MapPin, Users, Trophy } from 'lucide-react'
import { createAdminClient } from '../../lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ cidade: string }> }) {
  const { cidade } = await params
  const admin = createAdminClient()
  const { data } = await admin.from('cidades_expansao').select('nome, uf').eq('slug', cidade).maybeSingle()
  const nome = data ? `${data.nome}/${data.uf}` : cidade
  return {
    title: `Commerly em ${nome} — expansão`,
    description: `Acompanhe a chegada da Commerly em ${nome}: progresso, pontos e como ajudar.`,
    alternates: { canonical: `/expansao/${cidade}` },
  }
}

const STATUS_ROTULO: Record<string, string> = {
  pre: 'Pré-cadastro', analise: 'Em análise', lancando: 'Lançando 🎉', ativa: 'Ativa ✅',
}

export default async function CidadeExpansao({ params }: { params: Promise<{ cidade: string }> }) {
  const { cidade: slug } = await params
  const admin = createAdminClient()

  const { data: cid } = await admin
    .from('cidades_expansao').select('*').eq('slug', slug).maybeSingle()

  if (!cid) {
    return (
      <main data-theme="dark" className="min-h-screen bg-fundo font-body flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-white font-semibold mb-2">Cidade não encontrada</p>
          <p className="text-gray-400 text-sm mb-4">Essa cidade ainda não está na corrida.</p>
          <Link href="/expansao" className="text-acento font-medium">Ver todas as cidades</Link>
        </div>
      </main>
    )
  }

  const [{ data: feed }, { count: interessados }, { data: pontosRows }] = await Promise.all([
    admin.from('feed_conquistas').select('id, texto, created_at').eq('cidade', cid.nome).order('created_at', { ascending: false }).limit(10),
    admin.from('expansao_interesse').select('id', { count: 'exact', head: true }).eq('cidade_slug', slug),
    admin.from('expansao_pontos').select('tipo, pontos').eq('cidade_id', cid.id),
  ])

  const porTipo: Record<string, number> = {}
  for (const r of pontosRows || []) porTipo[r.tipo] = (porTipo[r.tipo] || 0) + (r.pontos || 0)
  const pct = Math.min(100, Math.round((cid.pontos / cid.meta_pontos) * 100))

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/expansao" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Expansão</Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-1">
          <MapPin size={20} className="text-acento" />
          <h1 className="font-display text-3xl font-bold text-white">{cid.nome}<span className="text-gray-500 text-xl">/{cid.uf}</span></h1>
          <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-elevado border border-borda text-gray-300">{STATUS_ROTULO[cid.status] || cid.status}</span>
        </div>

        {/* Progresso */}
        <div className="bg-card border border-borda rounded-2xl p-5 mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-400">Progresso até a meta</span>
            <span className="text-white font-semibold tabular-nums">{cid.pontos}/{cid.meta_pontos} pts</span>
          </div>
          <div className="h-2.5 bg-elevado rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-yellow-400' : 'bg-acento'}`} style={{ width: `${pct}%` }} />
          </div>
          {pct >= 100 && <p className="text-yellow-300 text-sm mt-2">🎉 {cid.nome} foi escolhida!</p>}
        </div>

        {/* Números */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-card border border-borda rounded-2xl p-4 text-center">
            <Users size={16} className="text-acento mx-auto mb-1" />
            <p className="text-white font-bold text-xl tabular-nums">{interessados || 0}</p>
            <p className="text-gray-500 text-xs">interessados</p>
          </div>
          {(['comerciante', 'entregador', 'cliente'] as const).map(t => (
            <div key={t} className="bg-card border border-borda rounded-2xl p-4 text-center">
              <p className="text-white font-bold text-xl tabular-nums">{porTipo[t] || 0}</p>
              <p className="text-gray-500 text-xs">pts de {t}s</p>
            </div>
          ))}
        </div>

        {/* Mural da cidade */}
        <div className="bg-card border border-borda rounded-2xl p-5 mt-4">
          <p className="text-white font-semibold mb-3 flex items-center gap-2"><Trophy size={18} className="text-acento" /> Mural da cidade</p>
          {feed && feed.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {feed.map(f => (
                <li key={f.id} className="text-gray-300 text-sm flex items-center justify-between gap-2">
                  <span>{f.texto}</span>
                  <span className="text-gray-600 text-xs shrink-0">{new Date(f.created_at).toLocaleDateString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Seja o primeiro a movimentar {cid.nome}. Cadastre-se e comece a somar pontos.</p>
          )}
        </div>

        <div className="text-center mt-6">
          <Link href="/expansao" className="inline-block bg-acento hover:bg-acento-forte text-white font-semibold px-6 py-3 rounded-2xl transition">
            Quero ajudar a trazer a Commerly
          </Link>
        </div>
      </div>
    </main>
  )
}
