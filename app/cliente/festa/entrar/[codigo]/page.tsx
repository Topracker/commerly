'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '../../../../supabase'
import { normalizarCodigo } from '../../../../lib/festas'
import { PartyPopper, Loader2 } from 'lucide-react'

// Chave usada para guardar o convite quando o visitante ainda não está logado —
// o /cliente/buscar (tela pós-login) consome e entra na festa automaticamente.
export const FESTA_CONVITE_KEY = 'festa_convite_pendente'

// Rota de convite: https://commerly.vercel.app/cliente/festa/entrar/[codigo]
// Entra direto na festa se já estiver logado; senão manda pro login guardando o código.
export default function EntrarFestaPorLink() {
  const { codigo } = useParams<{ codigo: string }>()
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const cod = normalizarCodigo(codigo || '')
    if (cod.length < 4) { setErro('Convite inválido. Confira o link.'); return }

    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()

      // Não logado: guarda o convite e manda para o login do cliente.
      if (!user) {
        try { localStorage.setItem(FESTA_CONVITE_KEY, cod) } catch {}
        router.replace('/cliente/login')
        return
      }

      // Logado mas não é um cliente (ou onboarding incompleto): guarda e segue o fluxo normal.
      const { data: cli } = await supabase.from('clientes').select('id').eq('user_id', user.id).maybeSingle()
      if (!cli) {
        try { localStorage.setItem(FESTA_CONVITE_KEY, cod) } catch {}
        router.replace('/cliente/onboarding')
        return
      }

      const res = await fetch('/api/festa/entrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: cod }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.festa?.id) {
        setErro(d.error || 'Não foi possível entrar na festa.')
        return
      }
      router.replace(`/cliente/festa/${d.festa.id}`)
    })()
  }, [codigo, router])

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <PartyPopper size={40} className="text-acento mx-auto mb-4" />
        {erro ? (
          <>
            <p className="text-gray-300 mb-4">{erro}</p>
            <button onClick={() => router.push('/cliente/festa')} className="text-acento font-medium">
              Ver minhas festas
            </button>
          </>
        ) : (
          <p className="text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" /> Entrando na festa...
          </p>
        )}
      </div>
    </main>
  )
}
