'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { ClienteLayout } from '../../components/ClienteLayout'
import { getRatingsPorLoja } from '../../lib/avaliacoes'
import { MapaLojas } from '../../components/MapaLojas'
import { distanciaKm, formatarDistancia } from '../../lib/geo'
import { Search, MapPin, Star, List, Map as MapIcon, Navigation, Store, Sparkles } from 'lucide-react'

const TIPOS = ['Todos', 'Barbearia', 'Distribuidora de bebidas', 'Mercado', 'Loja de roupas', 'Lanchonete', 'Salão de beleza', 'Eletrônicos', 'Outro']

export default function ClienteBuscar() {
  const { cliente, loading, supabase, sair } = useCliente()
  const [lojas, setLojas] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('Todos')
  const [buscando, setBuscando] = useState(false)
  const [aba, setAba] = useState<'lista' | 'mapa'>('lista')
  const [userPos, setUserPos] = useState<{ latitude: number; longitude: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'pedindo' | 'ok' | 'negado'>('idle')
  const router = useRouter()

  useEffect(() => {
    if (cliente) buscarLojas()
  }, [cliente, tipoFiltro])

  useEffect(() => {
    if (cliente) pedirLocalizacao()
  }, [cliente])

  function pedirLocalizacao() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGeoStatus('negado'); return }
    setGeoStatus('pedindo')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserPos({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setGeoStatus('ok') },
      () => setGeoStatus('negado'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  // Quando há localização, ordena por distância (mais perto primeiro; lojas sem
  // coordenadas vão para o fim). Sem localização, mantém a ordem por nota.
  // Em ambos os casos, quem assina o Commerly Ads vem antes — é o que a loja paga.
  const lojasExibidas = useMemo(() => {
    if (!userPos) return lojas
    return lojas
      .map((l) => ({ ...l, _dist: distanciaKm(userPos, l) }))
      .sort((a, b) => {
        if (!!b.destaque !== !!a.destaque) return b.destaque ? 1 : -1
        if (a._dist == null && b._dist == null) return 0
        if (a._dist == null) return 1
        if (b._dist == null) return -1
        return a._dist - b._dist
      })
  }, [lojas, userPos])

  async function buscarLojas() {
    setBuscando(true)
    // Lojas via API service role — a view lojas_publicas está sob RLS em
    // produção e retorna vazio para o cliente (ver a rota).
    const params = new URLSearchParams()
    if (tipoFiltro !== 'Todos') params.set('tipo', tipoFiltro)
    if (busca.trim()) params.set('busca', busca.trim())
    const base: any[] = await fetch(`/api/cliente/lojas?${params.toString()}`)
      .then(r => (r.ok ? r.json() : { lojas: [] }))
      .then(d => d.lojas || [])
      .catch(() => [])
    const ratings = await getRatingsPorLoja(supabase, base.map(l => l.id))
    const comNota = base.map((l: any) => ({
      ...l,
      media: ratings[l.id]?.media ?? 0,
      totalAval: ratings[l.id]?.total ?? 0,
    }))
    // Lojas com Commerly Ads primeiro. Depois: maior nota, mais avaliações, nome.
    comNota.sort((a, b) =>
      (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0) ||
      b.media - a.media || b.totalAval - a.totalAval || a.nome.localeCompare(b.nome),
    )

    // Usa APENAS as coordenadas salvas no banco (lat/lng da view lojas_publicas).
    // Nada de geocodificar endereço no client — isso plotava o pino no lugar
    // errado, ignorando o ajuste manual feito pelo comerciante.
    setLojas(comNota)
    setBuscando(false)
  }

  function handleBusca(e: React.FormEvent) {
    e.preventDefault()
    buscarLojas()
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <h1 className="text-2xl font-bold text-white mb-4 hidden md:block">Descobrir comércios</h1>

      <form onSubmit={handleBusca} className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Buscar por nome..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full bg-gray-900 text-white rounded-xl pl-9 pr-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 rounded-xl transition">
          Buscar
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {TIPOS.map(t => (
          <button
            key={t}
            onClick={() => setTipoFiltro(t)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${tipoFiltro === t ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-3 max-w-2xl mx-auto">
        {([['lista', 'Lista', List], ['mapa', 'Mapa', MapIcon]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition ${aba === key ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto mb-4">
        {geoStatus === 'ok' ? (
          <p className="text-green-400 text-xs flex items-center gap-1">
            <Navigation size={12} /> Ordenando pelos comércios mais próximos de você.
          </p>
        ) : geoStatus === 'negado' ? (
          <button onClick={pedirLocalizacao} className="text-gray-400 text-xs flex items-center gap-1 hover:text-white transition">
            <Navigation size={12} /> Ativar minha localização para ordenar por distância
          </button>
        ) : geoStatus === 'pedindo' ? (
          <p className="text-gray-500 text-xs flex items-center gap-1"><Navigation size={12} /> Obtendo sua localização...</p>
        ) : null}
      </div>

      {aba === 'mapa' ? (
        <div className="max-w-2xl mx-auto">
          <MapaLojas
            lojas={lojasExibidas}
            onVer={(id) => router.push(`/cliente/loja/${id}`)}
            userPos={userPos ? [userPos.latitude, userPos.longitude] : null}
          />
        </div>
      ) : buscando ? (
        <div className="text-center py-12 text-gray-500">Buscando...</div>
      ) : lojasExibidas.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Nenhum comércio encontrado.</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {lojasExibidas.map((loja, i) => (
            <button
              key={loja.id}
              onClick={() => router.push(`/cliente/loja/${loja.id}`)}
              style={{ '--atraso': `${Math.min(i, 8) * 55}ms` } as React.CSSProperties}
              className={`anima-subir bg-card rounded-2xl overflow-hidden text-left border transition ${
                loja.destaque ? 'border-yellow-600/50' : 'border-borda'
              }`}
            >
              {/* Fachada grande: é ela que faz o cliente clicar. */}
              <div className="relative h-36 bg-elevado">
                {loja.fotos_fachada?.[0] ? (
                  <img src={loja.fotos_fachada[0]} alt={`Fachada de ${loja.nome}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-azul/25 via-elevado to-acento/15">
                    <Store size={30} className="text-white/40" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />

                {loja.destaque && (
                  <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 text-[11px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 backdrop-blur px-2 py-0.5 rounded-full font-semibold">
                    <Sparkles size={11} /> Destaque
                  </span>
                )}
                {loja.totalAval > 0 && (
                  <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-[11px] bg-black/50 backdrop-blur text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full font-semibold">
                    <Star size={11} className="fill-yellow-300 text-yellow-300" />
                    {loja.media.toFixed(1)}
                    <span className="text-yellow-300/60 font-normal">({loja.totalAval})</span>
                  </span>
                )}
                {loja._dist != null && (
                  <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 text-[11px] bg-acento/20 backdrop-blur text-acento border border-acento/40 px-2 py-0.5 rounded-full font-semibold">
                    <Navigation size={11} />
                    {formatarDistancia(loja._dist)}
                  </span>
                )}
              </div>

              <div className="p-4 pt-3">
                <p className="font-display text-white font-semibold truncate">{loja.nome}</p>
                <span className="inline-block text-[11px] bg-elevado border border-borda text-gray-300 px-2 py-0.5 rounded-full mt-1.5">
                  {loja.tipo}
                </span>
                {loja.localizacao && (
                  <p className="text-gray-500 text-xs flex items-center gap-1 mt-2 truncate">
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{loja.localizacao}</span>
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </ClienteLayout>
  )
}
