'use client'
import { useEffect, useState } from 'react'
import { X, MapPin, Check, PartyPopper, Store } from 'lucide-react'
import { distanciaKm, formatarDistancia } from '../lib/geo'
import { isDelivery } from '../lib/pedidosClientes'
import { FESTA_MAX_LOJAS, FESTA_RAIO_LOJAS_KM } from '../lib/festas'
import { MapaConfirmar } from './MapaConfirmar'

type LojaOpt = { id: string; nome: string; tipo: string; latitude: number | null; longitude: number | null }
type Sugestao = { lat: number; lng: number; display_name: string }

type Props = {
  onFechar: () => void
  onCriada: (festaId: string) => void
  onErro: (msg: string) => void
}

// Modal de criação de festa: nome, endereço único de entrega (com mapa) e as
// lojas participantes (até 3, a até 2 km umas das outras).
export function CriarFestaModal({ onFechar, onCriada, onErro }: Props) {
  const [nome, setNome] = useState('')
  const [endereco, setEndereco] = useState('')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [buscandoSug, setBuscandoSug] = useState(false)
  const [lojas, setLojas] = useState<LojaOpt[]>([])
  const [selec, setSelec] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)

  // Lojas de delivery para escolher.
  useEffect(() => {
    let ativo = true
    fetch('/api/cliente/lojas')
      .then(r => (r.ok ? r.json() : { lojas: [] }))
      .then(d => {
        if (!ativo) return
        const delivery = (d.lojas || []).filter((l: LojaOpt) => isDelivery(l.tipo) && l.latitude != null && l.longitude != null)
        setLojas(delivery)
      })
      .catch(() => {})
    return () => { ativo = false }
  }, [])

  // Autocomplete do endereço (mesmo padrão do PedidoModal).
  useEffect(() => {
    if (coord) return
    const q = endereco.trim()
    if (q.length < 4) { setSugestoes([]); setBuscandoSug(false); return }
    let ativo = true
    setBuscandoSug(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?suggest=1&q=${encodeURIComponent(q)}`)
        const d = await res.json()
        if (ativo) setSugestoes(Array.isArray(d.results) ? d.results : [])
      } catch { if (ativo) setSugestoes([]) } finally { if (ativo) setBuscandoSug(false) }
    }, 450)
    return () => { ativo = false; clearTimeout(t) }
  }, [endereco, coord])

  const lojasSelec = lojas.filter(l => selec.includes(l.id))

  // Maior distância entre as lojas escolhidas (para avisar antes de enviar).
  let maiorDist: number | null = null
  for (let i = 0; i < lojasSelec.length; i++) {
    for (let j = i + 1; j < lojasSelec.length; j++) {
      const d = distanciaKm(
        { latitude: lojasSelec[i].latitude, longitude: lojasSelec[i].longitude },
        { latitude: lojasSelec[j].latitude, longitude: lojasSelec[j].longitude },
      )
      if (d != null && (maiorDist == null || d > maiorDist)) maiorDist = d
    }
  }
  const lojasLonge = maiorDist != null && maiorDist > FESTA_RAIO_LOJAS_KM

  function toggleLoja(id: string) {
    setSelec(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= FESTA_MAX_LOJAS) return prev
      return [...prev, id]
    })
  }

  async function criar() {
    if (nome.trim().length < 2) { onErro('Dê um nome à festa.'); return }
    if (!coord) { onErro('Selecione o endereço de entrega e confirme no mapa.'); return }
    if (selec.length === 0) { onErro('Escolha pelo menos uma loja.'); return }
    if (lojasLonge) { onErro(`As lojas precisam estar a até ${FESTA_RAIO_LOJAS_KM} km umas das outras.`); return }
    setEnviando(true)
    try {
      const res = await fetch('/api/festa/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          endereco_entrega: endereco.trim(),
          entrega_latitude: coord.lat,
          entrega_longitude: coord.lng,
          loja_ids: selec,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.festa?.id) { onErro(d.error || 'Não foi possível criar a festa.'); setEnviando(false); return }
      onCriada(d.festa.id)
    } catch { onErro('Erro de rede. Tente de novo.'); setEnviando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative z-10 w-full sm:max-w-lg bg-card border border-borda sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-borda shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <PartyPopper size={20} className="text-acento shrink-0" />
            <h2 className="text-white font-bold text-lg truncate">Criar festa</h2>
          </div>
          <button onClick={onFechar} className="shrink-0 text-gray-400 hover:text-white"><X size={22} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-0">
          <div>
            <label className="text-gray-300 text-sm font-medium mb-1.5 block">Nome da festa</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              maxLength={60}
              placeholder="Ex: Aniversário da Ju"
              className="w-full bg-superficie border border-borda text-white rounded-xl px-4 py-3 outline-none focus:border-acento/60 text-sm"
            />
          </div>

          <div>
            <label className="text-gray-300 text-sm font-medium mb-1.5 flex items-center gap-1.5">
              <MapPin size={14} className="text-gray-500" /> Endereço de entrega (um só, pra todos)
            </label>
            <div className="relative">
              <input
                value={endereco}
                onChange={e => { setEndereco(e.target.value); if (coord) setCoord(null) }}
                placeholder="Digite rua, número, bairro, cidade..."
                autoComplete="off"
                className="w-full bg-superficie border border-borda text-white rounded-xl px-4 py-3 pr-24 outline-none focus:border-acento/60 text-sm"
              />
              {buscandoSug && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">buscando...</span>}
            </div>
            {sugestoes.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-0.5 rounded-xl border border-borda bg-superficie p-1">
                {sugestoes.map((s, i) => (
                  <li key={`${s.lat},${s.lng},${i}`}>
                    <button
                      type="button"
                      onClick={() => { setEndereco(s.display_name); setCoord({ lat: s.lat, lng: s.lng }); setSugestoes([]) }}
                      className="w-full text-left px-3 py-2 rounded-lg text-gray-300 text-sm hover:bg-borda transition flex items-start gap-2"
                    >
                      <MapPin size={14} className="text-gray-500 shrink-0 mt-0.5" />
                      <span className="min-w-0">{s.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {coord && (
              <div className="mt-2">
                <MapaConfirmar lat={coord.lat} lng={coord.lng} onMove={(lat, lng) => setCoord({ lat, lng })} altura="h-40" />
              </div>
            )}
          </div>

          <div>
            <label className="text-gray-300 text-sm font-medium mb-1.5 flex items-center gap-1.5">
              <Store size={14} className="text-gray-500" /> Lojas da festa
              <span className="text-gray-500 font-normal">({selec.length}/{FESTA_MAX_LOJAS})</span>
            </label>
            <p className="text-gray-500 text-xs mb-2">Até {FESTA_MAX_LOJAS} lojas, a até {FESTA_RAIO_LOJAS_KM} km umas das outras. O entregador passa em todas numa viagem só.</p>
            {lojas.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nenhuma loja de delivery encontrada.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                {lojas.map(l => {
                  const on = selec.includes(l.id)
                  const cheio = !on && selec.length >= FESTA_MAX_LOJAS
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLoja(l.id)}
                      disabled={cheio}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-40 ${on ? 'border-acento/60 bg-acento/10' : 'border-borda bg-superficie hover:border-[#2b3440]'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{l.nome}</p>
                        <p className="text-gray-500 text-xs">{l.tipo}</p>
                      </div>
                      {on && <Check size={16} className="text-acento shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
            {lojasSelec.length >= 2 && (
              <p className={`mt-2 text-xs ${lojasLonge ? 'text-red-400' : 'text-gray-500'}`}>
                Distância máxima entre as lojas: {formatarDistancia(maiorDist)}
                {lojasLonge && ` — acima de ${FESTA_RAIO_LOJAS_KM} km, escolha lojas mais próximas.`}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-borda px-5 py-4 shrink-0">
          <button
            onClick={criar}
            disabled={enviando || lojasLonge}
            className="w-full bg-acento hover:bg-acento-forte disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            <PartyPopper size={18} />
            {enviando ? 'Criando...' : 'Criar festa'}
          </button>
        </div>
      </div>
    </div>
  )
}
