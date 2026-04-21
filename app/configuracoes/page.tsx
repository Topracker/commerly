'use client'
import { useState, useEffect } from 'react'
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

export default function Configuracoes() {
  const [loja, setLoja] = useState<any>(null)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [documento, setDocumento] = useState('')
  const [localizacao, setLocalizacao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [horario, setHorario] = useState('')
  const [erroDoc, setErroDoc] = useState('')
  const [loading, setLoading] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: lojaData } = await supabase.from('lojas').select('*').eq('user_id', user.id).single()
    if (!lojaData) { router.push('/onboarding'); return }
    setLoja(lojaData)
    setNome(lojaData.nome)
    setTipo(lojaData.tipo)
    setDocumento(lojaData.documento || '')
    setLocalizacao(lojaData.localizacao || '')
    setTelefone(lojaData.telefone || '')
    setInstagram(lojaData.instagram || '')
    setHorario(lojaData.horario || '')
  }

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
    if (!nome || !tipo) return alert('Nome e tipo são obrigatórios!')
    const nums = documento.replace(/\D/g, '')
    if (nums.length === 11 && !validarCPF(nums)) return alert('CPF inválido!')
    if (nums.length === 14 && !validarCNPJ(nums)) return alert('CNPJ inválido!')
    setLoading(true)
    await supabase.from('lojas').update({ nome, tipo, documento, localizacao, telefone, instagram, horario }).eq('id', loja.id)
    setLoading(false)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 3000)
  }

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm mb-4 hover:text-white">← Dashboard</button>
        <h1 className="text-3xl font-bold text-white mb-6">Configurações</h1>

        <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
          <input placeholder="Nome da loja *" value={nome} onChange={e => setNome(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>

          <select value={tipo} onChange={e => setTipo(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500">
            {tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <div>
            <input
              placeholder="CPF ou CNPJ"
              value={documento}
              onChange={e => handleDocumento(e.target.value)}
              maxLength={18}
              className={`w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 ${erroDoc ? 'focus:ring-red-500 ring-2 ring-red-500' : 'focus:ring-blue-500'}`}
            />
            {erroDoc && <p className="text-red-400 text-sm mt-1">{erroDoc}</p>}
          </div>

          <input placeholder="Localização" value={localizacao} onChange={e => setLocalizacao(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>
          <input placeholder="Telefone" value={telefone} onChange={e => setTelefone(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>
          <input placeholder="Instagram (ex: @minha_loja)" value={instagram} onChange={e => setInstagram(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>
          <input placeholder="Horário de funcionamento" value={horario} onChange={e => setHorario(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>

          <button onClick={salvar} disabled={loading || !!erroDoc} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
            {loading ? 'Salvando...' : salvo ? '✓ Salvo!' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </main>
  )
}