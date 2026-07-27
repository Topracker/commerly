'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ShieldCheck, Users, Store, Bike, Package, MapPin, DollarSign, Loader2, Check, X,
  TrendingUp, Award, Handshake,
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FEATURE_FLAGS } from '../lib/crescimento'

type Dados = any
const TABS = ['Visão geral', 'Usuários', 'Aprovações', 'Cidades & Flags'] as const

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Admin() {
  const [dados, setDados] = useState<Dados>(null)
  const [erro, setErro] = useState<number | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Visão geral')

  async function carregar() {
    const r = await fetch('/api/admin/dados')
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
              <Kpi icon={DollarSign} label="Receita movimentada" v={brl(c.receita)} />
              <Kpi icon={Award} label="Fundadores" v={c.fundadores} />
              <Kpi icon={Handshake} label="Parceiros" v={c.parceiros} />
              <Kpi icon={MapPin} label="Cidades" v={c.cidades} />
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

            <div className="bg-card border border-borda rounded-2xl p-5">
              <p className="text-white text-sm font-semibold mb-3 flex items-center gap-1.5"><MapPin size={15} className="text-acento" /> Receita por cidade</p>
              {dados.cidadesReceita.length === 0 ? <p className="text-gray-500 text-sm">Sem dados ainda.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(120, dados.cidadesReceita.length * 30)}>
                  <BarChart data={dados.cidadesReceita} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                    <YAxis type="category" dataKey="cidade" stroke="#9ca3af" fontSize={11} width={110} />
                    <Tooltip contentStyle={{ background: '#111418', border: '1px solid #ffffff20', borderRadius: 12 }} formatter={(v: any) => brl(Number(v))} />
                    <Bar dataKey="receita" fill="#f5c34b" radius={[0, 4, 4, 0]} name="Receita" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
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

        {tab === 'Aprovações' && <Aprovacoes pendentes={dados.listas.pendentes || []} onChange={carregar} />}

        {tab === 'Cidades & Flags' && <CidadesFlags cidades={dados.cidades || []} flags={dados.flagsGlobais || {}} onChange={carregar} />}
      </div>
    </main>
  )
}

function Kpi({ icon: Icon, label, v }: { icon: any; label: string; v: any }) {
  return (
    <div className="bg-card border border-borda rounded-2xl p-4">
      <Icon size={16} className="text-acento mb-2" />
      <p className="text-white font-bold text-xl tabular-nums leading-tight">{v}</p>
      <p className="text-gray-500 text-xs">{label}</p>
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
    await fetch('/api/admin/entregador', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, acao }) }).catch(() => {})
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
    await fetch('/api/admin/flag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flag, ativo }) }).catch(() => {})
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
