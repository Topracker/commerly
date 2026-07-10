'use client'
// #2 Clone de cardápio (foto) e #3 IA que cria cardápio (texto).
//
// Os dois caminhos desembocam na MESMA tela de revisão: nada vai para o
// catálogo sem o comerciante conferir item a item. É deliberado — o OCR troca
// vírgula de lugar e o gerador chuta preço.

import { useRef, useState } from 'react'
import { Camera, Sparkles, Loader2, Trash2, X } from 'lucide-react'
import type { ItemRascunho } from '../lib/cardapioIA'

const LADO_MAX = 1600 // cardápio precisa de mais resolução que foto de prato

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
      resolve(c.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a foto.')) }
    img.src = url
  })
}

type Modo = 'foto' | 'texto'

export function CardapioIA({ onPublicado }: { onPublicado?: () => void }) {
  const [modo, setModo] = useState<Modo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [itens, setItens] = useState<ItemRascunho[]>([])
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [descricao, setDescricao] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function limpar() {
    setModo(null); setItens([]); setAviso(''); setErro(''); setDescricao('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function digitalizar(file: File | undefined) {
    if (!file) return
    setErro(''); setAviso(''); setCarregando(true)
    try {
      const imagem = await comprimir(file)
      const r = await fetch('/api/cardapio/digitalizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagem }),
      })
      const d = await r.json()
      if (!r.ok) { setErro(d.erro || 'Não consegui ler o cardápio.'); return }
      setItens(d.itens || []); setAviso(d.aviso || '')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar a foto.')
    } finally { setCarregando(false) }
  }

  async function gerar() {
    if (!descricao.trim()) { setErro('Descreva o que você vende.'); return }
    setErro(''); setAviso(''); setCarregando(true)
    try {
      const r = await fetch('/api/cardapio/gerar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao }),
      })
      const d = await r.json()
      if (!r.ok) { setErro(d.erro || 'Erro ao gerar o cardápio.'); return }
      setItens(d.itens || []); setAviso(d.aviso || '')
    } catch {
      setErro('Erro de rede. Tente novamente.')
    } finally { setCarregando(false) }
  }

  async function publicar() {
    const semPreco = itens.filter(i => !i.preco_venda || i.preco_venda <= 0)
    if (semPreco.length > 0) { setErro(`Preencha o preço de: ${semPreco.map(i => i.nome).join(', ')}`); return }

    setErro(''); setPublicando(true)
    try {
      const r = await fetch('/api/cardapio/publicar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens }),
      })
      const d = await r.json()
      if (!r.ok) { setErro(d.erro || 'Não foi possível publicar.'); return }
      limpar()
      onPublicado?.()
    } catch {
      setErro('Erro de rede ao publicar.')
    } finally { setPublicando(false) }
  }

  function editar(i: number, campo: keyof ItemRascunho, valor: string) {
    setItens(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      if (campo === 'preco_venda') {
        const n = Number(valor.replace(',', '.'))
        return { ...item, preco_venda: Number.isFinite(n) && n >= 0 ? n : 0 }
      }
      return { ...item, [campo]: valor }
    }))
  }

  const temRascunho = itens.length > 0

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="font-display text-base font-bold text-white">Montar cardápio com IA</h3>
      <p className="mt-1 text-sm text-gray-400">
        Fotografe o cardápio de papel ou escreva o que você vende. Você revisa tudo antes de publicar.
      </p>

      {!temRascunho && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => { setModo('foto'); inputRef.current?.click() }}
            disabled={carregando}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" /> 📸 Digitalizar cardápio físico
          </button>
          <button
            onClick={() => setModo('texto')}
            disabled={carregando}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> Descrever em texto
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={e => digitalizar(e.target.files?.[0])}
      />

      {modo === 'texto' && !temRascunho && (
        <div className="mt-4">
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Ex: tenho hambúrguer, batata frita e refrigerante"
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-gray-600 focus:border-white/25 focus:outline-none"
          />
          <button
            onClick={gerar}
            disabled={carregando || !descricao.trim()}
            className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar cardápio
          </button>
        </div>
      )}

      {carregando && modo === 'foto' && (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Lendo o cardápio...
        </div>
      )}

      {erro && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{erro}</p>}

      {temRascunho && (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-white">Revise antes de publicar ({itens.length})</p>
            <button onClick={limpar} className="rounded-lg p-1 text-gray-400 hover:bg-white/10" title="Descartar">
              <X className="h-4 w-4" />
            </button>
          </div>

          {aviso && <p className="mb-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-400">{aviso}</p>}

          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {itens.map((item, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-start gap-2">
                  <input
                    value={item.nome}
                    onChange={e => editar(i, 'nome', e.target.value)}
                    className="flex-1 rounded-lg bg-black/30 px-2 py-1.5 text-sm font-medium text-white focus:outline-none"
                  />
                  <button
                    onClick={() => setItens(prev => prev.filter((_, idx) => idx !== i))}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <input
                  value={item.descricao}
                  onChange={e => editar(i, 'descricao', e.target.value)}
                  placeholder="Descrição (opcional)"
                  className="mt-2 w-full rounded-lg bg-black/30 px-2 py-1.5 text-xs text-gray-300 placeholder:text-gray-600 focus:outline-none"
                />

                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={item.categoria}
                    onChange={e => editar(i, 'categoria', e.target.value)}
                    placeholder="Categoria"
                    className="w-32 rounded-lg bg-black/30 px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">R$</span>
                    <input
                      inputMode="decimal"
                      value={item.preco_venda ? String(item.preco_venda) : ''}
                      onChange={e => editar(i, 'preco_venda', e.target.value)}
                      placeholder="0,00"
                      className={`w-20 rounded-lg bg-black/30 px-2 py-1.5 text-xs focus:outline-none ${
                        item.preco_venda > 0 ? 'text-white' : 'text-red-400 ring-1 ring-red-500/40'
                      }`}
                    />
                  </div>
                  {item.preco_sugerido && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                      preço sugerido
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={publicar}
            disabled={publicando}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Publicar {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
          </button>
        </div>
      )}
    </div>
  )
}
