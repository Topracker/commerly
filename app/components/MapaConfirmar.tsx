'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

type Props = {
  lat: number
  lng: number
  /** Chamado quando o comerciante arrasta o pin ou clica no mapa. */
  onMove: (lat: number, lng: number) => void
  /** Altura do mapa (classe Tailwind). Padrão: h-52. */
  altura?: string
}

const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#16a34a" stroke="#ffffff" stroke-width="1.5">' +
  '<path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10z"/><circle cx="12" cy="11" r="2.2" fill="#ffffff" stroke="none"/></svg>'

/**
 * Mapa de confirmação com um pin ARRASTÁVEL. Serve para o comerciante conferir
 * (e corrigir) a localização antes de salvar — o geocode do Nominatim erra em
 * endereços vagos, então a palavra final é dele. Arrastar o pin ou clicar no
 * mapa dispara `onMove` com as novas coordenadas.
 */
export function MapaConfirmar({ lat, lng, onMove, altura = 'h-52' }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)

  // Mantém o callback atual acessível dentro dos listeners do Leaflet.
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  // Inicializa o mapa uma única vez (Leaflet só roda no browser → import dinâmico).
  useEffect(() => {
    let cancelado = false
    import('leaflet').then((mod) => {
      const L = (mod as any).default || mod
      if (cancelado || !divRef.current || mapRef.current) return
      const map = L.map(divRef.current, { scrollWheelZoom: false }).setView([lat, lng], 16)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)
      const icon = L.divIcon({ html: PIN_SVG, className: 'commerly-pin', iconSize: [30, 30], iconAnchor: [15, 28] })
      const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onMoveRef.current(p.lat, p.lng)
      })
      // Clicar no mapa também reposiciona o pin.
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng)
        onMoveRef.current(e.latlng.lat, e.latlng.lng)
      })
      mapRef.current = map
      markerRef.current = marker
      setTimeout(() => map.invalidateSize(), 0)
    })
    return () => {
      cancelado = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null }
    }
  }, [])

  // Nova geocodificação (o comerciante digitou outro endereço) → recentraliza.
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
      mapRef.current.setView([lat, lng], 16)
    }
  }, [lat, lng])

  return (
    <div ref={divRef} className={`w-full ${altura} rounded-xl overflow-hidden bg-gray-800 z-0`} />
  )
}

export default MapaConfirmar
