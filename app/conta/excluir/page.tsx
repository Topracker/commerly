'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Download, ShieldAlert, CheckCircle2, ArrowLeft } from 'lucide-react'
import { createClient } from '../../supabase'
import {
  type Checagem, type Bloqueio, CARENCIA_DIAS, formatarDataBr, textoBloqueio,
} from '../../lib/exclusaoConta'

// ============================================================================
// /conta/excluir — o fluxo de exclusão, igual para os 4 papéis.
//
// Chega-se aqui de dois jeitos:
//   * pelo card nas configurações (já logado);
//   * pelo link da página pública /excluir-conta (?token_hash=&type=recovery):
//     a página troca o token por sessão em /api/auth/verificar-recovery (o
//     mesmo que /nova-senha usa) e segue.
//
// Passos: pré-checagem (GET) → resolver bloqueios → confirmar digitando o
// e-mail + EXCLUIR (POST) → sessão derrubada → tela final com a data.
// ============================================================================

type Etapa = 'verificando' | 'sem-sessao' | 'carregando' | 'pronto' | 'enviando' | 'feito' | 'erro'

const LOGINS = [
  { href: '/login', label: 'Comerciante' },
  { href: '/cliente/login', label: 'Cliente' },
  { href: '/entregador-delivery/login', label: 'Entregador' },
  { href: '/fornecedor/login', label: 'Fornecedor' },
]

