'use client'
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

// Registra de onde veio a visita (?origem=panfleto, ?origem=instagram, etc.)
// pra medir o retorno de cada canal — é o requisito do panfleto físico
// ("origem do QR mensurável"). Uma vez por carregamento de página; falha
// silenciosa (nunca atrapalha a visita por causa de analytics).
export default function RegistrarOrigem() {
  const params = useSearchParams()

  useEffect(() => {
    const origem = params.get('origem')
    if (!origem) return
    fetch('/api/conheca/origem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origem, pagina: '/conheca' }),
      keepalive: true,
    }).catch(() => {})
  }, [params])

  return null
}
