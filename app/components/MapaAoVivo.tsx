'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

type Props = {
  lat: number
  lng: number
  /** Altura do mapa (classe Tailwind). Padrão: h-52. */
  altura?: string
  /** Rótulo do popup do pino (ex.: nome do entregador). */
  label?: string
}

// Marcador do entregador — emoji de moto (sem asset externo, CSP-safe).
const PIN_HTML = '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">🛵</div>'

/**
 * Mapa read-only que segue o entregador em tempo real. Inicializa uma única vez
 * e apenas MOVE o marcador quando as coordenadas mudam (não recria o mapa), pra
 * o acompanhamento ser fluido a cada atualização de GPS.
 */
export function MapaAoVivo({ lat, lng, altura = 'h-52', label }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)

  useEffect(() => {
    let cancelado = false
    import('leaflet').then((mod) => {
      const L = (mod as any).default || mod
      if (cancelado || !divRef.current || mapRef.current) return
      const map = L.map(divRef.current, { scrollWheelZoom: false, attributionControl: false }).setView([lat, lng], 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      const icon = L.divIcon({ html: PIN_HTML, className: 'commerly-pin', iconSize: [30, 30], iconAnchor: [15, 26] })
      const marker = L.marker([lat, lng], { icon }).addTo(map)
      if (label) marker.bindPopup(`<b>${label.replace(/[<>&]/g, '')}</b>`)
      mapRef.current = map
      markerRef.current = marker
      setTimeout(() => map.invalidateSize(), 0)
    })
    return () => {
      cancelado = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Move o marcador e acompanha a câmera quando o GPS atualiza.
  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([lat, lng])
      mapRef.current.panTo([lat, lng])
    }
  }, [lat, lng])

  return <div ref={divRef} className={`w-full ${altura} rounded-xl overflow-hidden bg-[#171C22] z-0`} />
}

export default MapaAoVivo
