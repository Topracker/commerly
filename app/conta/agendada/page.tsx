'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, RotateCcw, LogOut } from 'lucide-react'
import { createClient } from '../../supabase'
import { formatarDataBr } from '../../lib/exclusaoConta'

// ============================================================================
// /conta/agendada — a ÚNICA tela que uma conta em carência de exclusão vê
// (proxy.ts redireciona tudo para cá). Reativar desfaz o pedido; Sair mantém.
// Sem sessão o Proxy manda para /login; aqui só tratamos o resto.
// ============================================================================

export default function ContaAgendadaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [executaApos, setExecutaApos] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [reativando, setReativando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    fetch('/api/conta/excluir').then(r => r.json()).then(j => {
      if (!ativo) return
      if (j?.pendente?.executa_apos) setExecutaApos(j.pendente.executa_apos)
      // Nada pendente (já reativou noutra aba, ou entrou aqui por engano): volta.
      else router.replace('/')
    }).catch(() => { if (ativo) setErro('Não foi possível carregar sua conta.') })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function reativar() {
    setErro('')
    setReativando(true)
    const res = await fetch('/api/conta/reativar', { method: 'POST' })
    const j = await res.json().catch(() => null)
    if (!res.ok) { setErro(j?.error || 'Não foi possível reativar agora.'); setReativando(false); return }
    // Navegação completa: useAuth/useCliente só leem o perfil no mount.
    window.location.href = j?.destino || '/'
  }

  async function sair() {
    await supabase.auth.signOut().catch(() => {})
    router.replace('/')
  }

  return (
    <main data-theme="dark" className="min-h-screen bg-gray-950 flex items-center">
      <div className="max-w-md mx-auto px-4 py-10 w-full">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 flex flex-col gap-4">
          <p className="text-white font-semibold text-lg flex items-center gap-2">
            <Clock size={20} className="text-amber-400" /> Conta agendada para exclusão
          </p>
          {carregando ? (
            <p className="text-gray-500 text-sm">Carregando…</p>
          ) : (
            <p className="text-gray-400 text-sm leading-relaxed">
              Você pediu a exclusão desta conta. Ela está desativada e será apagada definitivamente em{' '}
              <strong className="text-gray-200">{executaApos ? formatarDataBr(executaApos) : '—'}</strong>.
              Até lá você pode desistir: é só reativar.
            </p>
          )}
          {erro && <p className="text-red-400 text-sm">{erro}</p>}
          <button
            onClick={reativar} disabled={reativando || carregando}
            className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
          >
            <RotateCcw size={16} /> {reativando ? 'Reativando…' : 'Reativar conta'}
          </button>
          <button
            onClick={sair}
            className="inline-flex items-center justify-center gap-2 border border-gray-700 hover:bg-gray-800 text-gray-300 font-medium py-3 rounded-xl transition"
          >
            <LogOut size={16} /> Sair e manter a exclusão
          </button>
          <p className="text-gray-600 text-xs leading-relaxed">
            Assinaturas canceladas não voltam sozinhas ao reativar. O que fica guardado depois da
            exclusão está na <Link href="/privacidade" className="text-blue-400 underline">Política de Privacidade</Link>.
          </p>
        </div>
      </div>
    </main>
  )
}
