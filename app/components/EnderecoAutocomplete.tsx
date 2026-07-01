'use client'
import { useState } from 'react'
import { MapPin, Navigation, Check } from 'lucide-react'

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

function formatarCEP(valor: string): string {
  const nums = valor.replace(/\D/g, '').slice(0, 8)
  if (nums.length <= 5) return nums
  return `${nums.slice(0, 5)}-${nums.slice(5)}`
}

// Nominatim (OpenStreetMap): endereço → lat/long. 100% gratuito, sem chave.
// Política de uso: no máx. ~1 req/s; o navegador já envia o Referer.
async function geocodificar(endereco: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' +
      encodeURIComponent(endereco)
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const data = await res.json()
    if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch {
    /* silencioso — o usuário pode tentar de novo */
  }
  return null
}

/**
 * Campo de endereço 100% gratuito, sem API key:
 *  - CEP → endereço via ViaCEP.
 *  - endereço → latitude/longitude via Nominatim (OpenStreetMap).
 *
 * Mantém a mesma interface do componente antigo (value/onChange/onSelect),
 * então os formulários que o usam não precisam mudar.
 */
export function EnderecoAutocomplete({
  value, onChange, onSelect,
  placeholder = 'Endereço (rua, número, bairro, cidade...)',
  className = '',
}: Props) {
  const [cep, setCep] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)

  async function handleCEP(valor: string) {
    const formatado = formatarCEP(valor)
    setCep(formatado)
    setErro(''); setOk(false)
    const nums = formatado.replace(/\D/g, '')
    if (nums.length < 8) return

    setBuscando(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${nums}/json/`)
      const d = await res.json()
      if (d.erro) { setErro('CEP não encontrado'); setBuscando(false); return }
      const partes = [d.logradouro, d.bairro, d.localidade, d.uf].filter(Boolean)
      const endereco = partes.join(', ')
      onChange(endereco)
      // Já busca as coordenadas do endereço do CEP.
      const geo = await geocodificar(`${endereco}, ${nums}`)
      if (geo) { onSelect({ endereco, latitude: geo.lat, longitude: geo.lng }); setOk(true) }
    } catch {
      setErro('Erro ao consultar o CEP')
    }
    setBuscando(false)
  }

  async function localizar() {
    if (!value.trim()) { setErro('Digite o endereço primeiro'); return }
    setBuscando(true); setErro(''); setOk(false)
    const geo = await geocodificar(value.trim())
    if (geo) { onSelect({ endereco: value.trim(), latitude: geo.lat, longitude: geo.lng }); setOk(true) }
    else setErro('Endereço não localizado no mapa. Revise e tente de novo.')
    setBuscando(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* CEP → endereço (ViaCEP) */}
      <div className="relative flex items-center">
        <input
          value={cep}
          onChange={e => handleCEP(e.target.value)}
          placeholder="CEP (ex: 01310-100)"
          inputMode="numeric"
          maxLength={9}
          className={`w-full ${className}`}
        />
        {buscando && <span className="absolute right-3 text-gray-400 text-xs">buscando...</span>}
      </div>

      {/* Endereço + botão de geocodificação (Nominatim) */}
      <div className="relative flex items-center">
        <MapPin size={16} className="absolute left-3 text-gray-400 pointer-events-none" />
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOk(false) }}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full pl-9 pr-28 ${className}`}
        />
        <button
          type="button"
          onClick={localizar}
          disabled={buscando}
          className="absolute right-1.5 flex items-center gap-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition"
        >
          <Navigation size={12} /> Localizar
        </button>
      </div>

      {ok && (
        <p className="text-green-500 text-xs flex items-center gap-1">
          <Check size={12} /> Localização marcada no mapa.
        </p>
      )}
      {erro && <p className="text-yellow-500 text-xs">{erro}</p>}
    </div>
  )
}

export default EnderecoAutocomplete
