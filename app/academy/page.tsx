'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import {
  CATEGORIAS, TOTAL_AULAS, aulaValida, concluidasNaCategoria, minutosLeitura, progressoPct,
  type Aula,
} from '../lib/academy'
import { GraduationCap, Check, Clock, ChevronDown, ArrowRight, Circle } from 'lucide-react'

export default function Academy() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const router = useRouter()

  const [concluidas, setConcluidas] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    const { data } = await supabase
      .from('academy_progresso').select('aula_slug').eq('loja_id', loja.id)
    // Aulas removidas do código continuam no banco; ignoramos ao contar.
    setConcluidas(new Set((data || []).map((r: { aula_slug: string }) => r.aula_slug).filter(aulaValida)))
    setCarregando(false)
  }

  async function alternarConclusao(aula: Aula) {
    const jaConcluida = concluidas.has(aula.slug)
    setSalvando(aula.slug)

    // Otimista: a lista é local e o custo de reverter é baixo.
    setConcluidas(prev => {
      const proximo = new Set(prev)
      if (jaConcluida) proximo.delete(aula.slug)
      else proximo.add(aula.slug)
      return proximo
    })

    const { error } = jaConcluida
      ? await supabase.from('academy_progresso').delete()
          .eq('loja_id', loja.id).eq('aula_slug', aula.slug)
      // O índice único (loja_id, aula_slug) transforma o clique repetido em no-op.
      : await supabase.from('academy_progresso')
          .upsert({ loja_id: loja.id, aula_slug: aula.slug }, { onConflict: 'loja_id,aula_slug', ignoreDuplicates: true })

    setSalvando(null)
    if (error) {
      setConcluidas(prev => {
        const proximo = new Set(prev)
        if (jaConcluida) proximo.add(aula.slug)
        else proximo.delete(aula.slug)
        return proximo
      })
      mostrarToast('Não foi possível salvar seu progresso. Tente de novo.', 'erro')
      return
    }
    if (!jaConcluida) mostrarToast('Aula concluída! 🎓', 'sucesso')
  }

  if (loading) return null
  if (!loja) return null

  const total = concluidas.size
  const pct = progressoPct(concluidas)
  const tudoConcluido = total >= TOTAL_AULAS

  return (
    <AppLayout loja={loja} sair={sair} titulo="Commerly Academy">
      <Toast toast={toast} />

      {/* Progresso geral */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-900/40 border border-gray-800 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
            <GraduationCap size={20} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold">Aprenda a vender mais</p>
            <p className="text-gray-500 text-xs">Aulas curtas, escritas para quem tem o dia cheio.</p>
          </div>
          <span className="text-blue-300 font-bold text-sm shrink-0">{total}/{TOTAL_AULAS}</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
          <div className="h-2 rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-gray-400 text-xs mt-2">
          {carregando ? 'Carregando seu progresso...'
            : tudoConcluido ? '🎉 Você concluiu todas as aulas. Volte quando publicarmos novas.'
            : `${pct}% concluído — faltam ${TOTAL_AULAS - total} aula${TOTAL_AULAS - total > 1 ? 's' : ''}.`}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {CATEGORIAS.map(cat => {
          const feitas = concluidasNaCategoria(cat, concluidas)
          return (
            <section key={cat.chave}>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <span>{cat.emoji}</span> {cat.nome}
                </h2>
                <span className={`text-xs font-semibold ${feitas === cat.aulas.length ? cat.cor : 'text-gray-500'}`}>
                  {feitas}/{cat.aulas.length}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {cat.aulas.map(aula => {
                  const concluida = concluidas.has(aula.slug)
                  const expandida = aberta === aula.slug
                  const minutos = minutosLeitura(aula)
                  return (
                    <div
                      key={aula.slug}
                      className={`bg-gray-900 border rounded-2xl overflow-hidden transition ${concluida ? 'border-green-500/40' : 'border-gray-800'}`}
                    >
                      <button
                        onClick={() => setAberta(expandida ? null : aula.slug)}
                        className="w-full text-left p-4 flex items-start gap-3 hover:bg-gray-800/40 transition"
                      >
                        <div className="shrink-0 mt-0.5">
                          {concluida
                            ? <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><Check size={13} className="text-white" /></div>
                            : <Circle size={20} className="text-gray-700" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-semibold">{aula.titulo}</p>
                            {concluida && (
                              <span className="text-[10px] font-bold bg-green-500/15 text-green-300 border border-green-500/40 px-1.5 py-0.5 rounded-full">
                                Concluída
                              </span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm mt-0.5">{aula.descricao}</p>
                          <p className="text-gray-600 text-xs mt-1.5 flex items-center gap-1">
                            <Clock size={11} /> {minutos} min de leitura
                          </p>
                        </div>
                        <ChevronDown
                          size={18}
                          className={`text-gray-500 shrink-0 transition-transform ${expandida ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {expandida && (
                        <div className="px-4 pb-4 border-t border-gray-800 pt-4">
                          <div className="flex flex-col gap-4">
                            {aula.topicos.map((t, i) => (
                              <div key={i}>
                                <p className="text-white text-sm font-semibold mb-1">
                                  <span className={`${cat.cor} mr-1.5`}>{i + 1}.</span>{t.titulo}
                                </p>
                                <p className="text-gray-400 text-sm leading-relaxed">{t.texto}</p>
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2 mt-5">
                            <button
                              onClick={() => alternarConclusao(aula)}
                              disabled={salvando === aula.slug}
                              className={`flex-1 font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                                concluida
                                  ? 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700'
                                  : 'bg-green-600 hover:bg-green-700 text-white'
                              }`}
                            >
                              <Check size={16} />
                              {salvando === aula.slug ? 'Salvando...'
                                : concluida ? 'Marcar como não lida' : 'Marcar como concluída'}
                            </button>
                            {aula.acao && (
                              <button
                                onClick={() => router.push(aula.acao!.path)}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1.5"
                              >
                                {aula.acao.label} <ArrowRight size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </AppLayout>
  )
}
