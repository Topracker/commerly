'use client'
// #1 Commerly Vision — o cliente fotografa um prato e vê onde comprar perto.

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Camera, X, Loader2, MapPin } from 'lucide-react'
import { formatarDistancia } from '../lib/geo'

type LojaAchada = {
  id: string
  nome: string
  localizacao: string | null
  distancia_km: number | null
  produtos: { id: string; nome: string; preco_venda: number }[]
}

type Resposta = {
  prato: string
  termos: string[]
  ingredientes: string[]
  confianca: number
  lojas: LojaAchada[]
  ordenadoPorDistancia?: boolean
  aviso?: string
  erro?: string
}

/** Reduz a foto antes de subir: o Gemini tem teto de payload e 4G é lento. */
const LADO_MAX = 1024

function comprimir(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * escala)
      c.height = Math.round(img.naturalHeight * escala)
      const ctx = c.getContext('2d')
      if (!ctx) { reject(new Error('Canvas indisponível.')); return }
      ctx.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a foto.')) }
    img.src = url
  })
}

export function VisionPrato({ userPos }: { userPos: { latitude: number; longitude: number } | null }) {
  const [aberto, setAberto] = useState(false)
  const [analisando, setAnalisando] = useState(false)
  const [previa, setPrevia] = useState<string | null>(null)
  const [res, setRes] = useState<Resposta | null>(null)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function selecionar(file: File | undefined) {
    if (!file) return
    setErro(''); setRes(null); setAnalisando(true)

    try {
      const dataUrl = await comprimir(file)
      setPrevia(dataUrl)

      const r = await fetch('/api/vision/identificar-prato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagem: dataUrl,
          latitude: userPos?.latitude ?? null,
          longitude: userPos?.longitude ?? null,
        }),
      })
      const d: Resposta = await r.json()
      if (!r.ok) { setErro(d.erro || 'Não consegui analisar a foto.'); return }
      setRes(d)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar a foto.')
    } finally {
      setAnalisando(false)
    }
  }

  function fechar() {
    setAberto(false); setRes(null); setPrevia(null); setErro('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
      >
        <Camera className="h-4 w-4" />
        Identificar prato
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-gray-900 p-5 sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">📷 Identificar prato</h2>
              <button onClick={fechar} className="rounded-lg p-1 text-gray-400 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={e => selecionar(e.target.files?.[0])}
            />

            {!previa && !analisando && (
              <button
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-white/15 py-10 text-gray-400 transition hover:border-white/30 hover:text-white"
              >
                <Camera className="h-8 w-8" />
                <span className="text-sm">Tire uma foto ou escolha da galeria</span>
              </button>
            )}

            {previa && (
              <img src={previa} alt="Prato enviado" className="mb-4 max-h-56 w-full rounded-xl object-cover" />
            )}

            {analisando && (
              <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Analisando a foto...</span>
              </div>
            )}

            {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{erro}</p>}

            {res && (
              <div className="space-y-4">
                {res.prato ? (
                  <div className="rounded-xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Identifiquei</p>
                    <p className="font-display text-xl font-bold text-white">{res.prato}</p>
                    {res.ingredientes.length > 0 && (
                      <p className="mt-1 text-sm text-gray-400">{res.ingredientes.join(' · ')}</p>
                    )}
                    {/* Confiança à mostra: o modelo erra, e o cliente decide se confia. */}
                    <p className="mt-2 text-xs text-gray-500">
                      Confiança da IA: {Math.round(res.confianca * 100)}%. Não é o que você pediu? Busque pelo nome.
                    </p>
                  </div>
                ) : null}

                {res.aviso && <p className="text-sm text-amber-400">{res.aviso}</p>}

                {res.lojas.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-white">
                      {res.lojas.length} {res.lojas.length === 1 ? 'loja vende' : 'lojas vendem'} algo parecido
                      {!res.ordenadoPorDistancia && ' (ative a localização para ordenar por proximidade)'}
                    </p>
                    <div className="space-y-2">
                      {res.lojas.map(l => (
                        <Link
                          key={l.id}
                          href={`/cliente/loja/${l.id}`}
                          onClick={fechar}
                          className="block rounded-xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-white">{l.nome}</span>
                            {l.distancia_km != null && (
                              <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
                                <MapPin className="h-3 w-3" />
                                {formatarDistancia(l.distancia_km)}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-sm text-gray-400">
                            {l.produtos.map(p => `${p.nome} · R$ ${Number(p.preco_venda).toFixed(2)}`).join('  |  ')}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => { setRes(null); setPrevia(null); inputRef.current?.click() }}
                  className="w-full rounded-xl border border-white/10 py-2.5 text-sm text-gray-300 hover:bg-white/5"
                >
                  Tentar outra foto
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
