'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'

type Tela = 'escolha' | 'cadastro' | 'cadastro-otp' | 'login-email' | 'login-otp'

export default function ClienteLogin() {
  const [tela, setTela] = useState<Tela>('escolha')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const userId = session.user.id

      const { data: clienteData } = await supabase.from('clientes').select('id').eq('user_id', userId).maybeSingle()
      if (clienteData) { router.push('/cliente/buscar'); return }

      const [{ data: lojaData }, { data: fornecedorData }] = await Promise.all([
        supabase.from('lojas').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('fornecedores').select('id').eq('user_id', userId).maybeSingle(),
      ])
      if (lojaData || fornecedorData) {
        await supabase.auth.signOut()
        setErro('Este e-mail está cadastrado como ' + (lojaData ? 'comerciante' : 'fornecedor') + '. Use a área correta para fazer login.')
        return
      }

      router.push('/cliente/onboarding')
    })
  }, [])

  async function avancarCadastro() {
    if (!nome.trim()) { setErro('Informe seu nome!'); return }
    if (!email) { setErro('Informe seu email!'); return }
    if (cpf.replace(/\D/g, '').length > 0 && !validarCPF(cpf)) { setErro('CPF inválido. Verifique o número digitado.'); return }
    setLoading(true)
    setErro('')

    // Pré-cria o usuário via Admin API com e-mail já confirmado para que
    // o signInWithOtp use o template "Magic Link" (código numérico) em vez
    // do template "Confirm Signup" (magic link) que é disparado para novos usuários.
    const preRes = await fetch('/api/auth/pre-cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!preRes.ok) { setErro('Erro ao enviar código. Tente novamente.'); setLoading(false); return }

    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) { console.error('[OTP] signInWithOtp error:', error); setErro('Erro ao enviar código. Tente novamente.'); setLoading(false); return }
    setTela('cadastro-otp')
    setLoading(false)
  }

  async function verificarCadastro() {
    if (codigo.length !== 6) { setErro('Digite o código de 6 dígitos'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })
    if (error) { console.error('[OTP] verifyOtp error:', error); setErro('Código inválido ou expirado'); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()

    const [{ data: lojaExiste }, { data: fornecedorExiste }] = await Promise.all([
      supabase.from('lojas').select('id').eq('user_id', user!.id).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', user!.id).maybeSingle(),
    ])
    if (lojaExiste) { setErro('Este e-mail já está cadastrado como comerciante. Faça login para acessar sua conta.'); setLoading(false); return }
    if (fornecedorExiste) { setErro('Este e-mail já está cadastrado como fornecedor. Faça login para acessar sua conta.'); setLoading(false); return }

    const { data: clienteExiste } = await supabase.from('clientes').select('id').eq('user_id', user!.id).maybeSingle()
    if (clienteExiste) { router.push('/cliente/buscar'); return }

    const cpfDigits = cpf.replace(/\D/g, '')
    const { error: insertError } = await supabase.from('clientes').insert({
      user_id: user!.id,
      nome: nome.trim(),
      ...(cpfDigits.length === 11 ? { cpf: cpf } : {}),
    })
    if (insertError) { setErro('Erro ao criar conta. Tente novamente.'); setLoading(false); return }
    router.push('/cliente/buscar')
  }

  async function enviarCodigoLogin() {
    if (!email) { setErro('Informe seu email'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) { console.error('[OTP] signInWithOtp error:', error); setErro('Erro ao enviar código. Tente novamente.'); setLoading(false); return }
    setTela('login-otp')
    setLoading(false)
  }

  async function verificarLogin() {
    if (codigo.length !== 6) { setErro('Digite o código de 6 dígitos'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })
    if (error) { console.error('[OTP] verifyOtp error:', error); setErro('Código inválido ou expirado'); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('clientes').select('id').eq('user_id', user!.id).maybeSingle()
    if (!data) {
      await supabase.auth.signOut()
      setErro('Conta não encontrada. Use "Criar conta" para se cadastrar.')
      setTela('escolha')
      setCodigo('')
      setLoading(false)
      return
    }
    router.push('/cliente/buscar')
  }

  function validarCPF(v: string): boolean {
    const d = v.replace(/\D/g, '')
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
    let s = 0
    for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
    let r = 11 - (s % 11); if (r >= 10) r = 0
    if (r !== +d[9]) return false
    s = 0
    for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
    r = 11 - (s % 11); if (r >= 10) r = 0
    return r === +d[10]
  }

  function formatarCPF(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500'

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm">
        <p className="text-green-400 text-sm font-semibold mb-1">Área do Cliente</p>
        <h1 className="text-2xl font-bold text-white mb-6">Commerly</h1>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {tela === 'escolha' && (
          <div className="flex flex-col gap-3">
            <button onClick={() => { setTela('cadastro'); setErro('') }}
              className="bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Criar conta</p>
              <p className="text-green-200 text-sm">Descubra comércios locais</p>
            </button>
            <button onClick={() => { setTela('login-email'); setErro('') }}
              className="bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Fazer login</p>
              <p className="text-gray-400 text-sm">Acessar minha conta existente</p>
            </button>
            <button onClick={() => router.push('/')} className="text-gray-500 text-sm hover:text-gray-400 transition mt-2">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'cadastro' && (
          <div className="flex flex-col gap-4">
            <input type="text" autoComplete="name" placeholder="Seu nome *" value={nome} onChange={e => setNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && avancarCadastro()} className={inp} />
            <input type="email" autoComplete="email" placeholder="Seu email *" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && avancarCadastro()} className={inp} />
            <input type="text" autoComplete="off" inputMode="numeric" placeholder="CPF (opcional)" value={cpf}
              onChange={e => setCpf(formatarCPF(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && avancarCadastro()} className={inp} />
            <button onClick={avancarCadastro} disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Enviando código...' : 'Continuar'}
            </button>
            <button onClick={() => { setTela('escolha'); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'cadastro-otp' && (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm -mt-2 mb-2">
              Código enviado para <strong className="text-white">{email}</strong>
            </p>
            <input type="text" inputMode="numeric" placeholder="000000" value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && verificarCadastro()}
              maxLength={6} autoFocus className={`${inp} text-center text-2xl tracking-widest`} />
            <button onClick={verificarCadastro} disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Criando conta...' : 'Verificar e criar conta'}
            </button>
            <button onClick={() => { setTela('cadastro'); setCodigo(''); setErro('') }}
              className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'login-email' && (
          <div className="flex flex-col gap-4">
            <input type="email" autoComplete="email" placeholder="Seu email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviarCodigoLogin()} className={inp} />
            <button onClick={enviarCodigoLogin} disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
            <button onClick={() => { setTela('escolha'); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'login-otp' && (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm -mt-2 mb-2">
              Código enviado para <strong className="text-white">{email}</strong>
            </p>
            <input type="text" inputMode="numeric" placeholder="000000" value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && verificarLogin()}
              maxLength={6} autoFocus className={`${inp} text-center text-2xl tracking-widest`} />
            <button onClick={verificarLogin} disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Verificando...' : 'Verificar código'}
            </button>
            <button onClick={() => { setTela('login-email'); setCodigo(''); setErro('') }}
              className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Usar outro email
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
