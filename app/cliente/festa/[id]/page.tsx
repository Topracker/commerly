'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCliente } from '../../../hooks/useCliente'
import { ClienteLayout } from '../../../components/ClienteLayout'
import { useToast } from '../../../hooks/useToast'
import { Toast } from '../../../components/Toast'
import { FESTA_STATUS_META, FESTA_BONUS_PCT, type FestaStatus } from '../../../lib/festas'
import { emojiCategoria } from '../../../lib/temaLoja'
import {
  ArrowLeft, PartyPopper, Users, Copy, Check, Plus, Minus, Store,
  MapPin, ShoppingBag, Truck, Loader2, PackageCheck,
} from 'lucide-react'

type Item = { produto_id: string; loja_id: string; nome: string; preco: number; quantidade: number }
type Participante = { id: string; cliente_id: string; nome: string; itens: Item[]; pronto: boolean; tem_pedido: boolean; sou_eu: boolean }
type Produto = { id: string; loja_id: string; nome: string; preco_venda: number; imagem_url?: string | null; categoria?: string | null; preco_original?: number; desconto_pct?: number }
type LojaFesta = { id: string; nome: string; tipo: string }
type Estado = {
  festa: { id: string; nome: string; codigo: string; status: FestaStatus; endereco_entrega: string; taxa_total: number | null; taxa_por_pessoa: number | null; expira_em: string }
  sou_criador: boolean
  lojas: LojaFesta[]
  produtos: Produto[]
  participantes: Participante[]
}

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function FestaSala() {
  const { id } = useParams<{ id: string }>()
  const { cliente, loading, sair } = useCliente()
  const { toast, mostrarToast } = useToast()
  const router = useRouter()

  const [estado, setEstado] = useState<Estado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lojaSel, setLojaSel] = useState<string | null>(null)
  const [qtds, setQtds] = useState<Record<string, number>>({})
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [acaoFesta, setAcaoFesta] = useState(false)
  const carrinhoTocado = useRef(false)

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/festa/estado?festa_id=${id}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setErro(d.error || 'Não foi possível carregar a festa.'); return }
    setEstado(d)
    // Sincroniza o carrinho local com o salvo — só na primeira carga (não
    // atropela o que o usuário está montando agora).
    if (!carrinhoTocado.current) {
      const eu = (d.participantes as Participante[]).find(p => p.sou_eu)
      if (eu && eu.itens.length > 0) {
        setLojaSel(eu.itens[0].loja_id)
        setQtds(Object.fromEntries(eu.itens.map(i => [i.produto_id, i.quantidade])))
      }
    }
  }, [id])

  // Poll a cada 5s enquanto a sala está viva (atualiza participantes/status).
  useEffect(() => {
    if (!cliente || !id) return
    void carregar()
    const iv = setInterval(carregar, 5000)
    return () => clearInterval(iv)
  }, [cliente, id, carregar])

  const festa = estado?.festa
  const aberta = festa?.status === 'aberta'
  const produtosLoja = useMemo(
    () => (estado?.produtos || []).filter(p => p.loja_id === lojaSel),
    [estado?.produtos, lojaSel],
  )
  // Tipo da loja selecionada — usado no emoji temático quando o produto não tem foto.
  const lojaSelTipo = useMemo(
    () => estado?.lojas.find(l => l.id === lojaSel)?.tipo || '',
    [estado?.lojas, lojaSel],
  )
  const meuSubtotal = useMemo(
    () => produtosLoja.reduce((s, p) => s + (qtds[p.id] || 0) * Number(p.preco_venda), 0),
    [produtosLoja, qtds],
  )
  const totalItens = Object.values(qtds).reduce((s, q) => s + q, 0)

  function mudarQtd(pid: string, delta: number) {
    carrinhoTocado.current = true
    setQtds(prev => {
      const nova = Math.max(0, (prev[pid] || 0) + delta)
      const next = { ...prev }
      if (nova === 0) delete next[pid]; else next[pid] = nova
      return next
    })
  }

  function escolherLoja(lid: string) {
    // Trocar de loja limpa o carrinho (um pedido é de uma loja só).
    if (lid !== lojaSel) { carrinhoTocado.current = true; setQtds({}); setLojaSel(lid) }
  }

  async function salvarCarrinho(pronto: boolean) {
    if (!lojaSel) { mostrarToast('Escolha uma loja primeiro.', 'erro'); return }
    const itens = produtosLoja
      .filter(p => (qtds[p.id] || 0) > 0)
      .map(p => ({ produto_id: p.id, quantidade: qtds[p.id] }))
    if (itens.length === 0) { mostrarToast('Adicione pelo menos um produto.', 'erro'); return }
    setSalvando(true)
    try {
      const res = await fetch('/api/festa/carrinho', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ festa_id: id, itens, pronto }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { mostrarToast(d.error || 'Não foi possível salvar.', 'erro'); setSalvando(false); return }
      mostrarToast(pronto ? 'Prontinho! Seu pedido está na festa.' : 'Carrinho salvo.', 'sucesso')
      await carregar()
    } catch { mostrarToast('Erro de rede.', 'erro') } finally { setSalvando(false) }
  }

  async function fechar() {
    if (!confirm('Fechar a festa? Os pedidos serão enviados às lojas e vamos buscar um entregador.')) return
    setAcaoFesta(true)
    try {
      const res = await fetch('/api/festa/fechar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ festa_id: id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { mostrarToast(d.error || 'Não foi possível fechar.', 'erro'); setAcaoFesta(false); return }
      const msg = d.despacho === 'ofertado' || d.despacho === 'esperando'
        ? 'Festa fechada! Já chamamos um entregador.'
        : 'Festa fechada! Toque em "Buscar entregador" para chamar alguém.'
      mostrarToast(msg, 'sucesso')
      await carregar()
    } catch { mostrarToast('Erro de rede.', 'erro') } finally { setAcaoFesta(false) }
  }

  async function buscarEntregador() {
    setAcaoFesta(true)
    try {
      const res = await fetch('/api/festa/despachar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ festa_id: id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { mostrarToast(d.error || 'Erro ao buscar entregador.', 'erro'); setAcaoFesta(false); return }
      if (d.atribuido) mostrarToast('Um entregador já está a caminho!', 'sucesso')
      else if (d.esgotado) mostrarToast('Nenhum entregador online por perto agora. Tente de novo em instantes.', 'erro')
      else if (d.esperando) mostrarToast(`${d.entregador?.nome || 'Um entregador'} está decidindo...`, 'sucesso')
      else mostrarToast(`Oferta enviada para ${d.entregador?.nome || 'um entregador'}!`, 'sucesso')
      await carregar()
    } catch { mostrarToast('Erro de rede.', 'erro') } finally { setAcaoFesta(false) }
  }

  function copiarCodigo() {
    if (!festa) return
    navigator.clipboard?.writeText(festa.codigo).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 1500)
    }).catch(() => {})
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!cliente) return null

  if (erro) return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <div className="max-w-lg mx-auto text-center py-20">
        <p className="text-gray-300 mb-4">{erro}</p>
        <button onClick={() => router.push('/cliente/festa')} className="text-acento font-medium">Voltar para as festas</button>
      </div>
    </ClienteLayout>
  )
  if (!estado || !festa) return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <div className="flex items-center justify-center py-24"><p className="text-gray-400">Carregando festa...</p></div>
    </ClienteLayout>
  )

  const meta = FESTA_STATUS_META[festa.status]
  const participantesComItens = estado.participantes.filter(p => p.itens.length > 0)

  return (
    <ClienteLayout cliente={cliente} sair={sair} noPadding>
      <Toast toast={toast} />
      <header className="bg-card border-b border-borda px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push('/cliente/festa')} className="shrink-0 text-gray-400 hover:text-white"><ArrowLeft size={20} /></button>
        <PartyPopper size={18} className="text-acento shrink-0" />
        <p className="font-display text-white font-bold truncate flex-1 min-w-0">{festa.nome}</p>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.classes}`}>{meta.label}</span>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24 font-body space-y-4">
        {/* Convite + endereço */}
        <div className="bg-card border border-borda rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-gray-500 text-xs mb-0.5">Código do convite</p>
              <p className="font-mono text-2xl font-bold text-white tracking-[0.3em]">{festa.codigo}</p>
            </div>
            <button
              onClick={copiarCodigo}
              className="shrink-0 flex items-center gap-1.5 bg-elevado border border-borda hover:bg-borda text-white text-sm font-medium px-3 py-2 rounded-xl transition"
            >
              {copiado ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-gray-400 text-xs mt-3 flex items-start gap-1.5">
            <MapPin size={13} className="text-gray-500 shrink-0 mt-0.5" />
            <span>{festa.endereco_entrega}</span>
          </p>
        </div>

        {/* Status pós-fechamento */}
        {!aberta && (
          <div className="bg-card border border-borda rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              {festa.status === 'despachada' ? <Truck size={18} className="text-purple-400" /> : <PackageCheck size={18} className="text-amber-400" />}
              <p className="text-white font-semibold">
                {festa.status === 'despachada' ? 'Entregador a caminho' : 'Festa fechada'}
              </p>
            </div>
            {festa.taxa_total != null && (
              <div className="text-sm text-gray-400 flex flex-col gap-0.5">
                <div className="flex justify-between"><span>Taxa da viagem</span><span className="tabular-nums">{reais(Number(festa.taxa_total))}</span></div>
                <div className="flex justify-between"><span>Dividida por {participantesComItens.length} {participantesComItens.length === 1 ? 'pessoa' : 'pessoas'}</span><span className="tabular-nums text-white font-medium">{reais(Number(festa.taxa_por_pessoa) || 0)} cada</span></div>
              </div>
            )}
            {estado.sou_criador && festa.status === 'fechada' && (
              <button
                onClick={buscarEntregador}
                disabled={acaoFesta}
                className="mt-3 w-full bg-azul hover:brightness-110 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
              >
                {acaoFesta ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
                Buscar entregador
              </button>
            )}
            <p className="text-gray-500 text-xs mt-3">Pagamento na entrega. Cada um paga o seu pedido ao entregador.</p>
          </div>
        )}

        {/* Participantes */}
        <div className="bg-card border border-borda rounded-2xl p-4">
          <h2 className="font-display text-white font-semibold flex items-center gap-2 mb-3">
            <Users size={16} className="text-gray-400" /> Na festa <span className="text-gray-500 font-normal text-sm">({estado.participantes.length})</span>
          </h2>
          <div className="flex flex-col gap-2">
            {estado.participantes.map(p => {
              const sub = p.itens.reduce((s, i) => s + i.preco * i.quantidade, 0)
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-borda bg-superficie px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-white text-sm font-medium truncate">{p.nome}{p.sou_eu && ' (você)'}</p>
                      {p.pronto && <Check size={13} className="text-green-400 shrink-0" />}
                    </div>
                    <p className="text-gray-500 text-xs">
                      {p.itens.length === 0 ? 'sem itens ainda' : `${p.itens.length} item(ns) · ${reais(sub)}`}
                    </p>
                  </div>
                  {p.pronto && <span className="shrink-0 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full">pronto</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Meu pedido (só enquanto aberta) */}
        {aberta && (
          <div className="bg-card border border-borda rounded-2xl p-4">
            <h2 className="font-display text-white font-semibold flex items-center gap-2 mb-3">
              <ShoppingBag size={16} className="text-gray-400" /> Meu pedido
            </h2>

            <p className="text-gray-400 text-xs mb-2 flex items-center gap-1.5"><Store size={13} /> Escolha uma loja</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {estado.lojas.map(l => (
                <button
                  key={l.id}
                  onClick={() => escolherLoja(l.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${lojaSel === l.id ? 'bg-acento/15 border-acento/60 text-acento' : 'bg-superficie border-borda text-gray-300 hover:border-[#2b3440]'}`}
                >
                  {l.nome}
                </button>
              ))}
            </div>

            {lojaSel ? (
              produtosLoja.length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">Esta loja não tem produtos disponíveis.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {produtosLoja.map(p => {
                    const q = qtds[p.id] || 0
                    return (
                      <div key={p.id} className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${q > 0 ? 'border-acento/60 bg-elevado' : 'border-borda bg-superficie'}`}>
                        {/* Foto do produto, com emoji temático de fallback. */}
                        {p.imagem_url ? (
                          <img
                            src={p.imagem_url}
                            alt={p.nome}
                            className="w-12 h-12 rounded-lg object-cover border border-borda shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-superficie border border-borda flex items-center justify-center text-2xl shrink-0">
                            {emojiCategoria(p.categoria, lojaSelTipo)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{p.nome}</p>
                          <p className="font-display font-bold text-sm text-acento">{reais(Number(p.preco_venda))}</p>
                        </div>
                        {/* Só [+] enquanto não escolheu; ao adicionar, revela [−] q [+]. */}
                        <div className="flex items-center gap-2 shrink-0">
                          {q > 0 && (
                            <>
                              <button onClick={() => mudarQtd(p.id, -1)} aria-label="Diminuir" className="w-8 h-8 flex items-center justify-center rounded-lg bg-borda text-white hover:bg-[#2c343d] transition"><Minus size={16} /></button>
                              <span className="w-6 text-center text-white font-semibold tabular-nums">{q}</span>
                            </>
                          )}
                          <button onClick={() => mudarQtd(p.id, 1)} aria-label="Aumentar" className="w-8 h-8 flex items-center justify-center rounded-lg bg-acento text-white hover:bg-acento-forte transition"><Plus size={16} /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              <p className="text-gray-500 text-sm py-4 text-center">Escolha uma loja para ver os produtos.</p>
            )}

            {totalItens > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-borda pt-3">
                <span className="text-gray-400 text-sm">Seu subtotal ({totalItens} {totalItens === 1 ? 'item' : 'itens'})</span>
                <span className="font-display text-white font-bold tabular-nums">{reais(meuSubtotal)}</span>
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => salvarCarrinho(false)}
                disabled={salvando || totalItens === 0}
                className="flex-1 bg-elevado border border-borda hover:bg-borda disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition text-sm"
              >
                Salvar
              </button>
              <button
                onClick={() => salvarCarrinho(true)}
                disabled={salvando || totalItens === 0}
                className="flex-[1.4] bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm"
              >
                <Check size={16} /> Estou pronto
              </button>
            </div>
          </div>
        )}

        {/* Fechar festa (criador) */}
        {estado.sou_criador && aberta && (
          <button
            onClick={fechar}
            disabled={acaoFesta || participantesComItens.length === 0}
            className="w-full bg-acento hover:bg-acento-forte disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            {acaoFesta ? <Loader2 size={18} className="animate-spin" /> : <PartyPopper size={18} />}
            Fechar festa e enviar pedidos
          </button>
        )}
        {estado.sou_criador && aberta && participantesComItens.length === 0 && (
          <p className="text-gray-500 text-xs text-center -mt-2">Espere pelo menos uma pessoa adicionar itens para fechar.</p>
        )}

        <p className="text-center text-gray-600 text-xs pt-2">
          O entregador ganha +{FESTA_BONUS_PCT}% na corrida da festa. 💛
        </p>
      </div>
    </ClienteLayout>
  )
}
