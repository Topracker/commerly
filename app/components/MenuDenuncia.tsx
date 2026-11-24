'use client'
import { useState } from 'react'
import { MoreHorizontal, MoreVertical, Flag, Ban, X, Check } from 'lucide-react'
import {
  MOTIVOS_DENUNCIA, bloquear, denunciar,
  type TipoAlvo, type TipoBloqueio,
} from '../lib/moderacao'

type Props = {
  /** O que está sendo denunciado. */
  tipo: TipoAlvo
  alvoId: string
  alvoNome?: string | null
  /** Trecho do conteúdo (texto do comentário/mensagem, legenda do post). */
  trecho?: string | null
  /** Quem pode ser bloqueado a partir daqui (a loja do post, o autor do comentário…). */
  bloqueio?: { tipo: TipoBloqueio; id: string; nome?: string | null }
  onBloqueado?: () => void
  /** Aparência do botão que abre o menu. */
  variante?: 'horizontal' | 'vertical'
  className?: string
}

/**
 * Menu "⋯" com Denunciar e Bloquear. Exigido pela política de conteúdo gerado
 * por usuários da Google Play: todo conteúdo/usuário precisa ser denunciável e
 * bloqueável de dentro do app.
 */
export function MenuDenuncia({
  tipo, alvoId, alvoNome, trecho, bloqueio, onBloqueado, variante = 'horizontal', className,
}: Props) {
  const [aberto, setAberto] = useState(false)
  const [tela, setTela] = useState<'menu' | 'denunciar' | 'bloquear' | 'ok'>('menu')
  const [motivo, setMotivo] = useState<string>('')
  const [detalhe, setDetalhe] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [msgOk, setMsgOk] = useState('')

  function fechar() {
    setAberto(false); setTela('menu'); setMotivo(''); setDetalhe(''); setErro(''); setMsgOk('')
  }

  async function enviar() {
    if (!motivo) { setErro('Escolha um motivo.'); return }
    setEnviando(true); setErro('')
    const r = await denunciar({ tipo, alvoId, alvoNome, motivo, detalhe, trecho })
    setEnviando(false)
    if (!r.ok) { setErro(r.erro); return }
    setMsgOk('Denúncia enviada. Nossa equipe vai analisar e tomar as medidas necessárias.')
    setTela('ok')
  }

  function confirmarBloqueio() {
    if (!bloqueio) return
    bloquear(bloqueio.tipo, bloqueio.id, bloqueio.nome)
    setMsgOk(`${bloqueio.nome || (bloqueio.tipo === 'loja' ? 'Esta loja' : 'Este usuário')} foi bloqueado. Você não verá mais o conteúdo dele.`)
    setTela('ok')
    onBloqueado?.()
  }

  const Icone = variante === 'vertical' ? MoreVertical : MoreHorizontal
  const rotuloBloqueio = bloqueio?.tipo === 'loja' ? 'Bloquear loja' : 'Bloquear usuário'

  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setAberto(true) }}
        aria-label="Mais opções: denunciar ou bloquear"
        className={className || 'grid h-9 w-9 place-items-center rounded-full text-gray-300 hover:bg-white/10'}
      >
        <Icone size={20} />
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center"
          onClick={e => { e.stopPropagation(); fechar() }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-gray-900 p-4 pb-6 text-white shadow-xl sm:rounded-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold">
                {tela === 'denunciar' ? 'Denunciar' : tela === 'bloquear' ? rotuloBloqueio : tela === 'ok' ? 'Pronto' : 'Opções'}
              </p>
              <button onClick={fechar} aria-label="Fechar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            {tela === 'menu' && (
              <div className="flex flex-col gap-2">
                <button onClick={() => setTela('denunciar')} className="flex items-center gap-3 rounded-xl bg-gray-800 px-4 py-3 text-left hover:bg-gray-700">
                  <Flag size={18} className="text-red-400" /> Denunciar
                </button>
                {bloqueio && (
                  <button onClick={() => setTela('bloquear')} className="flex items-center gap-3 rounded-xl bg-gray-800 px-4 py-3 text-left hover:bg-gray-700">
                    <Ban size={18} className="text-orange-400" /> {rotuloBloqueio}
                  </button>
                )}
              </div>
            )}

            {tela === 'denunciar' && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-400">Por que você está denunciando{alvoNome ? ` "${alvoNome}"` : ''}?</p>
                <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                  {MOTIVOS_DENUNCIA.map(m => (
                    <button
                      key={m}
                      onClick={() => setMotivo(m)}
                      className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm ${motivo === m ? 'bg-red-500/20 ring-1 ring-red-400' : 'bg-gray-800 hover:bg-gray-700'}`}
                    >
                      {m} {motivo === m && <Check size={16} className="text-red-300" />}
                    </button>
                  ))}
                </div>
                <textarea
                  value={detalhe}
                  onChange={e => setDetalhe(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Conte mais (opcional)"
                  className="mt-1 w-full rounded-xl bg-gray-800 p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-600"
                />
                {erro && <p className="text-sm text-red-400">{erro}</p>}
                <button
                  onClick={enviar}
                  disabled={enviando}
                  className="mt-1 rounded-xl bg-red-500 py-3 font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                >
                  {enviando ? 'Enviando…' : 'Enviar denúncia'}
                </button>
              </div>
            )}

            {tela === 'bloquear' && bloqueio && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-300">
                  Você não verá mais posts, stories, comentários nem mensagens
                  {bloqueio.nome ? ` de ${bloqueio.nome}` : bloqueio.tipo === 'loja' ? ' desta loja' : ' deste usuário'} neste aparelho.
                  Dá para desfazer no card “Bloqueados” das suas configurações.
                </p>
                <button onClick={confirmarBloqueio} className="rounded-xl bg-orange-500 py-3 font-semibold text-white hover:bg-orange-600">
                  {rotuloBloqueio}
                </button>
              </div>
            )}

            {tela === 'ok' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-300">{msgOk}</p>
                <button onClick={fechar} className="rounded-xl bg-gray-800 py-3 font-semibold hover:bg-gray-700">Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
