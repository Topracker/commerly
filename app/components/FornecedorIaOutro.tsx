'use client'
import { useState } from 'react'

// Chat de IA mostrado quando o fornecedor escolhe a categoria "Outro".
// Espelha o fluxo do comerciante: o fornecedor descreve a empresa e a IA
// sugere a categoria e o foco de atuação. O estado de descrição/categoria/foco
// vive no componente pai (para o salvar() poder ler na hora de gravar).

type Props = {
  descricao: string
  onDescricao: (v: string) => void
  categoria: string
  onCategoria: (v: string) => void
  foco: string
  onFoco: (v: string) => void
}

export default function FornecedorIaOutro({
  descricao, onDescricao, categoria, onCategoria, foco, onFoco,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resumo, setResumo] = useState('')

  async function consultar() {
    if (!descricao.trim()) { setErro('Conta um pouco sobre a sua empresa.'); return }
    setLoading(true); setErro('')
    try {
      const res = await fetch('/api/onboarding-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao, modo: 'fornecedor' }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.erro || 'Erro ao consultar a IA.'); setLoading(false); return }
      setResumo(data.resumo || '')
      if (data.categoriaSugerida) onCategoria(data.categoriaSugerida)
      if (data.foco) onFoco(data.foco)
    } catch {
      setErro('Erro de rede. Tente novamente.')
    }
    setLoading(false)
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">✨</span>
        <p className="text-white font-semibold text-sm">Vamos montar seu perfil</p>
      </div>
      <p className="text-gray-400 text-xs">
        Conta com suas palavras o que a sua empresa fornece, que eu sugiro a categoria e o foco certos pro seu perfil.
      </p>
      <textarea
        value={descricao}
        onChange={e => onDescricao(e.target.value)}
        placeholder="Ex: Distribuo bebidas e descartáveis pra bares e restaurantes da região..."
        rows={3}
        maxLength={1000}
        className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"
      />
      <button
        type="button"
        onClick={consultar}
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition text-sm"
      >
        {loading ? 'Pensando...' : resumo ? 'Gerar de novo' : 'Sugerir categoria'}
      </button>
      {erro && <p className="text-red-400 text-sm">{erro}</p>}

      {resumo && (
        <div className="flex flex-col gap-3 border-t border-gray-800 pt-3">
          <p className="text-gray-300 text-sm">{resumo}</p>
          <div>
            <label className="text-gray-500 text-xs">Categoria identificada</label>
            <input
              value={categoria}
              onChange={e => onCategoria(e.target.value)}
              maxLength={40}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-purple-500 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-gray-500 text-xs">Foco de atuação</label>
            <input
              value={foco}
              onChange={e => onFoco(e.target.value)}
              maxLength={120}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-purple-500 text-sm mt-1"
            />
          </div>
        </div>
      )}
    </div>
  )
}
