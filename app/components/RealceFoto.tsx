'use client'
// #4 Realce da foto do produto — antes/depois, comerciante escolhe.
//
// Ver lib/realceFoto.ts para o porquê de não usarmos IA generativa aqui: um
// modelo de geração repinta o produto, e a foto deixaria de corresponder ao que
// o cliente recebe.

import { useState } from 'react'
import { Sparkles, Loader2, Check } from 'lucide-react'
import { realcarFoto, dataUrlParaFile } from '../lib/realceFoto'

type Props = {
  /** Foto original escolhida pelo comerciante. */
  arquivo: File
  /** Chamado com o arquivo final (original ou realçado). */
  onEscolher: (file: File) => void
}

export function RealceFoto({ arquivo, onEscolher }: Props) {
  const [processando, setProcessando] = useState(false)
  const [realcada, setRealcada] = useState<string | null>(null)
  const [ajustes, setAjustes] = useState<string[]>([])
  const [erro, setErro] = useState('')
  const [escolha, setEscolha] = useState<'original' | 'realcada' | null>(null)

  const original = useState(() => URL.createObjectURL(arquivo))[0]

  async function processar() {
    setErro(''); setProcessando(true)
    try {
      const r = await realcarFoto(arquivo)
      setRealcada(r.dataUrl)
      setAjustes(r.ajustes)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível realçar a foto.')
    } finally {
      setProcessando(false)
    }
  }

  function escolher(qual: 'original' | 'realcada') {
    setEscolha(qual)
    if (qual === 'original') onEscolher(arquivo)
    else if (realcada) onEscolher(dataUrlParaFile(realcada, `realcada-${arquivo.name}`))
  }

  if (!realcada) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={processar}
          disabled={processando}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-50"
        >
          {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          ✨ Melhorar foto
        </button>
        {erro && <p className="mt-2 text-sm text-red-400">{erro}</p>}
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="grid grid-cols-2 gap-3">
        {([
          ['original', 'Original', original],
          ['realcada', 'Melhorada', realcada],
        ] as const).map(([chave, rotulo, src]) => (
          <button
            key={chave}
            type="button"
            onClick={() => escolher(chave)}
            className={`overflow-hidden rounded-lg border-2 text-left transition ${
              escolha === chave ? 'border-emerald-500' : 'border-transparent hover:border-white/20'
            }`}
          >
            <img src={src} alt={rotulo} className="aspect-square w-full object-cover" />
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs text-gray-300">{rotulo}</span>
              {escolha === chave && <Check className="h-3.5 w-3.5 text-emerald-400" />}
            </div>
          </button>
        ))}
      </div>

      <ul className="mt-3 space-y-0.5">
        {ajustes.map(a => (
          <li key={a} className="text-[11px] text-gray-500">· {a}</li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
        Só ajustamos enquadramento, luz e cor da sua foto. Nenhum elemento é gerado ou removido —
        o cliente precisa receber o que viu.
      </p>

      {!escolha && <p className="mt-2 text-xs text-amber-400">Escolha qual foto usar.</p>}
    </div>
  )
}
