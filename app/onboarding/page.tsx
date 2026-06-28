'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'
import { salvarNichoCustom } from '../lib/nicheStore'
import { MODULOS, type ModuloKey } from '../lib/nichos'

// Módulos que a IA pode sugerir / o usuário pode escolher no fluxo "Outro".
const MODULOS_ESCOLHIVEIS: ModuloKey[] = ['agenda', 'servicos', 'pedidos', 'estoque', 'produtos', 'vendas', 'fornecedores']

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

export default function Onboarding() {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [documento, setDocumento] = useState('')
  const [localizacao, setLocalizacao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [horarioAbertura, setHorarioAbertura] = useState('08:00')
  const [horarioFechamento, setHorarioFechamento] = useState('18:00')

  const [cep, setCep] = useState('')
  const [erroCEP, setErroCEP] = useState('')
  const [cepCarregando, setCepCarregando] = useState(false)

  const [erroDoc, setErroDoc] = useState('')
  const [erroTel, setErroTel] = useState('')
  const [erroIG, setErroIG] = useState('')
  const [loading, setLoading] = useState(false)

  // Fluxo de IA para tipo "Outro"
  const [iaDescricao, setIaDescricao] = useState('')
  const [iaLoading, setIaLoading] = useState(false)
  const [iaErro, setIaErro] = useState('')
  const [iaResumo, setIaResumo] = useState('')
  const [tipoCustom, setTipoCustom] = useState('')
  const [modulosSel, setModulosSel] = useState<ModuloKey[]>([])

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.from('lojas').select('id').eq('user_id', user.id).maybeSingle().then(({ data }) => {
        if (data) router.push('/dashboard')
      })
    })
  }, [])

  function handleDocumento(valor: string) {
    const formatado = formatarDocumento(valor)
    setDocumento(formatado)
    const nums = valor.replace(/\D/g, '')
    if (nums.length === 11) setErroDoc(validarCPF(nums) ? '' : 'CPF inválido')
    else if (nums.length === 14) setErroDoc(validarCNPJ(nums) ? '' : 'CNPJ inválido')
    else setErroDoc('')
  }

  function handleTelefone(valor: string) {
    const formatado = formatarTelefone(valor)
    setTelefone(formatado)
    setErroTel(erroTelefone(formatado))
  }

  function handleInstagram(valor: string) {
    setInstagram(valor)
    setErroIG(erroInstagram(valor))
  }

  async function handleCEP(valor: string) {
    const formatado = formatarCEP(valor)
    setCep(formatado)
    const nums = formatado.replace(/\D/g, '')
    if (nums.length < 8) { setErroCEP(''); return }
    setCepCarregando(true)
    setErroCEP('')
    try {
      const res = await fetch(`https://viacep.com.br/ws/${nums}/json/`)
      const data = await res.json()
      if (data.erro) {
        setErroCEP('CEP não encontrado')
      } else {
        const partes = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean)
        setLocalizacao(partes.join(', '))
      }
    } catch {
      setErroCEP('Erro ao consultar CEP')
    }
    setCepCarregando(false)
  }

  async function consultarIA() {
    if (!iaDescricao.trim()) { setIaErro('Conta um pouco sobre o seu negócio.'); return }
    setIaLoading(true); setIaErro('')
    try {
      const res = await fetch('/api/onboarding-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: iaDescricao }),
      })
      const data = await res.json()
      if (!res.ok) { setIaErro(data.erro || 'Erro ao consultar a IA.'); setIaLoading(false); return }
      setIaResumo(data.resumo || '')
      if (data.tipoSugerido) setTipoCustom(data.tipoSugerido)
      setModulosSel(((data.modulos || []) as string[]).filter(k => MODULOS_ESCOLHIVEIS.includes(k as ModuloKey)) as ModuloKey[])
    } catch {
      setIaErro('Erro de rede. Tente novamente.')
    }
    setIaLoading(false)
  }

  function toggleModulo(k: ModuloKey) {
    setModulosSel(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
  }

  async function salvar() {
    if (!nome || !tipo) return alert('Preencha o nome e tipo da loja!')
    const nums = documento.replace(/\D/g, '')
    if (!nums) return alert('Informe seu CPF ou CNPJ!')
    if (nums.length === 11 && !validarCPF(nums)) return alert('CPF inválido!')
    if (nums.length === 14 && !validarCNPJ(nums)) return alert('CNPJ inválido!')
    if (nums.length !== 11 && nums.length !== 14) return alert('Informe um CPF ou CNPJ válido!')
    if (telefone && erroTelefone(telefone)) return alert('Telefone inválido!')
    if (instagram && erroInstagram(instagram)) return alert('Formato de Instagram inválido!')

    const horario = horarioAbertura && horarioFechamento
      ? `${horarioAbertura} - ${horarioFechamento}`
      : ''

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const [{ data: clienteExiste }, { data: fornecedorExiste }] = await Promise.all([
      supabase.from('clientes').select('id').eq('user_id', user!.id).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', user!.id).maybeSingle(),
    ])
    if (clienteExiste) { alert('Este e-mail já está cadastrado como cliente. Faça login para acessar sua conta.'); setLoading(false); return }
    if (fornecedorExiste) { alert('Este e-mail já está cadastrado como fornecedor. Faça login para acessar sua conta.'); setLoading(false); return }

    // Para "Outro", usa o ramo sugerido pela IA (se houver) como tipo da loja.
    const tipoFinal = tipo === 'Outro' && tipoCustom.trim() ? tipoCustom.trim() : tipo

    const { data: lojaInserida, error } = await supabase.from('lojas').insert({
      user_id: user?.id,
      nome, tipo: tipoFinal, documento, localizacao, telefone, instagram, horario,
      plano: 'inativo',
    }).select('id').single()
    if (error) {
      if (error.code === '23505') alert('Este CPF/CNPJ já está cadastrado no Commerly!')
      else alert('Erro ao salvar!')
      setLoading(false)
      return
    }

    // Tipo custom ("Outro"): guarda os módulos sugeridos/escolhidos pra
    // personalizar o painel e a sidebar do comerciante.
    if (tipo === 'Outro' && lojaInserida?.id) {
      salvarNichoCustom(lojaInserida.id, {
        tipo: tipoFinal,
        descricao: iaDescricao.trim(),
        modulos: modulosSel,
      })
    }

    router.push('/planos')
  }

  const inputClass = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'
  const selectClass = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-1">Cadastro da loja</h1>
        <p className="text-gray-400 mb-6">Conta pra gente sobre o seu negócio</p>

        <div className="flex flex-col gap-4">
          <input
            placeholder="Nome da loja *"
            value={nome}
            onChange={e => setNome(e.target.value)}
            className={inputClass}
          />

          <select value={tipo} onChange={e => setTipo(e.target.value)} className={selectClass}>
            <option value="">Tipo de comércio *</option>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* IA de onboarding — aparece quando o comerciante escolhe "Outro" */}
          {tipo === 'Outro' && (
            <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <p className="text-white font-semibold text-sm">Vamos montar seu painel</p>
              </div>
              <p className="text-gray-400 text-xs">
                Conta com suas palavras o que o seu negócio faz, que eu sugiro os módulos certos pro seu dashboard.
              </p>
              <textarea
                value={iaDescricao}
                onChange={e => setIaDescricao(e.target.value)}
                placeholder="Ex: Tenho uma floricultura, vendo flores e arranjos e faço entregas..."
                rows={3}
                maxLength={1000}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
              />
              <button
                type="button"
                onClick={consultarIA}
                disabled={iaLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition text-sm"
              >
                {iaLoading ? 'Pensando...' : iaResumo ? 'Gerar de novo' : 'Sugerir módulos'}
              </button>
              {iaErro && <p className="text-red-400 text-sm">{iaErro}</p>}

              {iaResumo && (
                <div className="flex flex-col gap-3 border-t border-gray-800 pt-3">
                  <p className="text-gray-300 text-sm">{iaResumo}</p>
                  {tipoCustom && (
                    <div>
                      <label className="text-gray-500 text-xs">Ramo identificado</label>
                      <input
                        value={tipoCustom}
                        onChange={e => setTipoCustom(e.target.value)}
                        maxLength={30}
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm mt-1"
                      />
                    </div>
                  )}
                  <div>
                    <p className="text-gray-500 text-xs mb-2">Módulos do seu painel (toque pra ativar/desativar)</p>
                    <div className="flex flex-wrap gap-2">
                      {MODULOS_ESCOLHIVEIS.map(k => {
                        const ativo = modulosSel.includes(k)
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => toggleModulo(k)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                              ativo
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                            }`}
                          >
                            {MODULOS[k].emoji} {MODULOS[k].label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CPF / CNPJ */}
          <div>
            <input
              placeholder="CPF ou CNPJ *"
              value={documento}
              onChange={e => handleDocumento(e.target.value)}
              maxLength={18}
              className={`w-full ${inputClass} ${erroDoc ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
            />
            {erroDoc && <p className="text-red-400 text-sm mt-1">{erroDoc}</p>}
          </div>

          {/* CEP */}
          <div>
            <div className="relative flex items-center">
              <input
                placeholder="CEP (ex: 01310-100)"
                value={cep}
                onChange={e => handleCEP(e.target.value)}
                maxLength={9}
                className={`w-full ${inputClass} ${erroCEP ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
              />
              {cepCarregando && (
                <span className="absolute right-3 text-gray-400 text-xs">buscando...</span>
              )}
            </div>
            {erroCEP && <p className="text-red-400 text-sm mt-1">{erroCEP}</p>}
          </div>

          <input
            placeholder="Complemento (ex: Rua das Flores, 123)"
            value={localizacao}
            onChange={e => setLocalizacao(e.target.value)}
            className={inputClass}
          />

          {/* Telefone */}
          <div>
            <input
              placeholder="Telefone (ex: (11) 98765-4321)"
              value={telefone}
              onChange={e => handleTelefone(e.target.value)}
              className={`w-full ${inputClass} ${erroTel ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
            />
            {erroTel && <p className="text-red-400 text-sm mt-1">{erroTel}</p>}
          </div>

          {/* Instagram */}
          <div>
            <input
              placeholder="Instagram (ex: @minha_loja)"
              value={instagram}
              onChange={e => handleInstagram(e.target.value)}
              className={`w-full ${inputClass} ${erroIG ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
            />
            {erroIG && <p className="text-red-400 text-sm mt-1">{erroIG}</p>}
          </div>

          {/* Horário de funcionamento */}
          <div>
            <p className="text-gray-400 text-xs mb-2">Horário de funcionamento</p>
            <div className="flex items-center gap-3">
              <select value={horarioAbertura} onChange={e => setHorarioAbertura(e.target.value)} className={`flex-1 ${selectClass}`}>
                {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="text-gray-500 text-sm shrink-0">até</span>
              <select value={horarioFechamento} onChange={e => setHorarioFechamento(e.target.value)} className={`flex-1 ${selectClass}`}>
                {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={salvar}
            disabled={loading || !!erroDoc || !!erroTel || !!erroIG || !!erroCEP || cepCarregando}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition mt-2"
          >
            {loading ? 'Salvando...' : 'Começar a usar o Commerly'}
          </button>
        </div>
      </div>
    </main>
  )
}
