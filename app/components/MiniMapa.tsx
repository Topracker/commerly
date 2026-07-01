'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { Navigation } from 'lucide-react'

type Props = {
  latitude?: number | null
  longitude?: number | null
  nome?: string
  /** Altura do mapa (classe Tailwind). Padrão: h-48. */
  altura?: string
}

const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#16a34a" stroke="#ffffff" stroke-width="1.5">' +
  '<path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10z"/><circle cx="12" cy="11" r="2.2" fill="#ffffff" stroke="none"/></svg>'

/**
 * Mini mapa (Leaflet + OpenStreetMap) com um único pin da loja + botões para
 * abrir a rota no Google Maps ou no Waze. Não renderiza nada se a loja não
 * tiver coordenadas cadastradas.
 */
export function MiniMapa({ latitude, longitude, nome, altura = 'h-48' }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  const temCoord = latitude != null && longitude != null

  useEffect(() => {
    if (!temCoord) return
    let cancelado = false
    import('leaflet').then((mod) => {
      const L = (mod as any).default || mod
      if (cancelado || !divRef.current || mapRef.current) return
      const ll: [number, number] = [Number(latitude), Number(longitude)]
      const map = L.map(divRef.current, { scrollWheelZoom: false, attributionControl: false }).setView(ll, 16)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      const icon = L.divIcon({ html: PIN_SVG, className: 'commerly-pin', iconSize: [30, 30], iconAnchor: [15, 28] })
      const marker = L.marker(ll, { icon }).addTo(map)
      if (nome) marker.bindPopup(`<b>${nome.replace(/[<>&]/g, '')}</b>`)
      mapRef.current = map
      setTimeout(() => map.invalidateSize(), 0)
    })
    return () => {
      cancelado = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [latitude, longitude, nome, temCoord])

  if (!temCoord) return null

  const gmaps = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
  const waze = `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`

  return (
    <div className="bg-gray-900 rounded-2xl p-4 mb-4">
      <h2 className="text-white font-semibold text-lg mb-3">Localização</h2>
      <div ref={divRef} className={`w-full ${altura} rounded-xl overflow-hidden bg-gray-800 z-0`} />
      <div className="flex gap-2 mt-3">
        <a
          href={gmaps}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition text-sm"
        >
          <Navigation size={16} />
          Ver no mapa
        </a>
        <a
          href={waze}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-2.5 rounded-xl transition text-sm"
        >
          Waze
        </a>
      </div>
    </div>
  )
}

export default MiniMapa
