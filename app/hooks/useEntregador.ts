'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'
import type { Entregador } from '../lib/entregadores'

export function useEntregador() {
  const [entregador, setEntregador] = useState<Entregador | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) { router.push('/entregador-delivery/login'); return }
    const { data } = await supabase.from('entregadores').select('*').eq('user_id', user.id).single()
    if (!data) { router.push('/entregador-delivery/onboarding'); return }
    setEntregador(data as Entregador)
    setLoading(false)
  }

  async function recarregar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('entregadores').select('*').eq('user_id', user.id).single()
    if (data) setEntregador(data as Entregador)
  }

  async function sair() {
    await supabase.auth.signOut()
    router.push('/entregador-delivery/login')
  }

  return { entregador, setEntregador, recarregar, loading, supabase, sair }
}
