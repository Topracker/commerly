'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ShieldCheck, Users, Store, Bike, Package, MapPin, DollarSign, Loader2, Check, X,
  TrendingUp, Award, Handshake, CreditCard, MessageSquare, AlertTriangle, Wallet, Banknote,
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FEATURE_FLAGS } from '../lib/crescimento'
import { ADMIN_API_BASE } from '../lib/adminIdentidade'

type Dados = any
const TABS = ['Visão geral', 'Faturamento', 'Acertos', 'Usuários', 'Feedback', 'Aprovações', 'Cidades & Flags'] as const

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Admin() {
  const [dados, setDados] = useState<Dados>(null)
  const [erro, setErro] = useState<number | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Visão geral')

  async function carregar() {
    const r = await fetch(`${ADMIN_API_BASE}/dados`)
    if (!r.ok) { setErro(r.status); return }
    setDados(await r.json())
  }
  useEffect(() => { carregar() }, [])

  if (erro) return (
    <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center px-6 text-center">
      <div>
        <ShieldCheck size={28} className="text-gray-500 mx-auto mb-3" />
        <p className="text-white font-semibold mb-1">Acesso restrito</p>
        <p className="text-gray-400 text-sm mb-4">Esta área é exclusiva do administrador da Commerly.</p>
        <Link href="/" className="text-acento text-sm">Voltar ao início</Link>
      </div>
    </main>
  )
  if (!dados) return <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center"><Loader2 className="animate-spin text-acento" /></main>

  const c = dados.contadores
  const cresc = dados.crescimento.dias.map((d: string, i: number) => ({
    dia: d.slice(5), lojas: dados.crescimento.lojas[i], clientes: dados.crescimento.clientes[i], entregadores: dados.crescimento.entregadores[i],
  }))

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
          <span className="text-white font-bold flex items-center gap-2"><ShieldCheck size={18} className="text-acento" /> Commerly · Admin</span>
          <Link href="/" className="ml-auto text-gray-400 hover:text-white text-sm">Sair</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${tab === t ? 'bg-acento text-white' : 'text-gray-400 hover:text-white'}`}>{t}</button>
          ))}
        </div>

        {tab === 'Visão geral' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={Store} label="Comerciantes" v={c.comerciantes} />
              <Kpi icon={Users} label="Clientes" v={c.clientes} />
              <Kpi icon={Bike} label="Entregadores" v={c.entregadores} />
              <Kpi icon={Package} label="Pedidos" v={c.pedidos} />
              {/* GMV é o dinheiro que passou pelas LOJAS — não é nosso. O nome
                  antigo ("Receita movimentada") confundia os dois. */}
              <Kpi icon={DollarSign} label="GMV do ecossistema" v={brl(c.gmv)} dica="Total transacionado pelas lojas (pedidos + vendas). Não é receita da Commerly." />
              <Kpi icon={Award} label="Fundadores" v={c.fundadores} />
              <Kpi icon={Handshake} label="Parceiros" v={c.parceiros} />
              <Kpi icon={MapPin} label="Cidades" v={c.cidades} />
            </div>

            {/* Planos: a saúde da base num relance. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={Check} label="Assinantes" v={dados.planos.ativas} />
              <Kpi icon={Loader2} label="Em teste" v={dados.planos.teste} />
              <Kpi icon={AlertTriangle} label="Teste vence em 7d" v={dados.planos.testeVencendo7} />
              <Kpi icon={X} label="Vencidas" v={dados.planos.vencidas} />
            </div>

            <Funil funil={dados.funil} />

            <div className="bg-card border border-borda rounded-2xl p-5">
              <p className="text-white text-sm font-semibold mb-3 flex items-center gap-1.5"><Package size={15} className="text-acento" /> Pedidos e GMV por dia (30 dias)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dados.serie.map((s: any) => ({ ...s, dia: s.dia.slice(5) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="dia" stroke="#9ca3af" fontSize={11} />
                  <YAxis yAxisId="l" stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                  <YAxis yAxisId="r" orientation="right" stroke="#9ca3af" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#111418', border: '1px solid #ffffff20', borderRadius: 12 }} />
                  <Line yAxisId="l" type="monotone" dataKey="pedidos" stroke="#60a5fa" strokeWidth={2} dot={false} name="Pedidos" />
                  <Line yAxisId="r" type="monotone" dataKey="gmv" stroke="#f5c34b" strokeWidth={2} dot={false} name="GMV (R$)" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-borda rounded-2xl p-5">
              <p className="text-white text-sm font-semibold mb-3 flex items-center gap-1.5"><TrendingUp size={15} className="text-acento" /> Crescimento (14 dias)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={cresc}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="dia" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#111418', border: '1px solid #ffffff20', borderRadius: 12 }} />
                  <Line type="monotone" dataKey="lojas" stroke="#f5c34b" strokeWidth={2} dot={false} name="Comerciantes" />
                  <Line type="monotone" dataKey="clientes" stroke="#60a5fa" strokeWidth={2} dot={false} name="Clientes" />
                  <Line type="monotone" dataKey="entregadores" stroke="#34d399" strokeWidth={2} dot={false} name="Entregadores" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Agrupado por cidade_slug. Antes era por `localizacao` (endereço
                livre), então cada loja virava uma "cidade" com nome de rua. */}
            <div className="bg-card border border-borda rounded-2xl p-5">
              <p className="text-white text-sm font-semibold mb-3 flex items-center gap-1.5"><MapPin size={15} className="text-acento" /> GMV por cidade</p>
              {dados.cidadesResumo.length === 0 ? <p className="text-gray-500 text-sm">Sem dados ainda.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(120, dados.cidadesResumo.length * 30)}>
                  <BarChart data={dados.cidadesResumo} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                    <YAxis type="category" dataKey="cidade" stroke="#9ca3af" fontSize={11} width={130} />
                    <Tooltip contentStyle={{ background: '#111418', border: '1px solid #ffffff20', borderRadius: 12 }} formatter={(v: any) => brl(Number(v))} />
                    <Bar dataKey="gmv" fill="#f5c34b" radius={[0, 4, 4, 0]} name="GMV" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {dados.cidadesResumo.length > 0 && (
              <Tabela
                titulo="Por cidade"
                cols={['Cidade', 'Lojas', 'Pedidos', 'GMV']}
                linhas={dados.cidadesResumo.map((x: any) => [x.cidade, String(x.lojas), String(x.pedidos), brl(x.gmv)])}
              />
            )}
          </div>
        )}

        {tab === 'Usuários' && (
          <div className="space-y-6">
            <Tabela titulo="Comerciantes" cols={['Nome', 'Nicho', 'Cidade', 'Plano', 'Fundador']} linhas={(dados.listas.lojas || []).map((l: any) => [l.nome, l.tipo, l.localizacao || '—', l.plano || '—', l.fundador ? '⭐' : '—'])} />
            <Tabela titulo="Entregadores" cols={['Nome', 'Telefone', 'Aprovação', 'Kit']} linhas={(dados.listas.entregadores || []).map((e: any) => [e.nome, e.telefone || '—', e.aprovacao_status, e.kit_comprado ? '✅' : '—'])} />
            <Tabela titulo="Clientes" cols={['Nome', 'Desde']} linhas={(dados.listas.clientes || []).map((x: any) => [x.nome, String(x.created_at).slice(0, 10)])} />
            <Tabela titulo="Parceiros" cols={['Nome', 'E-mail', 'Código', 'Nível']} linhas={(dados.listas.parceiros || []).map((p: any) => [p.nome, p.email || '—', p.codigo, p.nivel || '—'])} />
            <Tabela titulo="Top embaixadores" cols={['Código', 'Papel', 'Indicações']} linhas={(dados.listas.embaixadores || []).map((x: any) => [x.codigo, x.papel || '—', String(x.usos)])} />
            <Tabela titulo="Fundadores" cols={['Ordem', 'Cidade', 'Desde']} linhas={(dados.listas.fundadores || []).map((f: any) => [`#${f.ordem}`, f.cidade || '—', String(f.created_at).slice(0, 10)])} />
          </div>
        )}

        {tab === 'Faturamento' && <Faturamento banco={dados.faturamentoBanco} />}

        {tab === 'Acertos' && <Acertos />}

        {tab === 'Feedback' && <Feedbacks itens={dados.listas.feedbacks || []} />}

        {tab === 'Aprovações' && <Aprovacoes pendentes={dados.listas.pendentes || []} onChange={carregar} />}

        {tab === 'Cidades & Flags' && <CidadesFlags cidades={dados.cidades || []} flags={dados.flagsGlobais || {}} onChange={carregar} />}
      </div>
    </main>
  )
}

