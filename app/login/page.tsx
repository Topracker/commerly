'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

type Tela = 'escolha' | 'cadastro' | 'cadastro-otp' | 'login-email' | 'login-otp'

const TIPOS = [
  'Açougue', 'Barbearia', 'Delivery', 'Distribuidora de bebidas',
  'Eletrônicos', 'Farmácia', 'Hamburgueria', 'Hortifruti',
  'Lanchonete', 'Loja de roupas', 'Mercadinho', 'Mercado',
  'Padaria', 'Pet Shop', 'Pizzaria', 'Restaurante',
  'Salão de Beleza', 'Sorveteria', 'Outro',
]

const HORAS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

function validarCPF(cpf: string) {
  cpf = cpf.replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  return resto === parseInt(cpf[10])
}

function validarCNPJ(cnpj: string) {
  cnpj = cnpj.replace(/\D/g, '')
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false
  const calc = (c: string, arr: number[]) => {
    let soma = 0
    for (let i = 0; i < arr.length; i++) soma += parseInt(c[i]) * arr[i]
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const d1 = calc(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13])
}

function formatarDocumento(valor: string) {
  const nums = valor.replace(/\D/g, '')
  if (nums.length <= 11) {
    return nums
      .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      .replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')
      .replace(/(\d{3})(\d{3})/, '$1.$2')
  } else {
    return nums
      .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
      .replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1.$2.$3/$4')
      .replace(/(\d{2})(\d{3})(\d{3})/, '$1.$2.$3')
      .replace(/(\d{2})(\d{3})/, '$1.$2')
  }
}

function formatarTelefone(valor: string): string {
  const nums = valor.replace(/\D/g, '').slice(0, 11)
  if (nums.length <= 2) return nums ? `(${nums}` : ''
  if (nums.length <= 6) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`
  if (nums.length <= 10) return `(${nums.slice(0, 2)}) ${nums.slice(2, 6)}-${nums.slice(6)}`
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`
}

function erroTelefone(valor: string): string {
  const nums = valor.replace(/\D/g, '')
  if (!nums) return ''
  const ddd = parseInt(nums.slice(0, 2))
  if (ddd < 11 || ddd > 99) return 'DDD inválido'
  if (nums.length < 10 || nums.length > 11) return 'Número incompleto'
  return ''
}

function erroInstagram(valor: string): string {
  if (!valor) return ''
  if (!/^@[\w.]{1,30}$/.test(valor)) return 'Use o formato @usuario'
  return ''
}

function formatarCEP(valor: string): string {
  const nums = valor.replace(/\D/g, '').slice(0, 8)
  if (nums.length <= 5) return nums
  return `${nums.slice(0, 5)}-${nums.slice(5)}`
}

