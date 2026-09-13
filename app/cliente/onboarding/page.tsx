'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'
import {
  soDigitos, validarCPF, formatarCPF, formatarTelefone,
  erroTelefone, checarDuplicidade, MSG_DUPLICADO,
  checarLimiteCadastroIp, registrarCadastroIp, AVISO_VERIFICACAO,
} from '../../lib/validacoes'
import BotaoSair from '../../components/BotaoSair'
import { outroPapel, msgCadastroOutroPapel } from '../../lib/papeis'

export default function ClienteOnboarding() {
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // E-mail da conta logada, só para o "Não é a sua conta? Sair".
  const [emailConta, setEmailConta] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/cliente/login'); return }
      setEmailConta(user.email || '')
    })
  }, [])

  // Única saída desta tela sem concluir o cadastro (mesma armadilha corrigida
  // no onboarding do comerciante em 2026-09-13).
  async function sairDaConta() {
    await supabase.auth.signOut()
    router.push('/cliente/login')
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Informe seu nome!'); return }
    const cpfDigits = soDigitos(cpf)
    if (cpfDigits.length > 0 && !validarCPF(cpf)) { setErro('CPF inválido. Verifique o número digitado.'); return }
    if (telefone && erroTelefone(telefone)) { setErro('Telefone inválido. Use um número válido com DDD.'); return }
    setLoading(true)
    setErro('')
    const { data: { user } } = await supabase.auth.getUser()

    // Conta exclusiva: comerciante/fornecedor/entregador não viram cliente.
    const outro = await outroPapel(supabase, user!.id, 'cliente')
    if (outro) { setErro(msgCadastroOutroPapel(outro)); setLoading(false); return }

    // CPF e telefone não podem se repetir em outra conta do Commerly.
    const dup = await checarDuplicidade({
      ...(cpfDigits.length === 11 ? { cpf } : {}),
      ...(telefone ? { telefone } : {}),
    })
    if (dup.erro) { setErro(dup.erro); setLoading(false); return }
    if (dup.duplicado) { setErro(MSG_DUPLICADO[dup.duplicado]); setLoading(false); return }

    // Anti-spam: limite de contas por dia por IP (só checa; grava após o insert).
    const lim = await checarLimiteCadastroIp('cliente')
    if (!lim.ok) { setErro(lim.erro!); setLoading(false); return }

    const { error } = await supabase.from('clientes').insert({
      user_id: user!.id,
      nome: nome.trim(),
      ...(cpfDigits.length === 11 ? { cpf } : {}),
      ...(telefone ? { telefone } : {}),
    })
    if (error) { setErro('Erro ao salvar. Tente novamente.'); setLoading(false); return }
    await registrarCadastroIp('cliente')
    router.push('/cliente/buscar')
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500'

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm">
        <p className="text-green-400 text-sm font-semibold mb-1">Área do Cliente</p>
        <h1 className="text-2xl font-bold text-white mb-1">Bem-vindo!</h1>
        <p className="text-gray-400 mb-1">Complete seu cadastro</p>
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-gray-500 text-xs">
            Entrando como <span className="text-gray-300 break-all">{emailConta || 'sua conta'}</span>. Não é a sua conta?
          </p>
          <BotaoSair variante="destaque" onClick={sairDaConta} disabled={loading} label="Sair e entrar com outra conta" />
        </div>

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
          <p className="text-gray-500 text-xs text-center">🔒 {AVISO_VERIFICACAO}</p>
          <button onClick={salvar} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? 'Salvando...' : 'Começar a explorar'}
          </button>
        </div>
      </div>
    </main>
  )
}