function Kpi({ icon: Icon, label, v, dica }: { icon: any; label: string; v: any; dica?: string }) {
  return (
    <div className="bg-card border border-borda rounded-2xl p-4" title={dica}>
      <Icon size={16} className="text-acento mb-2" />
      <p className="text-white font-bold text-xl tabular-nums leading-tight">{v}</p>
      <p className="text-gray-500 text-xs">{label}</p>
    </div>
  )
}

// Funil de ativação: onde a loja empaca entre cadastrar e pagar.
function Funil({ funil }: { funil: any }) {
  const etapas = [
    { label: 'Cadastradas', v: funil.cadastradas },
    { label: 'Com produto', v: funil.comProduto },
    { label: 'Com pedido', v: funil.comPedido },
    { label: 'Assinantes', v: funil.assinantes },
  ]
  const base = Math.max(1, funil.cadastradas)
  return (
    <div className="bg-card border border-borda rounded-2xl p-5">
      <p className="text-white text-sm font-semibold mb-3">Funil de ativação</p>
      <div className="space-y-2">
        {etapas.map(e => (
          <div key={e.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-300">{e.label}</span>
              <span className="text-gray-400 tabular-nums">{e.v} · {Math.round((e.v / base) * 100)}%</span>
            </div>
            <div className="h-2 bg-elevado rounded-full overflow-hidden">
              <div className="h-full bg-acento rounded-full" style={{ width: `${Math.min(100, (e.v / base) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Faturamento ─────────────────────────────────────────────────────────────
// Duas origens na mesma tela, sempre rotuladas: o que veio do BANCO (estimado
// pela tabela de preços) e o que veio da STRIPE (o que foi cobrado de fato).
// Misturar as duas sem dizer qual é qual foi o defeito do painel antigo.
function Faturamento({ banco }: { banco: any }) {
  const [stripe, setStripe] = useState<any>(null)
  // Nasce carregando: a aba só monta quando é aberta, e o fetch começa junto.
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // Carrega sob demanda: a Stripe é rede externa e não pode travar o painel.
  useEffect(() => {
    let vivo = true
    fetch(`${ADMIN_API_BASE}/faturamento`)
      .then(r => r.json())
      .then(j => { if (vivo) { setStripe(j); setCarregando(false) } })
      .catch(() => { if (vivo) { setErro('Não foi possível falar com a Stripe.'); setCarregando(false) } })
    return () => { vivo = false }
  }, [])

  return (
    <div className="space-y-6">
      {/* Divergência: plano ativo no banco sem assinatura na Stripe = loja
          ativada na mão. Contar isso como receita é inventar dinheiro. */}
      {banco.semAssinatura > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-200 text-sm font-semibold">
              {banco.semAssinatura} loja(s) com plano ativo e sem assinatura na Stripe
            </p>
            <p className="text-amber-200/80 text-xs mt-0.5">
              O webhook grava <code>plano=&apos;ativo&apos;</code> e <code>stripe_subscription_id</code> juntos.
              Plano ativo sem id = ativação manual — não conta como receita.
            </p>
          </div>
        </div>
      )}

      <div>
        <p className="text-gray-400 text-xs mb-2 flex items-center gap-1.5">
          <CreditCard size={13} /> Stripe — o que foi cobrado de fato
        </p>
        {carregando && <div className="bg-card border border-borda rounded-2xl p-5 text-gray-500 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Consultando a Stripe…</div>}
        {!carregando && (erro || !stripe?.disponivel) && (
          <div className="bg-card border border-borda rounded-2xl p-5">
            <p className="text-gray-400 text-sm">{erro || stripe?.motivo || 'Faturamento ao vivo indisponível.'}</p>
            <p className="text-gray-600 text-xs mt-1">Os números estimados do banco, abaixo, continuam valendo.</p>
          </div>
        )}
        {!carregando && stripe?.disponivel && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={DollarSign} label="MRR real (Stripe)" v={brl(stripe.mrrTotal)} />
              <Kpi icon={Store} label="Mensalidades ativas" v={stripe.resumo.mensalidade.ativas} dica={`Fundador: ${stripe.resumo.mensalidade.fundador} · Normal: ${stripe.resumo.mensalidade.normal}`} />
              <Kpi icon={TrendingUp} label="Ads ativos" v={stripe.resumo.ads.ativas} dica={brl(stripe.resumo.ads.mrr)} />
              <Kpi icon={AlertTriangle} label="Inadimplentes" v={stripe.resumo.inadimplentes} />
            </div>
            {stripe.saldo && (
              <div className="grid grid-cols-2 gap-3">
                <Kpi icon={Wallet} label="Saldo disponível" v={brl(stripe.saldo.disponivel)} />
                <Kpi icon={Wallet} label="Saldo pendente" v={brl(stripe.saldo.pendente)} />
              </div>
            )}
            {stripe.truncado && (
              <p className="text-amber-300/80 text-xs">
                ⚠️ Mais de 100 assinaturas: a lista foi truncada e o MRR acima está incompleto.
              </p>
            )}
            <Tabela
              titulo="Faturas recentes"
              cols={['Número', 'Data', 'Valor', 'Status']}
              linhas={(stripe.faturas || []).map((f: any) => [
                f.numero || f.id, new Date(f.criada_em).toLocaleDateString('pt-BR'), brl(f.valor), f.status,
              ])}
            />
          </div>
        )}
      </div>

      <div>
        <p className="text-gray-400 text-xs mb-2">Banco — estimado pela tabela de preços</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={DollarSign} label="MRR estimado" v={brl(banco.mrrEstimado)} dica="Preço de tabela aplicado a quem tem plano='ativo'. Não é prova de cobrança." />
          <Kpi icon={Store} label="Assinantes (banco)" v={banco.assinantes} />
          <Kpi icon={Handshake} label={`Comissão B2B (${banco.comissaoPct}%)`} v={brl(banco.comissaoB2B)} />
          <Kpi icon={Bike} label="Margem de delivery" v={brl(banco.margemDelivery)} dica={`Taxas ${brl(banco.taxasEntrega)} − corridas ${brl(banco.pagoEntregadores)}`} />
        </div>
        <p className="text-gray-600 text-xs mt-2">
          Receita da Commerly já realizada (comissão B2B + margem de delivery): <strong className="text-gray-400">{brl(banco.receitaCommerly)}</strong>.
          Isso não inclui mensalidade — a autoridade dela é a Stripe, acima.
        </p>
      </div>
    </div>
  )
}

// ── Feedback ────────────────────────────────────────────────────────────────
// A RLS de `feedbacks` só deixa o DONO ler o que escreveu; esta lista só existe
// porque a rota lê com service role. Antes, o feedback entrava no banco e
// ninguém nunca lia — nem você.
// ============================================================================
// ACERTOS EM DINHEIRO (Caminho B, lib/acertos.ts): o que a Commerly deve
// (cupom da Garantia à loja, bônus do Modo Festa ao entregador) e as
// contestações entre entregador e loja. "Liquidar" registra o Pix manual com a
// referência; quando virar Caminho A, o transfer da Stripe ocupa esse lugar.
// ============================================================================
function Acertos() {
  const [dados, setDados] = useState<any>(null)
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [ref, setRef] = useState<Record<string, string>>({})
  // Recarrega quando `versao` muda (depois de liquidar). Mesmo padrão do
  // Faturamento: fetch dentro do effect, estado só no .then.
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    let vivo = true
    fetch(`${ADMIN_API_BASE}/acertos`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(j => { if (vivo) setDados(j) })
      .catch(() => { if (vivo) setErro('Não foi possível carregar os acertos.') })
    return () => { vivo = false }
  }, [versao])
  const carregar = () => setVersao(v => v + 1)

  async function liquidar(id: string) {
    setBusy(id)
    const r = await fetch(`${ADMIN_API_BASE}/acertos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acerto_id: id, referencia_externa: ref[id] || null }),
    }).catch(() => null)
    setBusy(null)
    if (!r || !r.ok) { setErro('Não foi possível liquidar.'); return }
    carregar()
  }

  if (erro) return <p className="text-red-400 text-sm">{erro}</p>
  if (!dados) return <p className="text-gray-500 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando…</p>

  const nomeLoja = (id: string) => dados.nomes?.lojas?.[id] || id.slice(0, 8)
  const nomeEnt = (id: string | null) => (id && dados.nomes?.entregadores?.[id]) || '—'
  const TIPO: Record<string, string> = { cupom_garantia: 'Cupom Garantia → loja', bonus_festa: 'Bônus festa → entregador', repasse_loja: 'Repasse entregador → loja', cobranca: 'Cobrança' }
  const pendentes = (dados.devidos || []).filter((a: any) => a.situacao !== 'confirmado')
  const liquidados = (dados.devidos || []).filter((a: any) => a.situacao === 'confirmado')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi icon={Banknote} label="Commerly deve (pendente)" v={brl(dados.resumo.commerly_deve_pendente)} dica="Cupom da Garantia (à loja) e bônus do Modo Festa (ao entregador) em pedidos pagos em dinheiro." />
        <Kpi icon={Check} label="Liquidado" v={brl(dados.resumo.commerly_deve_liquidado)} />
        <Kpi icon={AlertTriangle} label="Contestações" v={dados.resumo.contestados} dica="Loja disse que não recebeu o repasse do entregador (ou vice-versa)." />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h3 className="text-white font-semibold text-sm mb-3">A liquidar ({pendentes.length})</h3>
        {pendentes.length === 0 ? <p className="text-gray-500 text-xs">Nada pendente.</p> : (
          <div className="flex flex-col gap-2">
            {pendentes.map((a: any) => (
              <div key={a.id} className="flex flex-col md:flex-row md:items-center gap-2 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium">{TIPO[a.tipo] || a.tipo} · <span className="text-acento font-bold">{brl(Number(a.valor))}</span></p>
                  <p className="text-gray-500 truncate">
                    {a.para_papel === 'loja' ? `Loja: ${nomeLoja(a.loja_id)}` : `Entregador: ${nomeEnt(a.entregador_id)}`} · pedido {String(a.pedido_id).slice(0, 8)} · {new Date(a.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <input value={ref[a.id] || ''} onChange={e => setRef(prev => ({ ...prev, [a.id]: e.target.value }))}
                  placeholder="Ref. do Pix (opcional)" className="bg-gray-900 border border-gray-800 text-white rounded-lg px-2 py-1.5 text-xs w-full md:w-44" />
                <button onClick={() => liquidar(a.id)} disabled={busy === a.id}
                  className="shrink-0 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg">
                  {busy === a.id ? '…' : 'Marcar liquidado'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h3 className="text-white font-semibold text-sm mb-3">Contestações ({(dados.contestados || []).length})</h3>
        {(dados.contestados || []).length === 0 ? <p className="text-gray-500 text-xs">Nenhuma.</p> : (
          <div className="flex flex-col gap-2">
            {dados.contestados.map((a: any) => {
              const c = (a.acertos_confirmacoes || []).find((x: any) => x.resultado === 'contestado')
              return (
                <div key={a.id} className="bg-gray-950 border border-red-500/30 rounded-xl px-3 py-2 text-xs">
                  <p className="text-white font-medium">{TIPO[a.tipo] || a.tipo} · <span className="text-red-300 font-bold">{brl(Number(a.valor))}</span></p>
                  <p className="text-gray-400">Loja {nomeLoja(a.loja_id)} · entregador {nomeEnt(a.entregador_id)} · pedido {String(a.pedido_id).slice(0, 8)}</p>
                  {c?.observacao && <p className="text-gray-300 italic mt-1">“{c.observacao}”</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {liquidados.length > 0 && (
        <Tabela titulo="Liquidados" cols={['Tipo', 'Valor', 'Para', 'Quando']}
          linhas={liquidados.slice(0, 50).map((a: any) => [
            TIPO[a.tipo] || a.tipo, brl(Number(a.valor)),
            a.para_papel === 'loja' ? nomeLoja(a.loja_id) : nomeEnt(a.entregador_id),
            new Date(a.created_at).toLocaleDateString('pt-BR'),
          ])} />
      )}
    </div>
  )
}

function Feedbacks({ itens }: { itens: any[] }) {
  const [filtro, setFiltro] = useState<string>('Todos')
  const tipos = ['Todos', 'Bug', 'Ideia', 'Melhoria']
  const lista = filtro === 'Todos' ? itens : itens.filter(i => i.tipo === filtro)

  const cor: Record<string, string> = {
    Bug: 'bg-red-500/15 text-red-300',
    Ideia: 'bg-blue-500/15 text-blue-300',
    Melhoria: 'bg-green-500/15 text-green-300',
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap">
        {tipos.map(t => (
          <button key={t} onClick={() => setFiltro(t)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${filtro === t ? 'bg-acento text-white' : 'text-gray-400 hover:text-white'}`}>
            {t} {t !== 'Todos' && <span className="text-xs opacity-70">({itens.filter(i => i.tipo === t).length})</span>}
          </button>
        ))}
      </div>

      <div className="bg-card border border-borda rounded-2xl p-5">
        <p className="text-white text-sm font-semibold mb-3 flex items-center gap-1.5">
          <MessageSquare size={15} className="text-acento" /> Feedback dos comerciantes <span className="text-gray-500">({lista.length})</span>
        </p>
        {lista.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum feedback {filtro !== 'Todos' ? `do tipo "${filtro}"` : ''} ainda.</p>
        ) : (
          <ul className="space-y-3">
            {lista.map(f => (
              <li key={f.id} className="rounded-xl border border-borda bg-superficie p-3">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${cor[f.tipo] || 'bg-elevado text-gray-300'}`}>{f.tipo}</span>
                  <span className="text-gray-400 text-xs">{f.loja}</span>
                  <span className="text-gray-600 text-xs ml-auto">{new Date(f.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-gray-200 text-sm whitespace-pre-wrap break-words">{f.mensagem}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Tabela({ titulo, cols, linhas }: { titulo: string; cols: string[]; linhas: any[][] }) {
  return (
    <div className="bg-card border border-borda rounded-2xl p-5">
      <p className="text-white text-sm font-semibold mb-3">{titulo} <span className="text-gray-500">({linhas.length})</span></p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-gray-500 text-xs border-b border-borda">{cols.map(c => <th key={c} className="text-left font-medium py-2 pr-4 whitespace-nowrap">{c}</th>)}</tr></thead>
          <tbody>
            {linhas.length === 0 ? <tr><td colSpan={cols.length} className="py-3 text-gray-600 text-xs">Nada por aqui ainda.</td></tr> :
              linhas.slice(0, 30).map((l, i) => (
                <tr key={i} className="border-b border-borda/50">{l.map((cel, j) => <td key={j} className="py-2 pr-4 text-gray-300 whitespace-nowrap">{cel}</td>)}</tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Miniatura de uma prova enviada no cadastro. Abre em nova aba porque o admin
// precisa dar zoom para julgar (documento borrado, bolsa que não é térmica).
function Prova({ titulo, url, vazio = 'não enviado', alerta = false }: {
  titulo: string; url?: string | null; vazio?: string; alerta?: boolean
}) {
  return (
    <div className="w-28">
      <p className="text-gray-400 text-[11px] mb-1">{titulo}</p>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          <img src={url} alt={titulo} className="w-28 h-20 object-cover rounded-lg border border-borda hover:border-acento transition" />
        </a>
      ) : (
        <div className={`w-28 h-20 rounded-lg border border-dashed flex items-center justify-center text-center px-1.5 ${
          alerta ? 'border-amber-500/50 bg-amber-500/5' : 'border-borda bg-elevado'
        }`}>
          <span className={`text-[10px] leading-tight ${alerta ? 'text-amber-300/90' : 'text-gray-600'}`}>{vazio}</span>
        </div>
      )}
    </div>
  )
}

function Aprovacoes({ pendentes, onChange }: { pendentes: any[]; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  async function agir(id: string, acao: string) {
    setBusy(id)
    await fetch(`${ADMIN_API_BASE}/entregador`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, acao }) }).catch(() => {})
    setBusy(null); onChange()
  }
  return (
    <div className="bg-card border border-borda rounded-2xl p-5">
      <p className="text-white text-sm font-semibold mb-3">Entregadores aguardando aprovação <span className="text-gray-500">({pendentes.length})</span></p>
      {pendentes.length === 0 ? <p className="text-gray-500 text-sm">Nenhum entregador pendente. 🎉</p> : (
        <ul className="space-y-3">
          {pendentes.map((e: any) => (
            <li key={e.id} className="rounded-xl border border-borda bg-superficie p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{e.nome}</p>
                  <p className="text-gray-500 text-xs">{e.veiculo_tipo || '—'} · {e.telefone || 's/ telefone'} · doc {e.documento_numero || '—'}</p>
                </div>
                <button disabled={busy === e.id} onClick={() => agir(e.id, 'aprovar')} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"><Check size={14} /> Aprovar</button>
                <button disabled={busy === e.id} onClick={() => agir(e.id, 'reprovar')} className="flex items-center gap-1 bg-elevado border border-borda text-gray-300 text-xs px-3 py-1.5 rounded-lg"><X size={14} /> Reprovar</button>
              </div>

              {/* Provas visuais: documento + bolsa lado a lado. A decisão de
                  aprovar passou a incluir "a bolsa serve?", então a foto tem de
                  estar aqui, não escondida atrás de outro clique. */}
              <div className="flex flex-wrap items-start gap-3 mt-3">
                <Prova titulo="Documento" url={e.documento_foto_url} />
                <Prova titulo="Rosto" url={e.foto_url} />
                <Prova
                  titulo="Bolsa térmica"
                  url={e.bolsa_foto_url}
                  vazio={
                    e.tem_bolsa === true ? 'declarou ter, sem foto'
                      : e.tem_bolsa === false ? 'declarou NÃO ter'
                      : 'não informado (cadastro antigo)'
                  }
                  alerta={e.tem_bolsa !== true}
                />
              </div>
              {e.tem_bolsa === true && !e.bolsa_confirmada_em && (
                <p className="text-amber-300/90 text-xs mt-2">⚠️ Enviou a bolsa mas não aceitou o compromisso de uso.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CidadesFlags({ cidades, flags, onChange }: { cidades: any[]; flags: Record<string, boolean>; onChange: () => void }) {
  const [local, setLocal] = useState<Record<string, boolean>>(flags)
  async function toggle(flag: string) {
    const ativo = !local[flag]
    setLocal(s => ({ ...s, [flag]: ativo }))
    await fetch(`${ADMIN_API_BASE}/flag`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flag, ativo }) }).catch(() => {})
    onChange()
  }
  return (
    <div className="space-y-6">
      <div className="bg-card border border-borda rounded-2xl p-5">
        <p className="text-white text-sm font-semibold mb-1">Feature flags globais</p>
        <p className="text-gray-500 text-xs mb-4">Ligue ou desligue funcionalidades sem alterar código. (Overrides por cidade via API.)</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {FEATURE_FLAGS.map(({ flag, rotulo }) => (
            <button key={flag} onClick={() => toggle(flag)} className="flex items-center justify-between rounded-xl border border-borda bg-superficie px-3 py-2.5">
              <span className="text-gray-200 text-sm">{rotulo}</span>
              <span className={`relative w-11 h-6 rounded-full transition ${local[flag] ? 'bg-acento' : 'bg-elevado'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${local[flag] ? 'left-[22px]' : 'left-0.5'}`} />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-borda rounded-2xl p-5">
        <p className="text-white text-sm font-semibold mb-3">Cidades na corrida da expansão <span className="text-gray-500">({cidades.length})</span></p>
        <ul className="space-y-2">
          {cidades.map((c: any) => (
            <li key={c.slug} className="rounded-xl border border-borda bg-superficie p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-sm font-medium">{c.nome}/{c.uf} <span className="text-gray-500 text-xs">· {c.status}</span></span>
                <span className="text-gray-400 text-xs tabular-nums">{c.pontos}/{c.meta_pontos} pts</span>
              </div>
              <div className="h-1.5 bg-elevado rounded-full overflow-hidden"><div className="h-full bg-acento rounded-full" style={{ width: `${Math.min(100, Math.round((c.pontos / Math.max(1, c.meta_pontos)) * 100))}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
