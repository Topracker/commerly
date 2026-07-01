'use client'
import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { carregarGoogleMaps, GOOGLE_MAPS_KEY } from '../lib/googleMaps'

export type EnderecoSelecionado = {
  endereco: string
  latitude: number
  longitude: number
}

type Props = {
  value: string
  onChange: (v: string) => void
  onSelect: (e: EnderecoSelecionado) => void
  placeholder?: string
  className?: string
}

/**
 * Input de endereço com autocomplete do Google Places. Ao escolher um lugar,
 * dispara onSelect com o endereço formatado + latitude/longitude.
 *
 * Se a chave do Google Maps não estiver configurada, degrada para um input de
 * texto comum (sem autocomplete nem coordenadas), sem quebrar o formulário.
 */
export function EnderecoAutocomplete({
  value, onChange, onSelect,
  placeholder = 'Endereço (rua, número, bairro...)',
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !inputRef.current) return
    let autocomplete: any
    let cancelado = false

    carregarGoogleMaps()
      .then((maps) => {
        if (cancelado || !inputRef.current) return
        autocomplete = new maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'br' },
          fields: ['formatted_address', 'geometry', 'name'],
          types: ['geocode', 'establishment'],
        })
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace()
          const loc = place?.geometry?.location
          if (!loc) return
          const endereco = place.formatted_address || place.name || ''
          onChange(endereco)
          onSelect({ endereco, latitude: loc.lat(), longitude: loc.lng() })
        })
      })
      .catch((e) => setErro(e?.message || 'Erro ao carregar o mapa'))

    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div className="relative flex items-center">
        <MapPin size={16} className="absolute left-3 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full pl-9 ${className}`}
        />
      </div>
      {!GOOGLE_MAPS_KEY && (
        <p className="text-gray-500 text-xs mt-1">Digite o endereço manualmente.</p>
      )}
      {erro && <p className="text-yellow-500 text-xs mt-1">Autocomplete indisponível — digite manualmente.</p>}
    </div>
  )
}

export default EnderecoAutocomplete
