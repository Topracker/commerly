'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin } from 'lucide-react'

// Aviso informativo de onde o delivery já funciona. Aparece na home e na busca
// do cliente.
//
// Tom: é informação, não erro. Por isso nada de vermelho/âmbar, nada de ícone
// de alerta e nenhuma palavra como "indisponível" — quem está em Goiânia não
// pode achar que algo quebrou, e quem está fora precisa entender que é questão
// de tempo, não de falha.
//
// As cidades vêm de /api/publico/cobertura (feature flags), nunca de uma lista
// no código: quando o delivery for ligado em outra cidade no /admin, o texto
// muda sozinho. Enquanto estiver liberado globalmente, o banner nem aparece.

type Cobertura = { global: boolean; cidades: { slug: string; nome: string; uf: string | null }[] }

export default function AvisoCobertura({ className = '' }: { className?: string }) {
  const [cobertura, setCobertura] = useState<Cobertura | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/publico/cobertura')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && d) setCobertura(d) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  // Sem resposta, liberado em todo lugar, ou sem cidade nenhuma configurada:
  // não há o que informar. Nada de espaço reservado piscando na tela.
  if (!cobertura || cobertura.global || cobertura.cidades.length === 0) return null

  const nomes = cobertura.cidades.map(c => (c.uf ? `${c.nome}/${c.uf}` : c.nome))
  const lista = nomes.length === 1
    ? nomes[0]
    : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`

  return (
    <div className={`flex items-center justify-center gap-2 flex-wrap text-xs text-gray-400 bg-card/60 border border-borda rounded-xl px-3.5 py-2 ${className}`}>
      <MapPin size={13} className="text-acento shrink-0" />
      <span>
        Delivery disponível em <strong className="text-gray-200">{lista}</strong>. Outras cidades em breve.
      </span>
      <Link href="/expansao" className="text-acento hover:underline whitespace-nowrap">
        Trazer para a minha
      </Link>
    </div>
  )
}
