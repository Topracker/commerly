import Link from 'next/link'
import { ArrowLeft, Star, Store, Package, Lock, ExternalLink } from 'lucide-react'
import { StreakCalendario } from './StreakCalendario'
import { medalhaPorSlug } from '../lib/crescimento'
import { tempoNaPlataforma, type PerfilPublico } from '../lib/perfilPublico'

const PAPEL_LABEL: Record<string, string> = { comerciante: 'Comerciante', entregador: 'Entregador', cliente: 'Cliente' }

export function PerfilPublicoView({ p }: { p: PerfilPublico }) {
  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Commerly</Link>
          <Link href="/hall-da-fama" className="ml-auto text-gray-400 hover:text-white text-sm">Hall da Fama</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        {/* Cabeçalho */}
        <div className="bg-card border border-borda rounded-2xl p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-elevado overflow-hidden shrink-0 flex items-center justify-center text-2xl">
            {p.foto ? <img src={p.foto} alt={p.nome} className="w-full h-full object-cover" /> : (p.papel === 'comerciante' ? '🏪' : p.papel === 'entregador' ? '🛵' : '🙂')}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold text-white truncate">{p.nome}</h1>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border" style={{ color: p.nivel.cor, borderColor: `${p.nivel.cor}66`, backgroundColor: `${p.nivel.cor}18` }}>
                {p.nivel.emoji} {p.nivel.nome}
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-0.5">
              {PAPEL_LABEL[p.papel]}{p.cidade ? ` · ${p.cidade}` : ''} · há {tempoNaPlataforma(p.desde)} na Commerly
            </p>
          </div>
        </div>

        {p.privado ? (
          <div className="bg-card border border-borda rounded-2xl p-8 text-center">
            <Lock size={22} className="text-gray-500 mx-auto mb-2" />
            <p className="text-white font-semibold">Perfil privado</p>
            <p className="text-gray-500 text-sm mt-1">Este cliente preferiu manter as conquistas em modo privado.</p>
          </div>
        ) : (
          <>
            {/* Métricas */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-borda rounded-2xl p-4 text-center">
                <p className="text-white font-bold text-2xl tabular-nums">{p.metricaValor}</p>
                <p className="text-gray-500 text-xs">{p.metricaLabel}</p>
              </div>
              <div className="bg-card border border-borda rounded-2xl p-4 text-center">
                <p className="text-white font-bold text-2xl tabular-nums flex items-center justify-center gap-1">
                  {p.aval.total > 0 ? <><Star size={16} className="text-amber-400 fill-amber-400" />{p.aval.media.toFixed(1)}</> : '—'}
                </p>
                <p className="text-gray-500 text-xs">{p.aval.total} avaliações</p>
              </div>
              <div className="bg-card border border-borda rounded-2xl p-4 text-center">
                <p className="text-white font-bold text-2xl tabular-nums">{p.medalhas.length}</p>
                <p className="text-gray-500 text-xs">medalhas</p>
              </div>
            </div>

            {/* Medalhas */}
            {p.medalhas.length > 0 && (
              <div className="bg-card border border-borda rounded-2xl p-5">
                <p className="text-white text-sm font-semibold mb-3">Medalhas</p>
                <div className="flex flex-wrap gap-2">
                  {p.medalhas.map(slug => {
                    const md = medalhaPorSlug(slug)
                    return (
                      <Link key={slug} href={`/medalhas/${slug}`} title={md?.secreta ? 'Secreta' : md?.nome || slug} className="text-3xl hover:scale-110 transition" style={{ lineHeight: 1 }}>
                        {md?.emoji || '🏅'}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Streak */}
            {p.streak && (p.streak.recorde > 0) && (
              <StreakCalendario dias={p.streak.dias} recorde={p.streak.recorde} ultimo_dia={p.streak.ultimo_dia} />
            )}

            {/* Produtos (comerciante) */}
            {p.papel === 'comerciante' && p.produtos && p.produtos.length > 0 && (
              <div className="bg-card border border-borda rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white text-sm font-semibold flex items-center gap-1.5"><Package size={15} className="text-acento" /> Produtos</p>
                  {p.lojaId && <Link href={`/loja/${p.lojaId}`} className="text-acento text-xs flex items-center gap-1">Ver loja <ExternalLink size={12} /></Link>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {p.produtos.map((pr, i) => (
                    <div key={i} className="rounded-xl border border-borda bg-superficie overflow-hidden">
                      <div className="aspect-square bg-elevado flex items-center justify-center">
                        {pr.imagem ? <img src={pr.imagem} alt={pr.nome} className="w-full h-full object-cover" /> : <Store size={20} className="text-gray-600" />}
                      </div>
                      <div className="p-2">
                        <p className="text-white text-xs font-medium truncate">{pr.nome}</p>
                        {pr.preco != null && <p className="text-acento text-xs">R$ {Number(pr.preco).toFixed(2)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Link externo (comerciante) */}
            {p.papel === 'comerciante' && p.websiteUrl && (
              <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className="block text-center bg-elevado border border-borda text-white text-sm font-medium px-4 py-3 rounded-2xl">
                Visitar site <ExternalLink size={13} className="inline ml-1" />
              </a>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default PerfilPublicoView
