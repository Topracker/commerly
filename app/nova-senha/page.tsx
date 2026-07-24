'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

// Página de destino do link de redefinição de senha. O usuário chega aqui já
// com uma sessão de recuperação (estabelecida em /auth/callback), define a
// nova senha via updateUser e é roteado para a área do seu papel.
export default function NovaSenha() {
  const [pronto, setPronto] = useState(false)   // sessão de recuperação válida?
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setErro('Link inválido ou expirado. Solicite um novo link de redefinição.')
        return
      }
      setPronto(true)
    })
  }, [])

  // Após redefinir a senha, manda o usuário para a área do seu papel
  // (já está autenticado pela sessão de recuperação).
  async function rotearPorPapel(userId: string) {
    const { data: loja } = await supabase.from('lojas').select('id, plano').eq('user_id', userId).maybeSingle()
    if (loja) { router.push(loja.plano === 'ativo' ? '/dashboard' : '/planos'); return }

    const [{ data: cliente }, { data: fornecedor }, { data: entregador }] = await Promise.all([
      supabase.from('clientes').select('id').eq('user_id', userId).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', userId).maybeSingle(),
      supabase.from('entregadores').select('id').eq('user_id', userId).maybeSingle(),
    ])
    if (cliente) { router.push('/cliente/buscar'); return }
    if (fornecedor) { router.push('/fornecedor/dashboard'); return }
    if (entregador) { router.push('/entregador-delivery/dashboard'); return }
    router.push('/')
  }

  async function salvar() {
    if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    setErro('')
    const { data: { user }, error } = await supabase.auth.updateUser({ password: senha })
    if (error || !user) {
      console.error('[nova-senha] updateUser error:', error)
      setErro('Não foi possível redefinir a senha. Solicite um novo link.')
      setLoading(false)
      return
    }
    setOk(true)
    await rotearPorPapel(user.id)
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <main data-theme="dark" className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
        <p className="text-blue-400 text-sm font-semibold mb-1">Recuperar acesso</p>
        <h1 className="text-2xl font-bold text-white mb-6">Definir nova senha</h1>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {ok ? (
          <p className="text-green-400 text-sm">Senha redefinida! Redirecionando…</p>
        ) : !pronto && !erro ? (
          <p className="text-gray-400 text-sm">Validando link…</p>
        ) : !pronto ? (
          <button onClick={() => router.push('/recuperar-senha')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition w-full">
            Solicitar novo link
          </button>
        ) : (
          <div className="flex flex-col gap-4">
            <input type="password" autoComplete="new-password" placeholder="Nova senha (mín. 6 caracteres)" value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvar()} className={inp} />
            <input type="password" autoComplete="new-password" placeholder="Confirmar nova senha" value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvar()} className={inp} />
            <button onClick={salvar} disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
