'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'
import { AVISO_VERIFICACAO } from '../../lib/validacoes'
import BotaoGoogle from '../../components/BotaoGoogle'

type Tela = 'escolha' | 'cadastro-senha' | 'login-senha' | 'cadastro-otp-codigo' | 'login-otp-email' | 'login-otp-codigo'

export default function EntregadorLogin() {
  const [tela, setTela] = useState<Tela>('escolha')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('erro') === 'oauth') {
      setErro('Não foi possível entrar com o Google. Tente novamente.')
    }
    // getUser() valida o token no servidor e garante que ele esteja anexado às
    // queries seguintes. Com getSession() havia uma corrida em cold-mount: a
    // leitura de entregadores rodava sem token e voltava vazia por RLS (sem
    // erro), mandando um entregador já cadastrado para o onboarding.
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      await rotearPorPapel(user.id, false)
    })
  }, [])

  // Descobre o papel da conta e roteia. Entregador é uma conta EXCLUSIVA: se o
  // e-mail já é loja/cliente/fornecedor, bloqueia (use a área correta).
  async function rotearPorPapel(userId: string, mostrarErro: boolean): Promise<boolean> {
    const { data: entregador, error: entErr } = await supabase.from('entregadores').select('id').eq('user_id', userId).maybeSingle()
    // Falha ao ler o perfil (rede/sessão): não mande um entregador existente
    // para o onboarding — deixe-o tentar novamente.
    if (entErr) {
      if (mostrarErro) setErro('Não foi possível carregar seu perfil. Tente novamente.')
      return false
    }
    if (entregador) { router.push('/entregador-delivery/dashboard'); return true }

    const [{ data: loja }, { data: cliente }, { data: fornecedor }] = await Promise.all([
      supabase.from('lojas').select('id').eq('user_id', userId).maybeSingle(),
      supabase.from('clientes').select('id').eq('user_id', userId).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', userId).maybeSingle(),
    ])
    if (loja || cliente || fornecedor) {
      await supabase.auth.signOut()
      if (mostrarErro) {
        const papel = loja ? 'comerciante' : cliente ? 'cliente' : 'fornecedor'
        setErro(`Esta conta está cadastrada como ${papel}. Use a área correta para fazer login.`)
      }
      return false
    }
    router.push('/entregador-delivery/onboarding')
    return true
  }

  async function finalizar(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErro('Sessão expirada. Tente novamente.'); return false }
    return rotearPorPapel(user.id, true)
  }

  async function cadastrarComSenha() {
    if (!email) { setErro('Informe seu email!'); return }
    if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return }
    setLoading(true); setErro('')
    // Confirma posse do e-mail por código antes de liberar acesso.
    const preRes = await fetch('/api/auth/pre-cadastro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    })
    if (!preRes.ok) {
      const { erro } = await preRes.json().catch(() => ({ erro: '' }))
      setErro(erro || 'Não foi possível enviar o código. Tente novamente.'); setLoading(false); return
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) { setErro('Erro ao enviar código. Tente novamente.'); setLoading(false); return }
    setTela('cadastro-otp-codigo'); setLoading(false)
  }

  async function verificarCadastroOtp() {
    if (codigo.length !== 6) { setErro('Digite o código de 6 dígitos'); return }
    setLoading(true); setErro('')
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })
    if (error) { setErro('Código inválido ou expirado'); setLoading(false); return }
    if (senha.length >= 6) {
      const { error: senhaErr } = await supabase.auth.updateUser({ password: senha })
      if (senhaErr) console.error('[cadastro] erro ao definir senha:', senhaErr)
    }
    const ok = await finalizar()
    if (!ok) setLoading(false)
  }

  async function loginComSenha() {
    if (!email || !senha) { setErro('Informe email e senha'); return }
    setLoading(true); setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) { setErro('E-mail ou senha incorretos.'); setLoading(false); return }
    const ok = await finalizar()
    if (!ok) setLoading(false)
  }

  async function enviarCodigoLoginOtp() {
    if (!email) { setErro('Informe seu email'); return }
    setLoading(true); setErro('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) { setErro('Erro ao enviar código. Tente novamente.'); setLoading(false); return }
    setTela('login-otp-codigo'); setLoading(false)
  }

  async function verificarLoginOtp() {
    if (codigo.length !== 6) { setErro('Digite o código de 6 dígitos'); return }
    setLoading(true); setErro('')
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })
    if (error) { setErro('Código inválido ou expirado'); setLoading(false); return }
    const ok = await finalizar()
    if (!ok) { setTela('escolha'); setCodigo(''); setLoading(false) }
  }

  const inp = 'bg-superficie border border-borda text-white rounded-xl px-4 py-3 outline-none focus:border-acento/60 transition'
  const btn = 'bg-azul hover:brightness-110 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition'
  const link = 'text-acento text-sm hover:text-[#f0764a] transition'

  return (
    <main className="min-h-screen bg-fundo flex items-center justify-center p-6">
      <div className="bg-card border border-borda rounded-3xl p-8 w-full max-w-sm">
        <p className="text-acento text-sm font-semibold mb-1">🛵 Área do Entregador</p>
        <h1 className="text-2xl font-bold text-white mb-6">Commerly</h1>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {tela === 'escolha' && (
          <div className="flex flex-col gap-3">
            <button onClick={() => { setTela('cadastro-senha'); setErro('') }}
              className="bg-azul hover:brightness-110 text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Quero ser entregador</p>
              <p className="text-orange-200 text-sm">Faça entregas e ganhe por corrida</p>
            </button>
            <button onClick={() => { setTela('login-senha'); setErro('') }}
              className="bg-elevado border border-borda hover:bg-borda text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Fazer login</p>
              <p className="text-gray-400 text-sm">Acessar minha conta existente</p>
            </button>
            <BotaoGoogle voltar="/entregador-delivery/login" onErro={setErro} />
            <button onClick={() => router.push('/')} className="text-gray-500 text-sm hover:text-gray-400 transition mt-2">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'cadastro-senha' && (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm -mt-2">Crie seu acesso. No próximo passo você completa o perfil.</p>
            <input type="email" autoComplete="email" placeholder="Seu email *" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && cadastrarComSenha()} className={inp} />
            <input type="password" autoComplete="new-password" placeholder="Senha (mín. 6 caracteres) *" value={senha}
              onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && cadastrarComSenha()} className={inp} />
            <p className="text-gray-500 text-xs text-center">🔒 {AVISO_VERIFICACAO}</p>
            <button onClick={cadastrarComSenha} disabled={loading} className={btn}>
              {loading ? 'Enviando código...' : 'Criar conta'}
            </button>
            <button onClick={() => { setTela('escolha'); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">← Voltar</button>
          </div>
        )}

        {tela === 'login-senha' && (
          <div className="flex flex-col gap-4">
            <input type="email" autoComplete="email" placeholder="Seu email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loginComSenha()} className={inp} />
            <input type="password" autoComplete="current-password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loginComSenha()} className={inp} />
            <button onClick={loginComSenha} disabled={loading} className={btn}>{loading ? 'Entrando...' : 'Entrar'}</button>
            <button onClick={() => { setTela('login-otp-email'); setErro('') }} className={link}>Entrar com código por e-mail</button>
            <button onClick={() => router.push('/recuperar-senha?voltar=/entregador-delivery/login')} className="text-gray-400 text-sm hover:text-gray-300 transition">Esqueci minha senha</button>
            <button onClick={() => { setTela('escolha'); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">← Voltar</button>
          </div>
        )}

        {tela === 'cadastro-otp-codigo' && (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm -mt-2 mb-2">Código enviado para <strong className="text-white">{email}</strong></p>
            <input type="text" inputMode="numeric" placeholder="000000" value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && verificarCadastroOtp()}
              maxLength={6} autoFocus className={`${inp} text-center text-2xl tracking-widest`} />
            <button onClick={verificarCadastroOtp} disabled={loading} className={btn}>
              {loading ? 'Criando conta...' : 'Verificar e continuar'}
            </button>
            <button onClick={() => { setTela('cadastro-senha'); setCodigo(''); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">← Voltar</button>
          </div>
        )}

        {tela === 'login-otp-email' && (
          <div className="flex flex-col gap-4">
            <input type="email" autoComplete="email" placeholder="Seu email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviarCodigoLoginOtp()} className={inp} />
            <button onClick={enviarCodigoLoginOtp} disabled={loading} className={btn}>{loading ? 'Enviando...' : 'Enviar código'}</button>
            <button onClick={() => { setTela('login-senha'); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">← Voltar</button>
          </div>
        )}

        {tela === 'login-otp-codigo' && (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm -mt-2 mb-2">Código enviado para <strong className="text-white">{email}</strong></p>
            <input type="text" inputMode="numeric" placeholder="000000" value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && verificarLoginOtp()}
              maxLength={6} autoFocus className={`${inp} text-center text-2xl tracking-widest`} />
            <button onClick={verificarLoginOtp} disabled={loading} className={btn}>{loading ? 'Verificando...' : 'Verificar código'}</button>
            <button onClick={() => { setTela('login-otp-email'); setCodigo(''); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">← Usar outro email</button>
          </div>
        )}
      </div>
    </main>
  )
}
