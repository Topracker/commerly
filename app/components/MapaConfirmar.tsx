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

// Considera duas coordenadas "iguais" (tolerância p/ ponto flutuante) — usado
// para saber se uma mudança de prop veio de fora ou do próprio arrasto.
function mesmo(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-7
}

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

  // Mantém o callback atual acessível dentro dos listeners do Leaflet (que são
  // registrados uma única vez, na inicialização).
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  // Última coordenada que ESTE componente emitiu (via arrasto/clique). Serve
  // para o efeito de sincronização não "brigar" com a ação do usuário: só
  // recentraliza quando a mudança de prop vem de fora (nova geocodificação).
  const emitidoRef = useRef<{ lat: number; lng: number } | null>(null)

  function emitir(novaLat: number, novaLng: number) {
    emitidoRef.current = { lat: novaLat, lng: novaLng }
    onMoveRef.current(novaLat, novaLng)
  }

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
      // autoPan mantém o pin visível ao arrastar perto da borda (importante no mobile).
      const marker = L.marker([lat, lng], { icon, draggable: true, autoPan: true }).addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        emitir(p.lat, p.lng)
      })
      // Clicar no mapa também reposiciona o pin (fallback confiável ao arrasto).
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng)
        emitir(e.latlng.lat, e.latlng.lng)
      })
      mapRef.current = map
      markerRef.current = marker
      emitidoRef.current = { lat, lng }
      setTimeout(() => map.invalidateSize(), 0)
    })
    return () => {
      cancelado = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null }
    }
  }, [])

  // Sincroniza o mapa quando as coordenadas mudam POR FORA (o comerciante
  // buscou outro endereço). Ignora a mudança causada pelo próprio arrasto/clique
  // — senão o setView recentralizaria o mapa e faria o pin "pular".
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return
    const e = emitidoRef.current
    if (e && mesmo(e.lat, lat) && mesmo(e.lng, lng)) return
    markerRef.current.setLatLng([lat, lng])
    mapRef.current.setView([lat, lng], 16)
    emitidoRef.current = { lat, lng }
  }, [lat, lng])

  return (
    <div ref={divRef} className={`w-full ${altura} rounded-xl overflow-hidden bg-gray-800 z-0`} />
  )
}

export default MapaConfirmar
