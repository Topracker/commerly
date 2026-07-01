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

type Geo = { lat: number; lng: number; display_name?: string }

// Geocodificação via nosso proxy /api/geocode (Nominatim/OpenStreetMap).
// Precisa ser server-side: o Nominatim bloqueia User-Agent de navegador e o
// fetch do browser não permite alterá-lo. Passamos endereço (q) e/ou CEP.
async function geocodificar(opts: { q?: string; cep?: string }): Promise<Geo | null> {
  try {
    const p = new URLSearchParams()
    if (opts.q) p.set('q', opts.q)
    if (opts.cep) p.set('postalcode', opts.cep)
    const res = await fetch(`/api/geocode?${p.toString()}`)
    if (!res.ok) return null
    const d = await res.json()
    if (typeof d.lat === 'number' && typeof d.lng === 'number') return d as Geo
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
      if (d.erro) {
        // ViaCEP não tem esse CEP (comum em CEPs "gerais"). Ainda assim o
        // Nominatim geocodifica pelo próprio CEP — usamos como fallback.
        const geo = await geocodificar({ cep: formatado })
        if (geo) {
          const endereco = geo.display_name || value.trim() || `CEP ${formatado}`
          onChange(endereco)
          onSelect({ endereco, latitude: geo.lat, longitude: geo.lng })
          setOk(true)
        } else {
          setErro('CEP não encontrado')
        }
        setBuscando(false)
        return
      }
      const partes = [d.logradouro, d.bairro, d.localidade, d.uf].filter(Boolean)
      const endereco = partes.join(', ')
      onChange(endereco)
      // Busca as coordenadas: primeiro pelo endereço, com fallback pelo CEP.
      const geo = await geocodificar({ q: `${endereco}, Brasil`, cep: formatado })
      if (geo) { onSelect({ endereco, latitude: geo.lat, longitude: geo.lng }); setOk(true) }
    } catch {
      setErro('Erro ao consultar o CEP')
    }
    setBuscando(false)
  }

  async function localizar() {
    if (!value.trim()) { setErro('Digite o endereço primeiro'); return }
    setBuscando(true); setErro(''); setOk(false)
    const geo = await geocodificar({ q: `${value.trim()}, Brasil` })
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
