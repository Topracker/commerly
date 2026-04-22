'use client'
import { useState } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

const tipos = ['Barbearia', 'Distribuidora de bebidas', 'Mercado', 'Loja de roupas', 'Lanchonete', 'Salão de beleza', 'Eletrônicos', 'Outro']

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
  const d1 = calc(cnpj, [5,4,3,2,9,8,7,6,5,4,3,2])
  const d2 = calc(cnpj, [6,5,4,3,2,9,8,7,6,5,4,3,2])
  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13])
}

function formatarDocumento(valor: string) {
  const nums = valor.replace(/\D/g, '')
  if (nums.length <= 11) {
    return nums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      .replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')
      .replace(/(\d{3})(\d{3})/, '$1.$2')
      .replace(/(\d{3})/, '$1')
  } else {
    return nums.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
      .replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1.$2.$3/$4')
      .replace(/(\d{2})(\d{3})(\d{3})/, '$1.$2.$3')
      .replace(/(\d{2})(\d{3})/, '$1.$2')
      .replace(/(\d{2})/, '$1')
  }
}

export default function Onboarding() {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [documento, setDocumento] = useState('')
  const [localizacao, setLocalizacao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [horario, setHorario] = useState('')
  const [erroDoc, setErroDoc] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  function handleDocumento(valor: string) {
    const formatado = formatarDocumento(valor)
    setDocumento(formatado)
    const nums = valor.replace(/\D/g, '')
    if (nums.length === 11) {
      setErroDoc(validarCPF(nums) ? '' : 'CPF inválido!')
    } else if (nums.length === 14) {
      setErroDoc(validarCNPJ(nums) ? '' : 'CNPJ inválido!')
    } else {
      setErroDoc('')
    }
  }

  async function salvar() {
    if (!nome || !tipo) return alert('Preencha o nome e tipo da loja!')
    const nums = documento.replace(/\D/g, '')
    if (!nums) return alert('Informe seu CPF ou CNPJ!')
    if (nums.length === 11 && !validarCPF(nums)) return alert('CPF inválido!')
    if (nums.length === 14 && !validarCNPJ(nums)) return alert('CNPJ inválido!')
    if (nums.length !== 11 && nums.length !== 14) return alert('Informe um CPF ou CNPJ válido!')

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('lojas').insert({
      user_id: user?.id,
      nome, tipo, documento, localizacao, telefone, instagram, horario
    })
    if (error) {
      if (error.code === '23505') {
        alert('Este CPF/CNPJ já está cadastrado no Commerly!')
      } else {
        alert('Erro ao salvar!')
      }
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

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
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tipo de comércio *</option>
            {tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <div>
            <input
              placeholder="CPF ou CNPJ *"
              value={documento}
              onChange={e => handleDocumento(e.target.value)}
              maxLength={18}
              className={`w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 ${erroDoc ? 'focus:ring-red-500 ring-2 ring-red-500' : 'focus:ring-blue-500'}`}
            />
            {erroDoc && <p className="text-red-400 text-sm mt-1">{erroDoc}</p>}
          </div>

          <input
            placeholder="Localização"
            value={localizacao}
            onChange={e => setLocalizacao(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            placeholder="Telefone"
            value={telefone}
            onChange={e => setTelefone(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            placeholder="Instagram (ex: @minha_loja)"
            value={instagram}
            onChange={e => setInstagram(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            placeholder="Horário de funcionamento"
            value={horario}
            onChange={e => setHorario(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={salvar}
            disabled={loading || !!erroDoc}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition mt-2"
          >
            {loading ? 'Salvando...' : 'Começar a usar o Commerly'}
          </button>
        </div>
      </div>
    </main>
  )
}