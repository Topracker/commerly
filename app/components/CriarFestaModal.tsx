'use client'
import { useEffect, useMemo, useState } from 'react'
import { X, MapPin, Check, PartyPopper, Store, Search, Star, Navigation } from 'lucide-react'
import { createClient } from '../supabase'
import { distanciaKm, formatarDistancia } from '../lib/geo'
import { isDelivery } from '../lib/pedidosClientes'
import { getRatingsPorLoja } from '../lib/avaliacoes'
import { FESTA_MAX_LOJAS, FESTA_RAIO_LOJAS_KM } from '../lib/festas'
import { MapaConfirmar } from './MapaConfirmar'

type LojaOpt = {
  id: string; nome: string; tipo: string
  latitude: number | null; longitude: number | null
  fotos_fachada?: string[] | null; localizacao?: string | null; destaque?: boolean
  media?: number; totalAval?: number
}
type Sugestao = { lat: number; lng: number; display_name: string }

type Props = {
  onFechar: () => void
  onCriada: (festaId: string) => void
  onErro: (msg: string) => void
}

// Modal de criação de festa: nome, endereço único de entrega (com mapa) e as
// lojas participantes (até 3, a até 2 km umas das outras).
export function CriarFestaModal({ onFechar, onCriada, onErro }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [nome, setNome] = useState('')
  const [endereco, setEndereco] = useState('')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [buscandoSug, setBuscandoSug] = useState(false)
  const [lojas, setLojas] = useState<LojaOpt[]>([])
  const [selec, setSelec] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [buscaLoja, setBuscaLoja] = useState('')
  // Nomes de produtos por loja — a busca casa por nome da loja E por produto.
  const [produtosPorLoja, setProdutosPorLoja] = useState<Record<string, string[]>>({})
  const [userPos, setUserPos] = useState<{ latitude: number; longitude: number } | null>(null)

  // Localização do usuário (só para exibir distância nos cards).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setUserPos({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }, [])

  // Lojas de delivery + notas + produtos (para a busca).
  useEffect(() => {
    let ativo = true
    ;(async () => {
      const d = await fetch('/api/cliente/lojas').then(r => (r.ok ? r.json() : { lojas: [] })).catch(() => ({ lojas: [] }))
      const delivery: LojaOpt[] = (d.lojas || []).filter(
        (l: LojaOpt) => isDelivery(l.tipo) && l.latitude != null && l.longitude != null,
      )
      if (!ativo) return
      const ids = delivery.map(l => l.id)
      const [ratings, prodRes] = await Promise.all([
        getRatingsPorLoja(supabase, ids),
        supabase.from('produtos').select('loja_id, nome').in('loja_id', ids).gt('quantidade', 0),
      ])
      if (!ativo) return
      const comNota = delivery.map(l => ({ ...l, media: ratings[l.id]?.media ?? 0, totalAval: ratings[l.id]?.total ?? 0 }))
      comNota.sort((a, b) =>
        (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0) ||
        (b.media || 0) - (a.media || 0) || a.nome.localeCompare(b.nome),
      )
      setLojas(comNota)
      const mapa: Record<string, string[]> = {}
      for (const p of (prodRes.data || []) as any[]) {
        ;(mapa[p.loja_id] ??= []).push((p.nome || '').toLowerCase())
      }
      setProdutosPorLoja(mapa)
    })().catch(() => {})
    return () => { ativo = false }
  }, [supabase])

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

  // Uma loja fica FORA de alcance se estiver a mais de 2km de qualquer loja já
  // escolhida — o entregador precisa passar por todas numa viagem só.
  function foraDoRaio(l: LojaOpt): boolean {
    if (selec.includes(l.id)) return false
    for (const sel of lojasSelec) {
      const d = distanciaKm(
        { latitude: l.latitude, longitude: l.longitude },
        { latitude: sel.latitude, longitude: sel.longitude },
      )
      if (d != null && d > FESTA_RAIO_LOJAS_KM) return true
    }
    return false
  }

  // Filtro de busca: nome da loja OU nome de algum produto disponível.
  const lojasFiltradas = useMemo(() => {
    const q = buscaLoja.trim().toLowerCase()
    if (!q) return lojas
    return lojas.filter(l =>
      l.nome.toLowerCase().includes(q) ||
      (produtosPorLoja[l.id] || []).some(n => n.includes(q)),
    )
  }, [lojas, buscaLoja, produtosPorLoja])

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
            <p className="text-gray-500 text-xs mb-2">Até {FESTA_MAX_LOJAS} lojas de delivery, a até {FESTA_RAIO_LOJAS_KM} km umas das outras. O entregador passa em todas numa viagem só.</p>

            {/* Busca por nome da loja ou produto */}
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={buscaLoja}
                onChange={e => setBuscaLoja(e.target.value)}
                placeholder="Buscar loja ou produto..."
                className="w-full bg-superficie border border-borda text-white rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-acento/60 text-sm"
              />
            </div>

            {lojas.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nenhuma loja de delivery encontrada.</p>
            ) : lojasFiltradas.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nenhuma loja ou produto com "{buscaLoja}".</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 max-h-[19rem] overflow-y-auto pr-0.5">
                {lojasFiltradas.map(l => {
                  const on = selec.includes(l.id)
                  const fora = foraDoRaio(l)
                  const cheio = !on && selec.length >= FESTA_MAX_LOJAS
                  const bloq = !on && (fora || cheio)
                  const dist = userPos ? distanciaKm(userPos, { latitude: l.latitude, longitude: l.longitude }) : null
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => !bloq && toggleLoja(l.id)}
                      disabled={bloq}
                      className={`relative text-left rounded-2xl overflow-hidden border transition disabled:opacity-40 ${
                        on ? 'border-acento ring-1 ring-acento/50' : 'border-borda hover:border-[#2b3440]'
                      }`}
                    >
                      {/* Fachada */}
                      <div className="relative h-24 bg-elevado">
                        {l.fotos_fachada?.[0] ? (
                          <img src={l.fotos_fachada[0]} alt={`Fachada de ${l.nome}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-azul/25 via-elevado to-acento/15">
                            <Store size={24} className="text-white/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-transparent to-transparent" />
                        {on && (
                          <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-acento flex items-center justify-center">
                            <Check size={14} className="text-white" />
                          </span>
                        )}
                        {(l.totalAval ?? 0) > 0 && (
                          <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 text-[10px] bg-black/50 backdrop-blur text-yellow-300 border border-yellow-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                            <Star size={9} className="fill-yellow-300 text-yellow-300" />
                            {(l.media ?? 0).toFixed(1)}
                          </span>
                        )}
                        {dist != null && (
                          <span className="absolute bottom-2 right-2 inline-flex items-center gap-0.5 text-[10px] bg-acento/20 backdrop-blur text-acento border border-acento/40 px-1.5 py-0.5 rounded-full font-semibold">
                            <Navigation size={9} />{formatarDistancia(dist)}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 pt-2">
                        <p className="text-white text-sm font-semibold truncate">{l.nome}</p>
                        <p className="text-gray-500 text-[11px] truncate">{l.tipo}</p>
                        {fora && !on && (
                          <p className="text-amber-400 text-[10px] mt-1">Fora do raio de {FESTA_RAIO_LOJAS_KM} km</p>
                        )}
                      </div>
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
