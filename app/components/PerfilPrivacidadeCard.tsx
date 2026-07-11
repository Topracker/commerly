'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, ExternalLink } from 'lucide-react'

// Card de privacidade do perfil público do cliente + link para o próprio perfil.
export function PerfilPrivacidadeCard() {
  const [privado, setPrivado] = useState<boolean | null>(null)
  const [slug, setSlug] = useState<string>('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    fetch('/api/cliente/privacidade').then(r => (r.ok ? r.json() : null)).then(d => {
      if (d && !d.error) { setPrivado(d.privado); setSlug(d.slug) }
    }).catch(() => {})
  }, [])

  if (privado === null) return null

  async function alternar() {
    setSalvando(true)
    const novo = !privado
    setPrivado(novo)
    await fetch('/api/cliente/privacidade', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ privado: novo }),
    }).catch(() => setPrivado(!novo))
    setSalvando(false)
  }

  return (
    <div className="rounded-2xl border border-borda bg-card p-4 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-semibold flex items-center gap-1.5">
          {privado ? <EyeOff size={15} className="text-gray-400" /> : <Eye size={15} className="text-acento" />} Perfil público
        </p>
        <p className="text-gray-500 text-xs mt-0.5">
          {privado ? 'Seu perfil está privado.' : <>Visível em <Link href={`/cliente/${slug}`} className="text-acento">/cliente/{slug.slice(0, 14)}… <ExternalLink size={10} className="inline" /></Link></>}
        </p>
      </div>
      <button
        onClick={alternar} disabled={salvando}
        className={`relative w-11 h-6 rounded-full transition shrink-0 ${privado ? 'bg-elevado' : 'bg-acento'}`}
        aria-pressed={!privado}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${privado ? 'left-0.5' : 'left-[22px]'}`} />
      </button>
    </div>
  )
}

export default PerfilPrivacidadeCard
