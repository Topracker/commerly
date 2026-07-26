'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'
import { AVISO_VERIFICACAO } from '../lib/validacoes'
import BotaoGoogle from '../components/BotaoGoogle'
import CampoSenha, { senhaValida } from '../components/CampoSenha'

type Tela =
  | 'escolha'
  | 'cadastro-senha'
  | 'login-senha'
  | 'cadastro-otp-codigo'
  | 'login-otp-email'
  | 'login-otp-codigo'

export default function Login() {
  const [tela, setTela] = useState<Tela>('escolha')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  // Mensagem do Supabase quando a senha é recusada DEPOIS do código (422
  // weak_password): cumpre as regras locais mas está em vazamentos conhecidos.
  const [senhaRecusada, setSenhaRecusada] = useState('')
  const [codigo, setCodigo] = useState('')
  const [usarOtp, setUsarOtp] = useState(false)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Destino conforme o estado da loja (cadastro de dados fica em /onboarding).
  function rotaLoja(loja: { plano?: string } | null): string {
    if (!loja) return '/onboarding'
    return loja.plano === 'ativo' ? '/dashboard' : '/planos'
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('erro') === 'oauth') {
      setErro('Não foi possível entrar com o Google. Tente novamente.')
    }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const userId = session.user.id

      const { data: loja } = await supabase.from('lojas').select('id, plano').eq('user_id', userId).maybeSingle()
      if (loja) { router.push(rotaLoja(loja)); return }

      const [{ data: clienteData }, { data: fornecedorData }] = await Promise.all([
        supabase.from('clientes').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('fornecedores').select('id').eq('user_id', userId).maybeSingle(),
      ])
      if (clienteData || fornecedorData) {
        await supabase.auth.signOut()
        setErro('Este e-mail está cadastrado como ' + (clienteData ? 'cliente' : 'fornecedor') + '. Use a área correta para fazer login.')
        return
      }

      router.push('/onboarding')
    })
  }, [])

  // ---- Etapas compartilhadas (após autenticar por senha ou OTP) ----

  async function finalizarCadastro(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErro('Sessão expirada. Tente novamente.'); return false }

    const [{ data: clienteExiste }, { data: fornecedorExiste }] = await Promise.all([
      supabase.from('clientes').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', user.id).maybeSingle(),
    ])
    if (clienteExiste) { setErro('Este e-mail já está cadastrado como cliente. Faça login para acessar sua conta.'); return false }
    if (fornecedorExiste) { setErro('Este e-mail já está cadastrado como fornecedor. Faça login para acessar sua conta.'); return false }

    const { data: loja } = await supabase.from('lojas').select('id, plano').eq('user_id', user.id).maybeSingle()
    router.push(rotaLoja(loja))
    return true
  }

  async function finalizarLogin(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErro('Sessão expirada. Tente novamente.'); return false }

    const { data: loja } = await supabase.from('lojas').select('id, plano').eq('user_id', user.id).maybeSingle()
    if (loja) { router.push(rotaLoja(loja)); return true }

    const [{ data: clienteData }, { data: fornecedorData }] = await Promise.all([
      supabase.from('clientes').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', user.id).maybeSingle(),
    ])
    if (clienteData || fornecedorData) {
      await supabase.auth.signOut()
      setErro('Esta conta está cadastrada como ' + (clienteData ? 'cliente' : 'fornecedor') + '. Use a área correta para fazer login.')
      return false
    }

    router.push('/onboarding')
    return true
  }

  // ---- Cadastro / login por SENHA (método principal) ----

  async function cadastrarComSenha() {
    if (!email) { setErro('Informe seu email!'); return }
    if (!senhaValida(senha)) { setErro('A senha ainda não atende a todos os requisitos.'); return }
    setLoading(true)
    setErro('')

    // Segurança: o cadastro por senha exige confirmação do e-mail por código
    // antes de liberar acesso. Aqui apenas garantimos a conta e enviamos o
    // código — a senha só é definida após o código ser confirmado
    // (verificarCadastroOtp), provando que o e-mail é do próprio usuário.
    const preRes = await fetch('/api/auth/pre-cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!preRes.ok) {
      const { erro } = await preRes.json().catch(() => ({ erro: '' }))
      setErro(erro || 'Não foi possível enviar o código. Tente novamente.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) { console.error('[OTP] signInWithOtp error:', error); setErro('Erro ao enviar código. Tente novamente.'); setLoading(false); return }
    setTela('cadastro-otp-codigo')
    setLoading(false)
  }

  async function loginComSenha() {
    if (!email || !senha) { setErro('Informe email e senha'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) { setErro('E-mail ou senha incorretos.'); setLoading(false); return }
    const ok = await finalizarLogin()
    if (!ok) setLoading(false)
  }

  // ---- Cadastro / login por OTP (alternativa) ----

  async function avancarCadastroOtp() {
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
    setTela('cadastro-otp-codigo')
    setLoading(false)
  }

  // Segunda tentativa de senha, já com o e-mail confirmado e a sessão ativa.
  async function salvarSenhaRecusada() {
    if (!senhaValida(senha)) { setErro('A senha ainda não atende a todos os requisitos.'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) { setSenhaRecusada(error.message); setLoading(false); return }
    setSenhaRecusada('')
    const ok = await finalizarCadastro()
    if (!ok) setLoading(false)
  }

  async function verificarCadastroOtp() {
    if (codigo.length !== 6) { setErro('Digite o código de 6 dígitos'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })
    if (error) { console.error('[OTP] verifyOtp error:', error); setErro('Código inválido ou expirado'); setLoading(false); return }
    // E-mail confirmado: agora sim definimos a senha escolhida no cadastro
    // (vazia no fluxo só-OTP, então é ignorada).
    if (senha) {
      const { error: senhaErr } = await supabase.auth.updateUser({ password: senha })
      if (senhaErr) {
        // O e-mail já foi confirmado (o código foi consumido), mas o Supabase
        // recusou a SENHA. Antes isso ia só para o console: a conta nascia sem
        // a senha escolhida e ninguém avisava o usuário. Agora pedimos outra
        // senha na hora, sem perder o cadastro.
        console.error('[cadastro] erro ao definir senha:', senhaErr)
        setSenhaRecusada(senhaErr.message)
        setLoading(false)
        return
      }
    }
    const ok = await finalizarCadastro()
    if (!ok) setLoading(false)
  }

  async function enviarCodigoLoginOtp() {
    if (!email) { setErro('Informe seu email'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (error) { console.error('[OTP] signInWithOtp error:', error); setErro('Erro ao enviar código. Tente novamente.'); setLoading(false); return }
    setTela('login-otp-codigo')
    setLoading(false)
  }

  async function verificarLoginOtp() {
    if (codigo.length !== 6) { setErro('Digite o código de 6 dígitos'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })
    if (error) { console.error('[OTP] verifyOtp error:', error); setErro('Código inválido ou expirado'); setLoading(false); return }
    const ok = await finalizarLogin()
    if (!ok) setLoading(false)
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <main data-theme="dark" className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
        <p className="text-blue-400 text-sm font-semibold mb-1">Área do Comerciante</p>
        <h1 className="text-2xl font-bold text-white mb-6">Commerly</h1>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {tela === 'escolha' && (
          <div className="flex flex-col gap-3">
            <button onClick={() => { setTela('cadastro-senha'); setUsarOtp(false); setErro('') }}
              className="bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Criar conta</p>
              <p className="text-blue-200 text-sm">Cadastre sua loja no Commerly</p>
            </button>
            <button onClick={() => { setTela('login-senha'); setErro('') }}
              className="bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Fazer login</p>
              <p className="text-gray-400 text-sm">Acessar minha conta existente</p>
            </button>
            <BotaoGoogle voltar="/login" onErro={setErro} />
            <button onClick={() => router.push('/')} className="text-gray-500 text-sm hover:text-gray-400 transition mt-2">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'cadastro-senha' && (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm -mt-2 mb-1">Crie sua conta com email e senha</p>
            <input type="email" autoComplete="email" placeholder="Seu email *" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (usarOtp ? avancarCadastroOtp() : cadastrarComSenha())}
              className={inp} />
            {!usarOtp && (
              <CampoSenha id="cad-comerciante" value={senha} onChange={setSenha} onEnter={cadastrarComSenha}
                placeholder="Senha *" className={inp} />
            )}
            <p className="text-gray-500 text-xs text-center">🔒 {AVISO_VERIFICACAO}</p>
            <button onClick={() => (usarOtp ? avancarCadastroOtp() : cadastrarComSenha())} disabled={loading || (!usarOtp && !senhaValida(senha))}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition mt-1">
              {loading ? (usarOtp ? 'Enviando código...' : 'Criando conta...') : (usarOtp ? 'Continuar' : 'Criar conta')}
            </button>
            <button onClick={() => { setUsarOtp(!usarOtp); setErro('') }}
              className="text-blue-400 text-sm hover:text-blue-300 transition">
              {usarOtp ? 'Cadastrar com senha' : 'Prefiro receber um código por e-mail'}
            </button>
            <button onClick={() => { setTela('escolha'); setErro(''); setEmail(''); setSenha('') }}
              className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'login-senha' && (
          <div className="flex flex-col gap-4">
            <input type="email" autoComplete="email" placeholder="Seu email" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loginComSenha()} className={inp} />
            <input type="password" autoComplete="current-password" placeholder="Senha" value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loginComSenha()} className={inp} />
            <button onClick={loginComSenha} disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <button onClick={() => { setTela('login-otp-email'); setErro('') }}
              className="text-blue-400 text-sm hover:text-blue-300 transition">
              Entrar com código por e-mail
            </button>
            <button onClick={() => router.push('/recuperar-senha?voltar=/login')}
              className="text-gray-400 text-sm hover:text-gray-300 transition">
              Esqueci minha senha
            </button>
            <button onClick={() => { setTela('escolha'); setErro(''); setEmail(''); setSenha('') }}
              className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'cadastro-otp-codigo' && (
          <div className="flex flex-col gap-4">
            {senhaRecusada ? (
              <>
                <p className="text-gray-300 text-sm">
                  Seu e-mail foi confirmado, mas essa senha foi recusada. Escolha outra para concluir:
                </p>
                <p className="text-gray-500 text-[11px] font-mono break-all whitespace-pre-wrap select-all">{senhaRecusada}</p>
                <CampoSenha id="retry-comerciante" value={senha} onChange={setSenha} onEnter={salvarSenhaRecusada}
                  placeholder="Nova senha *" className={inp} />
                <button onClick={salvarSenhaRecusada} disabled={loading || !senhaValida(senha)} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition">
                  {loading ? 'Salvando...' : 'Salvar senha e continuar'}
                </button>
              </>
            ) : (
              <>
              <p className="text-gray-400 text-sm -mt-2 mb-2">
                Código enviado para <strong className="text-white">{email}</strong>
              </p>
              <input type="text" inputMode="numeric" placeholder="000000" value={codigo}
                onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && verificarCadastroOtp()}
                maxLength={6} autoFocus className={`${inp} text-center text-2xl tracking-widest`} />
              <button onClick={verificarCadastroOtp} disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
                {loading ? 'Criando conta...' : 'Verificar e criar conta'}
              </button>
              <button onClick={() => { setTela('cadastro-senha'); setCodigo(''); setErro('') }}
                className="text-gray-500 text-sm hover:text-gray-400 transition">
                ← Voltar
              </button>
              </>
            )}
          </div>
        )}

        {tela === 'login-otp-email' && (
          <div className="flex flex-col gap-4">
            <input type="email" placeholder="Seu email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviarCodigoLoginOtp()} autoComplete="email" className={inp} />
            <button onClick={enviarCodigoLoginOtp} disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
            <button onClick={() => { setTela('login-senha'); setErro('') }}
              className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'login-otp-codigo' && (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm -mt-2 mb-2">
              Código enviado para <strong className="text-white">{email}</strong>
            </p>
            <input type="text" inputMode="numeric" placeholder="000000" value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && verificarLoginOtp()}
              maxLength={6} autoFocus className={`${inp} text-center text-2xl tracking-widest`} />
            <button onClick={verificarLoginOtp} disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Verificando...' : 'Verificar código'}
            </button>
            <button onClick={() => { setTela('login-otp-email'); setCodigo(''); setErro('') }}
              className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Usar outro email
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