export default function ExcluirContaPage() {
  const supabase = createClient()
  const router = useRouter()
  const verificouRef = useRef(false)

  const [etapa, setEtapa] = useState<Etapa>('verificando')
  const [viaEmail, setViaEmail] = useState(false)
  const [checagem, setChecagem] = useState<(Checagem & { email: string | null; protegida: boolean }) | null>(null)
  const [email, setEmail] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [executaApos, setExecutaApos] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const q = new URLSearchParams(window.location.search)
      const tokenHash = q.get('token_hash')
      if (q.get('via') === 'email') setViaEmail(true)

      // Link da página pública: troca o token por sessão UMA vez (verifyOtp consome).
      if (tokenHash && !verificouRef.current) {
        verificouRef.current = true
        try {
          const res = await fetch('/api/auth/verificar-recovery', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token_hash: tokenHash, type: q.get('type') || 'recovery' }),
          })
          const j = await res.json().catch(() => null)
          if (j?.ok && j?.session) await supabase.auth.setSession(j.session)
        } catch { /* cai na checagem de sessão abaixo */ }
        // Tira o token da URL: recarregar não pode tentar consumir de novo.
        window.history.replaceState(null, '', '/conta/excluir')
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!ativo) return
      if (!session) { setEtapa('sem-sessao'); return }

      setEtapa('carregando')
      const res = await fetch('/api/conta/excluir')
      const j = await res.json().catch(() => null)
      if (!ativo) return
      if (!res.ok || !j) { setErro(j?.error || 'Não foi possível carregar sua conta.'); setEtapa('erro'); return }
      if (j.pendente) { router.replace('/conta/agendada'); return }
      setChecagem(j)
      setBloqueios(j.bloqueios || [])
      setEtapa('pronto')
    })()
    return () => { ativo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirmar() {
    if (!checagem) return
    setErro('')
    setEtapa('enviando')
    const res = await fetch('/api/conta/excluir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, confirmacao, origem: viaEmail ? 'web' : 'app' }),
    })
    const j = await res.json().catch(() => null)
    if (!res.ok) {
      setErro(j?.error || 'Não foi possível concluir. Tente novamente.')
      if (Array.isArray(j?.bloqueios)) setBloqueios(j.bloqueios)
      if (j?.pendente) { router.replace('/conta/agendada'); return }
      setEtapa('pronto')
      return
    }
    setExecutaApos(j.executa_apos)
    // Derruba esta sessão também (as outras caíram no servidor).
    await supabase.auth.signOut({ scope: 'global' }).catch(() => {})
    setEtapa('feito')
  }

  const podeConfirmar =
    !!checagem && !checagem.protegida && bloqueios.length === 0 &&
    email.trim().toLowerCase() === (checagem.email || '').toLowerCase() &&
    confirmacao.trim().toUpperCase() === 'EXCLUIR'

  return (
    <main data-theme="dark" className="min-h-screen bg-gray-950">
      <div className="max-w-lg mx-auto px-4 py-10">
        {etapa !== 'feito' && (
          <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm transition mb-6">
            <ArrowLeft size={15} /> Voltar
          </button>
        )}

        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldAlert size={22} className="text-red-400" /> Excluir minha conta
        </h1>

        {(etapa === 'verificando' || etapa === 'carregando') && (
          <p className="text-gray-500 text-sm mt-6">Carregando sua conta…</p>
        )}

        {etapa === 'sem-sessao' && (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-gray-400 text-sm leading-relaxed">
              {viaEmail
                ? 'Este link expirou ou já foi usado. Peça um novo na página de exclusão ou entre na sua conta.'
                : 'Para excluir a conta, entre primeiro. Escolha a sua área e, depois de entrar, volte a este endereço (ou use Configurações → Excluir minha conta):'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {LOGINS.map(l => (
                <Link key={l.href} href={l.href} className="rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-3 text-center transition">
                  {l.label}
                </Link>
              ))}
            </div>
            <p className="text-gray-500 text-xs">
              Não consegue entrar? <Link href="/excluir-conta" className="text-blue-400 underline">Peça a exclusão por e-mail</Link>.
            </p>
          </div>
        )}

        {etapa === 'erro' && (
          <p className="text-red-400 text-sm mt-6">{erro}</p>
        )}

        {(etapa === 'pronto' || etapa === 'enviando') && checagem && (
          <div className="mt-6 flex flex-col gap-5">
            {checagem.protegida && (
              <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-amber-300 text-sm">
                Esta é uma conta de teste da plataforma e não pode ser excluída por aqui.
              </div>
            )}

            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400 leading-relaxed flex flex-col gap-2">
              <p className="text-white font-semibold">O que acontece</p>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                <li>Sua conta fica <strong className="text-gray-200">desativada agora</strong>: some das buscas, do delivery e das notificações.</li>
                <li>Em <strong className="text-gray-200">{CARENCIA_DIAS} dias</strong> apagamos de vez seu login, nome, documento, telefone, fotos e localização. Até lá, basta entrar de novo e tocar em <em>Reativar</em> para desistir.</li>
                {checagem.avisos?.assinatura_ativa && (
                  <li>Sua <strong className="text-gray-200">assinatura é cancelada na hora</strong>, sem reembolso do período em curso.</li>
                )}
                {checagem.avisos?.ads_ativo && <li>O plano de Ads é cancelado na hora.</li>}
                {checagem.papel === 'cliente' && (checagem.avisos?.pontos_clube ?? 0) > 0 && (
                  <li>Você perde <strong className="text-gray-200">{checagem.avisos!.pontos_clube} pontos</strong> do Clube.</li>
                )}
                {checagem.papel === 'comerciante' && (
                  <li>Produtos, vendas, gastos, fiado, agenda e funcionários da loja são apagados. <strong className="text-gray-200">Baixe uma cópia antes.</strong></li>
                )}
                <li>Ficam apenas registros de pedidos e pagamentos que a lei nos obriga a guardar — sem seu nome, telefone ou endereço (<Link href="/privacidade" className="text-blue-400 underline">Política de Privacidade</Link>).</li>
              </ul>
            </section>

            <a
              href="/api/conta/exportar"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-3 transition"
            >
              <Download size={16} /> Baixar meus dados (JSON)
            </a>

            {bloqueios.length > 0 && (
              <section className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm flex flex-col gap-2">
                <p className="text-amber-300 font-semibold flex items-center gap-1.5"><AlertTriangle size={15} /> Resolva antes de continuar</p>
                <ul className="list-disc pl-5 text-amber-200/90 flex flex-col gap-1">
                  {bloqueios.map(b => <li key={b.codigo}>{textoBloqueio(b, checagem.papel)}</li>)}
                </ul>
              </section>
            )}

            {!checagem.protegida && bloqueios.length === 0 && (
              <section className="rounded-2xl border border-red-900/50 bg-red-950/20 p-4 flex flex-col gap-3">
                <p className="text-red-300 text-sm font-semibold">Confirmar exclusão</p>
                <label className="text-gray-400 text-xs">
                  Digite o e-mail da conta <span className="text-gray-500">({checagem.email})</span>
                  <input
                    value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="off"
                    className="mt-1 w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500"
                  />
                </label>
                <label className="text-gray-400 text-xs">
                  Digite <strong className="text-red-300">EXCLUIR</strong> para confirmar
                  <input
                    value={confirmacao} onChange={e => setConfirmacao(e.target.value)} autoComplete="off"
                    className="mt-1 w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500 uppercase"
                  />
                </label>
                {erro && <p className="text-red-400 text-sm">{erro}</p>}
                <button
                  onClick={confirmar} disabled={!podeConfirmar || etapa === 'enviando'}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition"
                >
                  {etapa === 'enviando' ? 'Processando…' : 'Excluir minha conta'}
                </button>
              </section>
            )}
          </div>
        )}

        {etapa === 'feito' && executaApos && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 flex flex-col gap-2">
              <p className="text-white font-semibold flex items-center gap-2"><CheckCircle2 size={18} className="text-green-400" /> Pedido recebido</p>
              <p className="text-gray-400 text-sm leading-relaxed">
                Sua conta foi desativada e será excluída definitivamente em <strong className="text-gray-200">{formatarDataBr(executaApos)}</strong>.
                Enviamos um e-mail com os detalhes. Se mudar de ideia, entre de novo antes dessa data e toque em <em>Reativar conta</em>.
              </p>
            </div>
            <Link href="/" className="text-center text-blue-400 hover:text-blue-300 text-sm">Ir para a página inicial</Link>
          </div>
        )}
      </div>
    </main>
  )
}
