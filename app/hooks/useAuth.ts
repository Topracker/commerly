'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [loja, setLoja] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) { router.push('/login'); return }
    const { data: lojaData, error: lojaError } = await supabase
      .from('lojas')
      .select('id, nome, tipo, documento, localizacao, telefone, instagram, horario, meta_mensal, latitude, longitude, fotos_fachada')
      .eq('user_id', user.id)
      .single()
    if (lojaError || !lojaData) { router.push('/onboarding'); return }
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
