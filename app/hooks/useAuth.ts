'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter, usePathname } from 'next/navigation'
import { situacaoPlano, rotaLivreSemPlano } from '../lib/plano'

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [loja, setLoja] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { init() }, [])

  // Loja do usuário. `maybeSingle` (e não `single`): 0 linhas volta como
  // `data: null` SEM erro, então "sem loja" e "falha ao ler" ficam separados.
  // `order + limit(1)` é cinto de segurança: se por algum caminho ainda
  // existirem duas lojas (o índice único lojas_user_id_uidx impede novas), pega
  // a mais antiga em vez de estourar PGRST116 — que é o que mandava um
  // comerciante existente para o /onboarding e o prendia no loop
  // onboarding <-> dashboard.
  function lerLoja(userId: string) {
    return supabase
      .from('lojas')
      // `plano`, `trial_expira_em` e `fundador` alimentam o badge do header e o
      // PAYWALL (lib/plano.ts) — sem eles o badge dizia "INATIVO" para uma loja
      // ativa e o bloqueio não teria como saber se o teste ainda corre.
      .select('id, nome, tipo, documento, localizacao, telefone, instagram, horario, meta_mensal, latitude, longitude, fotos_fachada, taxa_entrega, website_url, whatsapp_business, delivery_ativo, plano, trial_expira_em, fundador')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  }

  async function init() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) { router.push('/login'); return }
    let { data: lojaData, error: lojaError } = await lerLoja(user.id)
    // Erro (rede/sessão) NÃO é "sem loja": tenta mais uma vez antes de decidir.
    // Sem isto, uma falha transitória mandava um comerciante com loja para o
    // cadastro — e era assim que a segunda loja acabava sendo criada.
    if (lojaError) {
      await new Promise(r => setTimeout(r, 1500))
      ;({ data: lojaData, error: lojaError } = await lerLoja(user.id))
    }
    if (lojaError || !lojaData) { router.push('/onboarding'); return }

    // PAYWALL: assinatura cancelada/vencida e sem teste correndo -> só /planos.
    // Sem isto, cancelar a assinatura não tirava nada do comerciante.
    if (!situacaoPlano(lojaData).liberada && !rotaLivreSemPlano(pathname)) {
      router.replace('/planos')
      return
    }

    setUser(user)
    setLoja(lojaData)
    setLoading(false)
  }

  async function sair() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return { user, loja, setLoja, loading, supabase, sair }
}
