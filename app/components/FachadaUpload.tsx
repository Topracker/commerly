'use client'
import { useRef, useState, useEffect } from 'react'
import { Store, Camera, Trash2 } from 'lucide-react'
import { validarFachada, FACHADA_TIPOS } from '../lib/fachada'

// Seletor da foto da fachada (onboarding e configurações). Controlado: o pai
// guarda o File selecionado e faz o upload na hora de salvar. Valida tipo e
// tamanho na seleção e mostra o erro inline.
export function FachadaUpload({
  atual,
  nome,
  tipo,
  onSelect,
}: {
  atual?: string | null
  nome: string
  tipo: string
  onSelect: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])

  function escolher(file: File | null) {
    if (!file) return
    const msg = validarFachada(file)
    if (msg) { setErro(msg); return }
    setErro('')
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
    onSelect(file)
  }

  function remover() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setErro('')
    onSelect(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const mostrando = preview || atual

  return (
    <div>
      <p className="text-gray-400 text-xs mb-2">Foto da fachada do comércio</p>
      <div
        onClick={() => inputRef.current?.click()}
        className="w-full aspect-[16/9] rounded-2xl overflow-hidden cursor-pointer relative group bg-gray-800 flex items-center justify-center"
      >
        {mostrando ? (
          <img src={mostrando} alt="Fachada" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center text-center px-4 bg-gradient-to-br from-blue-600/30 via-gray-800 to-green-600/20 w-full h-full">
            <Store size={32} className="text-white/60 mb-1" />
            <p className="text-white/80 font-semibold text-sm">{nome || 'Sua loja'}</p>
            <span className="text-white/60 text-xs">{tipo || 'Comércio'}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="flex items-center gap-2 text-white text-sm font-medium">
            <Camera size={16} /> {mostrando ? 'Trocar foto' : 'Adicionar foto'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <p className="text-gray-600 text-xs">JPG, PNG ou WEBP · máx. 5MB</p>
        {preview && (
          <button
            type="button"
            onClick={remover}
            className="text-gray-400 hover:text-red-400 text-xs flex items-center gap-1 transition"
          >
            <Trash2 size={12} /> Cancelar
          </button>
        )}
      </div>
      {erro && <p className="text-red-400 text-sm mt-1">{erro}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={FACHADA_TIPOS.join(',')}
        onChange={e => escolher(e.target.files?.[0] || null)}
        className="hidden"
      />
    </div>
  )
}
