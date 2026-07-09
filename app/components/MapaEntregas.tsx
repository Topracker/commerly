'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

// Mapa multi-marcador para o painel do entregador: mostra a posição do
// entregador, lojas (retirada) e clientes (entrega), com um trajeto opcional
// loja→cliente. CSP-safe: Leaflet + tiles do OpenStreetMap, ícones em emoji
// (sem asset externo). Redesenha os marcadores quando os pontos mudam (ex.: o
// GPS do entregador atualiza) e só reajusta o zoom quando a quantidade muda,
// para não recentralizar a cada atualização de posição.

export type PontoMapa = {
  lat: number
  lng: number
  tipo: 'entregador' | 'loja' | 'cliente'
  label?: string
}

const EMOJI: Record<PontoMapa['tipo'], string> = { entregador: '🛵', loja: '🏪', cliente: '📍' }

function pinHtml(emoji: string) {
  return `<div style="font-size:24px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))">${emoji}</div>`
}

type Props = {
  pontos: PontoMapa[]
  /** Trajeto opcional (ex.: loja→cliente) como lista de [lat, lng]. */
  rota?: [number, number][]
  /** Altura do mapa (classe Tailwind). Padrão: h-64. */
  altura?: string
}

export function MapaEntregas({ pontos, rota, altura = 'h-64' }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const prevCountRef = useRef(0)

  useEffect(() => {
    let cancelado = false
    import('leaflet').then((mod) => {
      const L = (mod as any).default || mod
      if (cancelado || !divRef.current || mapRef.current) return
      LRef.current = L
      const centro: [number, number] = pontos[0] ? [pontos[0].lat, pontos[0].lng] : [-14.235, -51.925]
      const map = L.map(divRef.current, { scrollWheelZoom: false, attributionControl: false }).setView(centro, 13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      layerRef.current = L.layerGroup().addTo(map)
      mapRef.current = map
      desenhar()
      setTimeout(() => map.invalidateSize(), 0)
    })
    return () => {
      cancelado = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    desenhar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pontos), JSON.stringify(rota)])

  function desenhar() {
    const L = LRef.current, map = mapRef.current, layer = layerRef.current
    if (!L || !map || !layer) return
    layer.clearLayers()

    if (rota && rota.length >= 2) {
      L.polyline(rota, { color: '#E0632C', weight: 4, opacity: 0.85, dashArray: '6 6' }).addTo(layer)
    }
    for (const p of pontos) {
      const icon = L.divIcon({ html: pinHtml(EMOJI[p.tipo]), className: 'commerly-pin', iconSize: [28, 28], iconAnchor: [14, 24] })
      const m = L.marker([p.lat, p.lng], { icon }).addTo(layer)
      if (p.label) m.bindPopup(`<b>${p.label.replace(/[<>&]/g, '')}</b>`)
    }

    const pts = pontos.map(p => [p.lat, p.lng] as [number, number])
    if (pts.length >= 2 && pts.length !== prevCountRef.current) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 })
    } else if (pts.length === 1) {
      map.setView(pts[0], Math.max(map.getZoom() || 14, 14))
    }
    prevCountRef.current = pts.length
  }

  return <div ref={divRef} className={`w-full ${altura} rounded-xl overflow-hidden bg-superficie z-0`} />
}

export default MapaEntregas
