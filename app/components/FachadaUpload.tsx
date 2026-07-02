'use client'
import { useRef, useState, useEffect } from 'react'
import { Store, Plus, Trash2 } from 'lucide-react'
import { validarFachada, FACHADA_TIPOS, FACHADA_MAX_FOTOS } from '../lib/fachada'

// Um item pode ser uma foto já salva (url) ou uma nova selecionada (file).
export type FachadaItem =
  | { tipo: 'url'; url: string }
  | { tipo: 'file'; file: File; preview: string }

// Seletor de até 3 fotos da fachada (onboarding e configurações). Guarda os
// itens internamente e avisa o pai via onChange; o pai faz upload das novas e
// apaga as removidas na hora de salvar.
export function FachadaUpload({
  atuais,
  nome,
  tipo,
  onChange,
}: {
  atuais?: string[] | null
  nome: string
  tipo: string
  onChange: (items: FachadaItem[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<FachadaItem[]>(
    () => (atuais || []).map((url) => ({ tipo: 'url', url }) as FachadaItem),
  )
  const [erro, setErro] = useState('')

  // Mantém o pai em sincronia com a lista atual.
  useEffect(() => { onChange(items) }, [items])

  // Revoga os object URLs das fotos novas ao desmontar (evita vazamento).
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => () => {
    itemsRef.current.forEach((it) => { if (it.tipo === 'file') URL.revokeObjectURL(it.preview) })
  }, [])

  function adicionar(files: FileList | null) {
    if (!files || files.length === 0) return
    const espaco = FACHADA_MAX_FOTOS - items.length
    if (espaco <= 0) { setErro(`Máximo de ${FACHADA_MAX_FOTOS} fotos.`); return }

    const novos: FachadaItem[] = []
    for (const file of Array.from(files).slice(0, espaco)) {
      const msg = validarFachada(file)
      if (msg) { setErro(msg); continue }
      novos.push({ tipo: 'file', file, preview: URL.createObjectURL(file) })
    }
    if (novos.length) { setErro(''); setItems((prev) => [...prev, ...novos]) }
    if (Array.from(files).length > espaco) setErro(`Máximo de ${FACHADA_MAX_FOTOS} fotos.`)
    if (inputRef.current) inputRef.current.value = ''
  }

  function remover(idx: number) {
    setItems((prev) => {
      const it = prev[idx]
      if (it && it.tipo === 'file') URL.revokeObjectURL(it.preview)
      return prev.filter((_, i) => i !== idx)
    })
    setErro('')
  }

  return (
    <div>
      <p className="text-gray-400 text-xs mb-2">Fotos da fachada do comércio (até {FACHADA_MAX_FOTOS})</p>

      <div className="grid grid-cols-3 gap-2">
        {items.map((it, idx) => {
          const src = it.tipo === 'url' ? it.url : it.preview
          return (
            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-800">
              <img src={src} alt={`Fachada ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remover(idx)}
                aria-label="Remover foto"
                className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full p-1.5 transition"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}

        {items.length < FACHADA_MAX_FOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-gray-700 hover:border-blue-500 hover:bg-gray-800 transition flex flex-col items-center justify-center text-gray-500 gap-1"
          >
            <Plus size={20} />
            <span className="text-xs">Adicionar</span>
          </button>
        )}
      </div>

      {items.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-gray-600 text-xs">
          <Store size={14} /> Sem fotos ainda — {nome || 'sua loja'} · {tipo || 'comércio'}
        </p>
      )}

      <p className="text-gray-600 text-xs mt-2">JPG, PNG ou WEBP · máx. 5MB cada</p>
      {erro && <p className="text-red-400 text-sm mt-1">{erro}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={FACHADA_TIPOS.join(',')}
        multiple
        onChange={(e) => adicionar(e.target.files)}
        className="hidden"
      />
    </div>
  )
}
