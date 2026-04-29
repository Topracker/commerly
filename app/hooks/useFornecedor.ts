'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export function useFornecedor() {
  const [fornecedor, setFornecedor] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) { router.push('/fornecedor/login'); return }
    const { data } = await supabase.from('fornecedores').select('*').eq('user_id', user.id).single()
    if (!data) { router.push('/fornecedor/onboarding'); return }
    setFornecedor(data)
    setLoading(false)
  }

  async function sair() {
    await supabase.auth.signOut()
    router.push('/fornecedor/login')
  }

  return { fornecedor, loading, supabase, sair }
}
