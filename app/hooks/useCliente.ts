'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export function useCliente() {
  const [cliente, setCliente] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) { router.push('/cliente/login'); return }
    const { data } = await supabase.from('clientes').select('*').eq('user_id', user.id).single()
    if (!data) { router.push('/cliente/onboarding'); return }
    setCliente(data)
    setLoading(false)
  }

  async function sair() {
    await supabase.auth.signOut()
    router.push('/cliente/login')
  }

  return { cliente, loading, supabase, sair }
}