export default function Login() {
  const [tela, setTela] = useState<Tela>('escolha')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [documento, setDocumento] = useState('')
  const [cep, setCep] = useState('')
  const [localizacao, setLocalizacao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [horarioAbertura, setHorarioAbertura] = useState('08:00')
  const [horarioFechamento, setHorarioFechamento] = useState('18:00')
  const [erroCEP, setErroCEP] = useState('')
  const [cepCarregando, setCepCarregando] = useState(false)
  const [erroDoc, setErroDoc] = useState('')
  const [erroTel, setErroTel] = useState('')
  const [erroIG, setErroIG] = useState('')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/dashboard')
    })
  }, [])

  function handleDocumento(valor: string) {
    setDocumento(formatarDocumento(valor))
    const nums = valor.replace(/\D/g, '')
    if (nums.length === 11) setErroDoc(validarCPF(nums) ? '' : 'CPF inválido')
    else if (nums.length === 14) setErroDoc(validarCNPJ(nums) ? '' : 'CNPJ inválido')
    else setErroDoc('')
  }

  function handleTelefone(valor: string) {
    const f = formatarTelefone(valor)
    setTelefone(f)
    setErroTel(erroTelefone(f))
  }

  function handleInstagram(valor: string) {
    setInstagram(valor)
    setErroIG(erroInstagram(valor))
  }

  async function handleCEP(valor: string) {
    const f = formatarCEP(valor)
    setCep(f)
    const nums = f.replace(/\D/g, '')
    if (nums.length < 8) { setErroCEP(''); return }
    setCepCarregando(true)
    setErroCEP('')
    try {
      const res = await fetch(`https://viacep.com.br/ws/${nums}/json/`)
      const data = await res.json()
      if (data.erro) {
        setErroCEP('CEP não encontrado')
      } else {
        setLocalizacao([data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(', '))
      }
    } catch {
      setErroCEP('Erro ao consultar CEP')
    }
    setCepCarregando(false)
  }

  async function avancarCadastro() {
    if (!nome || !tipo) { setErro('Preencha o nome e tipo da loja!'); return }
    const nums = documento.replace(/\D/g, '')
    if (!nums) { setErro('Informe seu CPF ou CNPJ!'); return }
    if (nums.length === 11 && !validarCPF(nums)) { setErro('CPF inválido!'); return }
    if (nums.length === 14 && !validarCNPJ(nums)) { setErro('CNPJ inválido!'); return }
    if (nums.length !== 11 && nums.length !== 14) { setErro('Informe um CPF ou CNPJ válido!'); return }
    if (telefone && erroTelefone(telefone)) { setErro('Telefone inválido!'); return }
    if (instagram && erroInstagram(instagram)) { setErro('Formato de Instagram inválido!'); return }
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

    const [{ data: clienteExiste }, { data: fornecedorExiste }] = await Promise.all([
      supabase.from('clientes').select('id').eq('user_id', user!.id).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', user!.id).maybeSingle(),
    ])
    if (clienteExiste) { setErro('Este e-mail já está cadastrado como cliente. Faça login para acessar sua conta.'); setLoading(false); return }
    if (fornecedorExiste) { setErro('Este e-mail já está cadastrado como fornecedor. Faça login para acessar sua conta.'); setLoading(false); return }

    const { data: lojaExiste } = await supabase.from('lojas').select('id').eq('user_id', user!.id).maybeSingle()
    if (lojaExiste) { router.push('/dashboard'); return }

    const trialExpira = new Date()
    trialExpira.setDate(trialExpira.getDate() + 30)
    const { error: insertError } = await supabase.from('lojas').insert({
      user_id: user!.id, nome, tipo, documento, localizacao, telefone, instagram,
      horario: `${horarioAbertura} - ${horarioFechamento}`,
      trial_expira_em: trialExpira.toISOString(),
    })
    if (insertError) {
      if (insertError.code === '23505') setErro('Este CPF/CNPJ já está cadastrado no Commerly!')
      else setErro('Erro ao criar conta. Tente novamente.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
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
    const { data } = await supabase.from('lojas').select('id').eq('user_id', user!.id).maybeSingle()
    router.push(data ? '/dashboard' : '/onboarding')
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
        <p className="text-blue-400 text-sm font-semibold mb-1">Área do Comerciante</p>
        <h1 className="text-2xl font-bold text-white mb-6">Commerly</h1>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {tela === 'escolha' && (
          <div className="flex flex-col gap-3">
            <button onClick={() => { setTela('cadastro'); setErro('') }}
              className="bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl transition text-left px-5">
              <p className="font-bold">Criar conta</p>
              <p className="text-blue-200 text-sm">Cadastre sua loja no Commerly</p>
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
            <p className="text-gray-400 text-sm -mt-2 mb-1">Preencha os dados da sua loja</p>

            <input placeholder="Nome da loja *" value={nome} onChange={e => setNome(e.target.value)} className={inp} />

            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inp}>
              <option value="">Tipo de comércio *</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <div>
              <input placeholder="CPF ou CNPJ *" value={documento} onChange={e => handleDocumento(e.target.value)}
                maxLength={18} className={`w-full ${inp} ${erroDoc ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`} />
              {erroDoc && <p className="text-red-400 text-sm mt-1">{erroDoc}</p>}
            </div>

            <div>
              <div className="relative flex items-center">
                <input placeholder="CEP (ex: 01310-100)" value={cep} onChange={e => handleCEP(e.target.value)}
                  maxLength={9} className={`w-full ${inp} ${erroCEP ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`} />
                {cepCarregando && <span className="absolute right-3 text-gray-400 text-xs">buscando...</span>}
              </div>
              {erroCEP && <p className="text-red-400 text-sm mt-1">{erroCEP}</p>}
            </div>

            <input placeholder="Complemento (ex: Rua das Flores, 123)" value={localizacao}
              onChange={e => setLocalizacao(e.target.value)} className={inp} />

            <div>
              <input placeholder="Telefone (ex: (11) 98765-4321)" value={telefone}
                onChange={e => handleTelefone(e.target.value)}
                className={`w-full ${inp} ${erroTel ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`} />
              {erroTel && <p className="text-red-400 text-sm mt-1">{erroTel}</p>}
            </div>

            <div>
              <input placeholder="Instagram (ex: @minha_loja)" value={instagram}
                onChange={e => handleInstagram(e.target.value)}
                className={`w-full ${inp} ${erroIG ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`} />
              {erroIG && <p className="text-red-400 text-sm mt-1">{erroIG}</p>}
            </div>

            <div>
              <p className="text-gray-400 text-xs mb-2">Horário de funcionamento</p>
              <div className="flex items-center gap-3">
                <select value={horarioAbertura} onChange={e => setHorarioAbertura(e.target.value)} className={`flex-1 ${inp}`}>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="text-gray-500 text-sm shrink-0">até</span>
                <select value={horarioFechamento} onChange={e => setHorarioFechamento(e.target.value)} className={`flex-1 ${inp}`}>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <input type="email" placeholder="Seu email *" value={email} onChange={e => setEmail(e.target.value)} className={inp} />

            <button onClick={avancarCadastro}
              disabled={loading || !!erroDoc || !!erroTel || !!erroIG || !!erroCEP || cepCarregando}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition mt-2">
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
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
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
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
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
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
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
