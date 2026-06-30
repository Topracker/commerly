'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'
import {
  soDigitos, validarCPF, formatarCPF, formatarTelefone,
  erroTelefone, checarDuplicidade, MSG_DUPLICADO,
} from '../../lib/validacoes'

export default function ClienteOnboarding() {
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/cliente/login')
    })
  }, [])

  async function salvar() {
    if (!nome.trim()) { setErro('Informe seu nome!'); return }
    const cpfDigits = soDigitos(cpf)
    if (cpfDigits.length > 0 && !validarCPF(cpf)) { setErro('CPF inválido. Verifique o número digitado.'); return }
    if (telefone && erroTelefone(telefone)) { setErro('Telefone inválido. Use um número válido com DDD.'); return }
    setLoading(true)
    setErro('')
    const { data: { user } } = await supabase.auth.getUser()

    const [{ data: lojaExiste }, { data: fornecedorExiste }] = await Promise.all([
      supabase.from('lojas').select('id').eq('user_id', user!.id).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', user!.id).maybeSingle(),
    ])
    if (lojaExiste) { setErro('Este e-mail já está cadastrado como comerciante. Faça login para acessar sua conta.'); setLoading(false); return }
    if (fornecedorExiste) { setErro('Este e-mail já está cadastrado como fornecedor. Faça login para acessar sua conta.'); setLoading(false); return }

    // CPF e telefone não podem se repetir em outra conta do Commerly.
    const dup = await checarDuplicidade({
      ...(cpfDigits.length === 11 ? { cpf } : {}),
      ...(telefone ? { telefone } : {}),
    })
    if (dup.erro) { setErro(dup.erro); setLoading(false); return }
    if (dup.duplicado) { setErro(MSG_DUPLICADO[dup.duplicado]); setLoading(false); return }

    const { error } = await supabase.from('clientes').insert({
      user_id: user!.id,
      nome: nome.trim(),
      ...(cpfDigits.length === 11 ? { cpf } : {}),
      ...(telefone ? { telefone } : {}),
    })
    if (error) { setErro('Erro ao salvar. Tente novamente.'); setLoading(false); return }
    router.push('/cliente/buscar')
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500'

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm">
        <p className="text-green-400 text-sm font-semibold mb-1">Área do Cliente</p>
        <h1 className="text-2xl font-bold text-white mb-1">Bem-vindo!</h1>
        <p className="text-gray-400 mb-6">Complete seu cadastro</p>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        <div className="flex flex-col gap-4">
          <input
            type="text"
            autoComplete="name"
            placeholder="Seu nome *"
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && salvar()}
            className={inp}
          />
          <input
            type="text"
            autoComplete="off"
            inputMode="numeric"
            placeholder="CPF (opcional)"
            value={cpf}
            onChange={e => setCpf(formatarCPF(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && salvar()}
            className={inp}
          />
          <input
            type="tel"
            autoComplete="tel"
            inputMode="numeric"
            placeholder="WhatsApp (opcional)"
            value={telefone}
            onChange={e => setTelefone(formatarTelefone(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && salvar()}
            className={inp}
          />
          <button onClick={salvar} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? 'Salvando...' : 'Começar a explorar'}
          </button>
        </div>
      </div>
    </main>
  )
}
