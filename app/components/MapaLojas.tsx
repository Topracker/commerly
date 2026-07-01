'use client'
import { useEffect, useRef, useState } from 'react'
import { carregarGoogleMaps, GOOGLE_MAPS_KEY } from '../lib/googleMaps'

export type LojaMapa = {
  id: string
  nome: string
  tipo?: string
  localizacao?: string
  latitude?: number | null
  longitude?: number | null
  media?: number
  totalAval?: number
}

type Props = {
  lojas: LojaMapa[]
  onVer: (id: string) => void
}

// Centro padrão: Brasil (usado só se nenhuma loja tiver coordenadas).
const CENTRO_BR = { lat: -14.235, lng: -51.925 }

export function MapaLojas({ lojas, onVer }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const infoRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  // Guardamos o callback num ref para o listener sempre chamar a versão atual.
  const onVerRef = useRef(onVer)
  useEffect(() => { onVerRef.current = onVer }, [onVer])

  // Inicializa o mapa uma vez.
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !divRef.current) return
    let cancelado = false
    carregarGoogleMaps()
      .then((maps) => {
        if (cancelado || !divRef.current) return
        mapRef.current = new maps.Map(divRef.current, {
          center: CENTRO_BR,
          zoom: 4,
          mapId: 'commerly_lojas',
          disableDefaultUI: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        })
        infoRef.current = new maps.InfoWindow()
        setPronto(true)
      })
      .catch((e) => setErro(e?.message || 'Erro ao carregar o mapa'))
    return () => { cancelado = true }
  }, [])

  // (Re)desenha os marcadores quando as lojas mudam.
  useEffect(() => {
    const maps = (window as any).google?.maps
    if (!pronto || !maps || !mapRef.current) return

    markersRef.current.forEach((m) => (m.setMap ? m.setMap(null) : (m.map = null)))
    markersRef.current = []

    const comCoord = lojas.filter((l) => l.latitude != null && l.longitude != null)
    if (comCoord.length === 0) return

    const bounds = new maps.LatLngBounds()
    for (const loja of comCoord) {
      const pos = { lat: Number(loja.latitude), lng: Number(loja.longitude) }
      const marker = new maps.Marker({ position: pos, map: mapRef.current, title: loja.nome })
      marker.addListener('click', () => {
        infoRef.current.setContent(conteudoCard(loja))
        infoRef.current.open(mapRef.current, marker)
        // O botão só existe depois que o InfoWindow renderiza no DOM.
        maps.event.addListenerOnce(infoRef.current, 'domready', () => {
          const btn = document.getElementById(`ver-loja-${loja.id}`)
          if (btn) btn.onclick = () => onVerRef.current(loja.id)
        })
      })
      markersRef.current.push(marker)
      bounds.extend(pos)
    }

    if (comCoord.length === 1) {
      mapRef.current.setCenter(bounds.getCenter())
      mapRef.current.setZoom(15)
    } else {
      mapRef.current.fitBounds(bounds, 60)
    }
  }, [lojas, pronto])

  if (!GOOGLE_MAPS_KEY) {
    return (
      <div className="bg-gray-900 rounded-2xl p-8 text-center text-gray-400 text-sm">
        O mapa ficará disponível assim que a chave do Google Maps for configurada.
      </div>
    )
  }
  if (erro) {
    return (
      <div className="bg-gray-900 rounded-2xl p-8 text-center text-yellow-500 text-sm">
        Não foi possível carregar o mapa. Use a aba Lista.
      </div>
    )
  }

  const semCoord = lojas.length > 0 && lojas.every((l) => l.latitude == null || l.longitude == null)

  return (
    <div>
      <div ref={divRef} className="w-full h-[70vh] rounded-2xl overflow-hidden bg-gray-900" />
      {semCoord && (
        <p className="text-gray-500 text-xs text-center mt-2">
          Nenhum comércio com localização no mapa ainda.
        </p>
      )}
    </div>
  )
}

function conteudoCard(loja: LojaMapa): string {
  const esc = (s?: string) =>
    (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  const nota =
    loja.totalAval && loja.totalAval > 0
      ? `<div style="color:#eab308;font-size:12px;margin-top:2px">★ ${loja.media?.toFixed(1)} (${loja.totalAval})</div>`
      : ''
  const local = loja.localizacao
    ? `<div style="color:#4b5563;font-size:12px;margin-top:2px">${esc(loja.localizacao)}</div>`
    : ''
  return `
    <div style="min-width:180px;font-family:system-ui,sans-serif;color:#111827">
      <div style="font-weight:600;font-size:14px">${esc(loja.nome)}</div>
      ${loja.tipo ? `<div style="color:#6b7280;font-size:12px">${esc(loja.tipo)}</div>` : ''}
      ${nota}
      ${local}
      <button id="ver-loja-${loja.id}" style="margin-top:8px;background:#16a34a;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;width:100%">
        Ver perfil →
      </button>
    </div>`
}

export default MapaLojas
