'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'

type Tela = 'escolha' | 'cadastro' | 'cadastro-otp' | 'login-email' | 'login-otp'

const CATEGORIAS = [
  'Alimentos e bebidas', 'Limpeza e higiene', 'Eletrônicos', 'Roupas e acessórios',
  'Papelaria', 'Construção', 'Serviços', 'Tecnologia', 'Outro',
]

export default function FornecedorLogin() {
  const [tela, setTela] = useState<Tela>('escolha')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [localizacao, setLocalizacao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const userId = session.user.id

      const { data: fornecedorData } = await supabase.from('fornecedores').select('id').eq('user_id', userId).maybeSingle()
      if (fornecedorData) { router.push('/fornecedor/dashboard'); return }

      const [{ data: lojaData }, { data: clienteData }] = await Promise.all([
        supabase.from('lojas').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('clientes').select('id').eq('user_id', userId).maybeSingle(),
      ])
      if (lojaData || clienteData) {
        await supabase.auth.signOut()
        setErro('Esta conta está cadastrada como ' + (lojaData ? 'comerciante' : 'cliente') + '. Use a área correta para fazer login.')
        return
      }

      router.push('/fornecedor/onboarding')
    })
  }, [])

  async function avancarCadastro() {
    if (!nome.trim() || !categoria) { setErro('Nome e categoria são obrigatórios!'); return }
    if (!email) { setErro('Informe seu email!'); return }
    setLoading(true)
    setErro('')
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

    const [{ data: lojaExiste }, { data: clienteExiste }] = await Promise.all([
      supabase.from('lojas').select('id').eq('user_id', user!.id).maybeSingle(),
      supabase.from('clientes').select('id').eq('user_id', user!.id).maybeSingle(),
    ])
    if (lojaExiste) { setErro('Este e-mail já está cadastrado como comerciante. Faça login para acessar sua conta.'); setLoading(false); return }
    if (clienteExiste) { setErro('Este e-mail já está cadastrado como cliente. Faça login para acessar sua conta.'); setLoading(false); return }

    const { data: fornecedorExiste } = await supabase.from('fornecedores').select('id').eq('user_id', user!.id).maybeSingle()
    if (fornecedorExiste) { router.push('/fornecedor/dashboard'); return }

    const { error: insertError } = await supabase.from('fornecedores').insert({
      user_id: user!.id, nome: nome.trim(), categoria, localizacao, telefone, instagram, descricao,
    })
    if (insertError) { setErro('Erro ao criar conta. Tente novamente.'); setLoading(false); return }
    router.push('/fornecedor/dashboard')
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
    const { data } = await supabase.from('fornecedores').select('id').eq('user_id', user!.id).maybeSingle()
    router.push(data ? '/fornecedor/dashboard' : '/fornecedor/onboarding')
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500'

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
        <p className="text-purple-400 text-sm font-semibold mb-1">Área do Fornecedor</p>
        <h1 className="text-2xl font-bold text-white mb-6">Commerly</h1>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {tela === 'escolha' && (
          <div className="flex flex-col gap-3">
            <button onClick={() => { setTela('cadastro'); setErro('') }}
              className="bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Criar conta</p>
              <p className="text-purple-200 text-sm">Alcance mais comércios</p>
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
            <p className="text-gray-400 text-sm -mt-2 mb-1">Preencha os dados da sua empresa</p>
            <input placeholder="Nome da empresa *" value={nome} onChange={e => setNome(e.target.value)} className={inp} />
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className={inp}>
              <option value="">Categoria *</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea placeholder="Descrição da empresa (opcional)" value={descricao}
              onChange={e => setDescricao(e.target.value)} rows={3} className={`${inp} resize-none`} />
            <input placeholder="Localização" value={localizacao} onChange={e => setLocalizacao(e.target.value)} className={inp} />
            <input placeholder="Telefone / WhatsApp" value={telefone} onChange={e => setTelefone(e.target.value)} className={inp} />
            <input placeholder="Instagram (ex: @empresa)" value={instagram} onChange={e => setInstagram(e.target.value)} className={inp} />
            <input type="email" placeholder="Seu email *" value={email} onChange={e => setEmail(e.target.value)} className={inp} />
            <button onClick={avancarCadastro} disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition mt-2">
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
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
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
            <input type="email" placeholder="Seu email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviarCodigoLogin()} className={inp} />
            <button onClick={enviarCodigoLogin} disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
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
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
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
