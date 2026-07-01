'use client'
import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Navigation, MapPinOff } from 'lucide-react'
import { geocodificarEndereco, enderecoVago } from '../lib/geocode'

type Props = {
  latitude?: number | null
  longitude?: number | null
  /** Endereço textual — geocodificado quando não há lat/lng salvos (lojas antigas). */
  localizacao?: string | null
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
export function MiniMapa({ latitude, longitude, localizacao, nome, altura = 'h-48' }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  const explicito = latitude != null && longitude != null

  // Coordenadas efetivas: as salvas ou, na falta, geocodificadas do endereço.
  const [coord, setCoord] = useState<[number, number] | null>(
    explicito ? [Number(latitude), Number(longitude)] : null,
  )
  // Tem endereço mas não dá pra plotar (vago demais ou geocode falhou).
  const [indisponivel, setIndisponivel] = useState(false)

  useEffect(() => {
    if (explicito) { setCoord([Number(latitude), Number(longitude)]); setIndisponivel(false); return }
    let vivo = true
    setCoord(null)
    if (localizacao && !enderecoVago(localizacao)) {
      setIndisponivel(false)
      geocodificarEndereco(localizacao).then((r) => {
        if (!vivo) return
        if (r) setCoord([r.latitude, r.longitude])
        else setIndisponivel(true)
      })
    } else {
      // Endereço vago (só cidade) ou inexistente → não plota pin errado.
      setIndisponivel(!!localizacao)
    }
    return () => { vivo = false }
  }, [explicito, latitude, longitude, localizacao])

  useEffect(() => {
    if (!coord) return
    let cancelado = false
    import('leaflet').then((mod) => {
      const L = (mod as any).default || mod
      if (cancelado || !divRef.current || mapRef.current) return
      const map = L.map(divRef.current, { scrollWheelZoom: false, attributionControl: false }).setView(coord, 16)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      const icon = L.divIcon({ html: PIN_SVG, className: 'commerly-pin', iconSize: [30, 30], iconAnchor: [15, 28] })
      const marker = L.marker(coord, { icon }).addTo(map)
      if (nome) marker.bindPopup(`<b>${nome.replace(/[<>&]/g, '')}</b>`)
      mapRef.current = map
      setTimeout(() => map.invalidateSize(), 0)
    })
    return () => {
      cancelado = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [coord, nome])

  if (!coord) {
    if (!indisponivel) return null
    return (
      <div className="bg-gray-900 rounded-2xl p-4 mb-4">
        <h2 className="text-white font-semibold text-lg mb-2">Localização</h2>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <MapPinOff size={16} className="text-gray-500 shrink-0" />
          <span>Localização não disponível no mapa{localizacao ? ` — ${localizacao}` : ''}.</span>
        </div>
      </div>
    )
  }

  const [lat, lng] = coord
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  const waze = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`

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
