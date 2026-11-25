'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, ChevronRight } from 'lucide-react'
import { createClient } from '../supabase'
import { idadeVerificada } from '../lib/restritos'

// Card "Verificar minha idade" em Minha conta (cliente). Sem isto, o único
// jeito de achar /cliente/verificar-idade era tentar comprar bebida/cigarro e
// ler a mensagem de erro — ninguém verificava a idade com antecedência.
export function VerificarIdadeCard() {
  const [carregando, setCarregando] = useState(true)
  const [verificada, setVerificada] = useState(false)

  useEffect(() => {
    let cancelado = false
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (cancelado) return
      setVerificada(idadeVerificada(user))
      setCarregando(false)
    })
    return () => { cancelado = true }
  }, [])

  if (carregando) return null

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <p className="text-gray-300 text-sm font-semibold flex items-center gap-1.5">
        <ShieldCheck size={15} className={verificada ? 'text-green-400' : 'text-gray-400'} />
        Verificação de idade
      </p>
      <p className="text-gray-500 text-xs mt-1 leading-relaxed">
        {verificada
          ? 'Idade verificada — você já pode comprar bebida alcoólica e cigarro nas lojas que vendem esses produtos.'
          : 'Necessária para comprar bebida alcoólica e cigarro. Leva poucos minutos: documento + selfie.'}
      </p>
      {!verificada && (
        <Link
          href="/cliente/verificar-idade"
          className="mt-3 inline-flex items-center gap-1 text-green-400 hover:text-green-300 text-sm font-medium transition"
        >
          Verificar agora <ChevronRight size={15} />
        </Link>
      )}
    </div>
  )
}

export default VerificarIdadeCard
