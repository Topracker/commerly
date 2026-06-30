'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'
import {
  soDigitos, validarCPF, formatarCPF, formatarTelefone,
  erroTelefone, checarDuplicidade, MSG_DUPLICADO,
  registrarCadastroIp, AVISO_VERIFICACAO,
} from '../../lib/validacoes'

type Tela =
  | 'escolha'
  | 'cadastro-senha'
  | 'login-senha'
  | 'cadastro-otp-dados'
  | 'cadastro-otp-codigo'
  | 'login-otp-email'
  | 'login-otp-codigo'

export default function ClienteLogin() {
  const [tela, setTela] = useState<Tela>('escolha')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
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

  // ---- Etapas compartilhadas (após autenticar por senha ou OTP) ----

  async function finalizarCadastroCliente(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErro('Sessão expirada. Tente novamente.'); return false }

    const [{ data: lojaExiste }, { data: fornecedorExiste }] = await Promise.all([
      supabase.from('lojas').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', user.id).maybeSingle(),
    ])
    if (lojaExiste) { setErro('Este e-mail já está cadastrado como comerciante. Faça login para acessar sua conta.'); return false }
    if (fornecedorExiste) { setErro('Este e-mail já está cadastrado como fornecedor. Faça login para acessar sua conta.'); return false }

    const { data: clienteExiste } = await supabase.from('clientes').select('id').eq('user_id', user.id).maybeSingle()
    if (clienteExiste) { router.push('/cliente/buscar'); return true }

    const cpfDigits = soDigitos(cpf)
    // CPF e telefone não podem se repetir em outra conta do Commerly.
    const dup = await checarDuplicidade({
      ...(cpfDigits.length === 11 ? { cpf } : {}),
      ...(telefone ? { telefone } : {}),
    })
    if (dup.erro) { setErro(dup.erro); return false }
    if (dup.duplicado) { setErro(MSG_DUPLICADO[dup.duplicado]); return false }

    // Anti-spam: no máx. 1 conta por dia por IP.
    const lim = await registrarCadastroIp('cliente')
    if (!lim.ok) { setErro(lim.erro!); return false }

    const { error: insertError } = await supabase.from('clientes').insert({
      user_id: user.id,
      nome: nome.trim(),
      ...(cpfDigits.length === 11 ? { cpf } : {}),
      ...(telefone ? { telefone } : {}),
    })
    if (insertError) { setErro('Erro ao criar conta. Tente novamente.'); return false }
    router.push('/cliente/buscar')
    return true
  }

  async function finalizarLoginCliente(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErro('Sessão expirada. Tente novamente.'); return false }

    const { data: cliente } = await supabase.from('clientes').select('id').eq('user_id', user.id).maybeSingle()
    if (cliente) { router.push('/cliente/buscar'); return true }

    const [{ data: lojaData }, { data: fornecedorData }] = await Promise.all([
      supabase.from('lojas').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', user.id).maybeSingle(),
    ])
    if (lojaData || fornecedorData) {
      await supabase.auth.signOut()
      setErro('Esta conta está cadastrada como ' + (lojaData ? 'comerciante' : 'fornecedor') + '. Use a área correta para fazer login.')
      return false
    }

    router.push('/cliente/onboarding')
    return true
  }

  // ---- Cadastro / login por SENHA ----

  async function cadastrarComSenha() {
    if (!nome.trim()) { setErro('Informe seu nome!'); return }
    if (!email) { setErro('Informe seu email!'); return }
    if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return }
    if (cpf.replace(/\D/g, '').length > 0 && !validarCPF(cpf)) { setErro('CPF inválido. Verifique o número digitado.'); return }
    if (telefone && erroTelefone(telefone)) { setErro('Telefone inválido. Use um número válido com DDD.'); return }
    setLoading(true)
    setErro('')

    // Segurança: o cadastro por senha exige confirmação do e-mail por código
    // antes de liberar acesso. A senha só é definida após o código ser
    // confirmado (verificarCadastroOtp), provando a posse do e-mail.
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
    const ok = await finalizarLoginCliente()
    if (!ok) setLoading(false)
  }

  // ---- Cadastro / login por OTP (alternativa) ----

  async function avancarCadastroOtp() {
    if (!nome.trim()) { setErro('Informe seu nome!'); return }
    if (!email) { setErro('Informe seu email!'); return }
    if (cpf.replace(/\D/g, '').length > 0 && !validarCPF(cpf)) { setErro('CPF inválido. Verifique o número digitado.'); return }
    if (telefone && erroTelefone(telefone)) { setErro('Telefone inválido. Use um número válido com DDD.'); return }
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

  async function verificarCadastroOtp() {
    if (codigo.length !== 6) { setErro('Digite o código de 6 dígitos'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })
    if (error) { console.error('[OTP] verifyOtp error:', error); setErro('Código inválido ou expirado'); setLoading(false); return }
    // E-mail confirmado: define a senha escolhida no cadastro (vazia no fluxo
    // só-OTP, então é ignorada).
    if (senha.length >= 6) {
      const { error: senhaErr } = await supabase.auth.updateUser({ password: senha })
      if (senhaErr) console.error('[cadastro] erro ao definir senha:', senhaErr)
    }
    const ok = await finalizarCadastroCliente()
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
    const ok = await finalizarLoginCliente()
    if (!ok) { setTela('escolha'); setCodigo(''); setLoading(false) }
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
            <button onClick={() => { setTela('cadastro-senha'); setErro('') }}
              className="bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Criar conta</p>
              <p className="text-green-200 text-sm">Descubra comércios locais</p>
            </button>
            <button onClick={() => { setTela('login-senha'); setErro('') }}
              className="bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Fazer login</p>
              <p className="text-gray-400 text-sm">Acessar minha conta existente</p>
            </button>
            <button onClick={() => router.push('/')} className="text-gray-500 text-sm hover:text-gray-400 transition mt-2">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'cadastro-senha' && (
          <div className="flex flex-col gap-4">
            <input type="text" autoComplete="name" placeholder="Seu nome *" value={nome} onChange={e => setNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && cadastrarComSenha()} className={inp} />
            <input type="email" autoComplete="email" placeholder="Seu email *" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && cadastrarComSenha()} className={inp} />
            <input type="text" autoComplete="off" inputMode="numeric" placeholder="CPF (opcional)" value={cpf}
              onChange={e => setCpf(formatarCPF(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && cadastrarComSenha()} className={inp} />
            <input type="tel" autoComplete="tel" inputMode="numeric" placeholder="WhatsApp (opcional)" value={telefone}
              onChange={e => setTelefone(formatarTelefone(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && cadastrarComSenha()} className={inp} />
            <input type="password" autoComplete="new-password" placeholder="Senha (mín. 6 caracteres) *" value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && cadastrarComSenha()} className={inp} />
            <p className="text-gray-500 text-xs text-center">🔒 {AVISO_VERIFICACAO}</p>
            <button onClick={cadastrarComSenha} disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
            <button onClick={() => { setTela('cadastro-otp-dados'); setErro('') }}
              className="text-green-400 text-sm hover:text-green-300 transition">
              Prefiro receber um código por e-mail
            </button>
            <button onClick={() => { setTela('escolha'); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'login-senha' && (
          <div className="flex flex-col gap-4">
            <input type="email" autoComplete="email" placeholder="Seu email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loginComSenha()} className={inp} />
            <input type="password" autoComplete="current-password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loginComSenha()} className={inp} />
            <button onClick={loginComSenha} disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <button onClick={() => { setTela('login-otp-email'); setErro('') }}
              className="text-green-400 text-sm hover:text-green-300 transition">
              Entrar com código por e-mail
            </button>
            <button onClick={() => { setTela('escolha'); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'cadastro-otp-dados' && (
          <div className="flex flex-col gap-4">
            <input type="text" autoComplete="name" placeholder="Seu nome *" value={nome} onChange={e => setNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && avancarCadastroOtp()} className={inp} />
            <input type="email" autoComplete="email" placeholder="Seu email *" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && avancarCadastroOtp()} className={inp} />
            <input type="text" autoComplete="off" inputMode="numeric" placeholder="CPF (opcional)" value={cpf}
              onChange={e => setCpf(formatarCPF(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && avancarCadastroOtp()} className={inp} />
            <input type="tel" autoComplete="tel" inputMode="numeric" placeholder="WhatsApp (opcional)" value={telefone}
              onChange={e => setTelefone(formatarTelefone(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && avancarCadastroOtp()} className={inp} />
            <p className="text-gray-500 text-xs text-center">🔒 {AVISO_VERIFICACAO}</p>
            <button onClick={avancarCadastroOtp} disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Enviando código...' : 'Continuar'}
            </button>
            <button onClick={() => { setTela('cadastro-senha'); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'cadastro-otp-codigo' && (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm -mt-2 mb-2">
              Código enviado para <strong className="text-white">{email}</strong>
            </p>
            <input type="text" inputMode="numeric" placeholder="000000" value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && verificarCadastroOtp()}
              maxLength={6} autoFocus className={`${inp} text-center text-2xl tracking-widest`} />
            <button onClick={verificarCadastroOtp} disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Criando conta...' : 'Verificar e criar conta'}
            </button>
            <button onClick={() => { setTela('cadastro-otp-dados'); setCodigo(''); setErro('') }}
              className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar
            </button>
          </div>
        )}

        {tela === 'login-otp-email' && (
          <div className="flex flex-col gap-4">
            <input type="email" autoComplete="email" placeholder="Seu email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviarCodigoLoginOtp()} className={inp} />
            <button onClick={enviarCodigoLoginOtp} disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
            <button onClick={() => { setTela('login-senha'); setErro('') }} className="text-gray-500 text-sm hover:text-gray-400 transition">
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
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
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
