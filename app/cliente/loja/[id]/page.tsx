'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCliente } from '../../../hooks/useCliente'
import { ClienteLayout } from '../../../components/ClienteLayout'
import { Estrelas } from '../../../components/Estrelas'
import { useToast } from '../../../hooks/useToast'
import { Toast } from '../../../components/Toast'
import { isFavorito, toggleFavorito } from '../../../lib/favoritos'
import { enviarAvaliacao, VIEW_AVAL_LOJAS } from '../../../lib/avaliacoes'
import { SeloVerificado } from '../../../components/SeloVerificado'
import { MiniMapa } from '../../../components/MiniMapa'
import { FachadaBanner } from '../../../components/FachadaBanner'
import { RatingBadge } from '../../../components/RatingBadge'
import { ProdutoCard } from '../../../components/ProdutoCard'
import { PedidoModal } from '../../../components/PedidoModal'
import { isDelivery } from '../../../lib/pedidosClientes'
import { linkWhatsApp, textoPedido, whatsappDaLoja } from '../../../lib/whatsapp'
import { AtSign, MapPin, Clock, MessageCircle, ArrowLeft, Heart, ShoppingBag, Globe, UserPlus, UserCheck } from 'lucide-react'

export default function ClienteLoja() {
  const { id } = useParams<{ id: string }>()
  const { cliente, loading, supabase, sair } = useCliente()
  const { toast, mostrarToast } = useToast()
  const [loja, setLoja] = useState<any>(null)
  const [produtos, setProdutos] = useState<any[]>([])
  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [mediaAval, setMediaAval] = useState(0)
  const [minhaAvaliacao, setMinhaAvaliacao] = useState<any>(null)
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviandoAval, setEnviandoAval] = useState(false)
  const [favorito, setFavorito] = useState(false)
  const [pedidoAberto, setPedidoAberto] = useState(false)
  // Seguir é diferente de favoritar: favorito é uma lista privada (localStorage);
  // seguir prioriza a loja no feed e faz o cliente ser notificado dos posts dela.
  const [seguindo, setSeguindo] = useState(false)
  const [seguidores, setSeguidores] = useState(0)
  const [salvandoSeguir, setSalvandoSeguir] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (cliente && id) carregarLoja()
  }, [cliente, id])

  useEffect(() => {
    if (id) setFavorito(isFavorito(id))
  }, [id])

  useEffect(() => {
    if (!cliente || !id) return
    void carregarSeguir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, id])

  async function carregarSeguir() {
    const [meu, total] = await Promise.all([
      supabase.from('loja_seguidores').select('id').eq('loja_id', id).eq('cliente_id', cliente.id).maybeSingle(),
      supabase.from('loja_seguidores').select('id', { count: 'exact', head: true }).eq('loja_id', id),
    ])
    setSeguindo(!!meu.data)
    setSeguidores(total.count || 0)
  }

  async function alternarSeguir() {
    if (!cliente || salvandoSeguir) return
    setSalvandoSeguir(true)
    const jaSegue = seguindo
    // Otimista.
    setSeguindo(!jaSegue)
    setSeguidores(n => Math.max(0, n + (jaSegue ? -1 : 1)))

    const { error } = jaSegue
      ? await supabase.from('loja_seguidores').delete().eq('loja_id', id).eq('cliente_id', cliente.id)
      : await supabase.from('loja_seguidores').insert({ loja_id: id, cliente_id: cliente.id })

    setSalvandoSeguir(false)
    if (error) {
      setSeguindo(jaSegue)
      setSeguidores(n => Math.max(0, n + (jaSegue ? 1 : -1)))
      mostrarToast('Não foi possível salvar. Tente de novo.', 'erro')
      return
    }
    mostrarToast(jaSegue ? 'Você deixou de seguir esta loja.' : 'Seguindo! Você verá os posts dela no seu feed.', 'sucesso')
  }

  function alternarFavorito() {
    if (!loja) return
    const agora = toggleFavorito({ id: loja.id, nome: loja.nome, tipo: loja.tipo })
    setFavorito(agora)
    mostrarToast(agora ? 'Loja adicionada aos favoritos!' : 'Removida dos favoritos', 'sucesso')
  }

  async function carregarLoja() {
    const [lojaRes, prodRes, avalRes, promoRes] = await Promise.all([
      supabase.from('lojas_publicas').select('id, nome, tipo, localizacao, telefone, instagram, horario, latitude, longitude, fotos_fachada, taxa_entrega, website_url, whatsapp_business').eq('id', id).single(),
      supabase.from('produtos').select('id, nome, preco_venda, imagem_url, categoria').eq('loja_id', id).gt('quantidade', 0),
      supabase.from(VIEW_AVAL_LOJAS).select('id, nota, comentario, created_at, cliente_id, foto_url, hash').eq('loja_id', id).order('created_at', { ascending: false }),
      supabase.from('promocoes').select('produto_id, desconto_pct, preco_promocional').eq('loja_id', id).eq('ativa', true),
    ])

    if (lojaRes.error || !lojaRes.data) { router.push('/cliente/buscar'); return }
    setLoja(lojaRes.data)

    // Produto em promoção passa a valer o preço com desconto. Trocamos
    // `preco_venda` aqui para que o PedidoModal (e o total) já usem o valor
    // certo; guardamos o preço cheio só para exibir riscado. O servidor
    // reaplica a promoção no checkout, então os números batem.
    const promos = new Map<string, { desconto_pct: number; preco_promocional: number }>(
      (promoRes.data || []).map((p: any) => [p.produto_id, { desconto_pct: p.desconto_pct, preco_promocional: Number(p.preco_promocional) }]),
    )
    setProdutos((prodRes.data || []).map((p: any) => {
      const promo = promos.get(p.id)
      return promo
        ? { ...p, preco_venda: promo.preco_promocional, preco_original: Number(p.preco_venda), desconto_pct: promo.desconto_pct }
        : p
    }))

    // Distância máxima da loja em separado e tolerante: a coluna da view pode
    // não existir (pré-migração) — nesse caso o modal não bloqueia no cliente
    // (o trigger continua sendo a barreira definitiva no servidor).
    supabase.from('lojas_publicas').select('distancia_maxima_entrega').eq('id', id).maybeSingle()
      .then(({ data }: any) => {
        if (data?.distancia_maxima_entrega != null) {
          setLoja((prev: any) => (prev ? { ...prev, distancia_maxima_entrega: Number(data.distancia_maxima_entrega) } : prev))
        }
      })

    const avals = avalRes.data || []
    setAvaliacoes(avals)
    if (avals.length > 0) setMediaAval(avals.reduce((s: number, a: any) => s + a.nota, 0) / avals.length)

    const minha = avals.find((a: any) => a.cliente_id === cliente.id)
    if (minha) { setMinhaAvaliacao(minha); setNota(minha.nota); setComentario(minha.comentario || '') }
  }

  async function submeterAvaliacao() {
    if (nota === 0) { mostrarToast('Selecione uma nota!', 'erro'); return }
    setEnviandoAval(true)

    // Editar não altera a linha antiga: a API cria uma nova que a substitui,
    // preservando a cadeia de integridade. Ver lib/integridade.ts.
    const res = await enviarAvaliacao({
      alvo: 'loja',
      alvo_id: id,
      nota,
      comentario,
      substitui_id: minhaAvaliacao?.id ?? null,
    })
    setEnviandoAval(false)

    if ('error' in res) { mostrarToast(res.error, 'erro'); return }
    mostrarToast(minhaAvaliacao ? 'Avaliação atualizada!' : 'Avaliação enviada!', 'sucesso')
    carregarLoja()
  }

  // WhatsApp Business da loja (ou o telefone, quando não houver). `null` quando
  // nenhum dos dois forma um número válido — aí o botão nem aparece.
  const whatsapp = loja ? linkWhatsApp(whatsappDaLoja(loja), textoPedido(loja.nome)) : null

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  if (!loja) return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-400">Carregando...</p>
      </div>
    </ClienteLayout>
  )

  return (
    <ClienteLayout cliente={cliente} sair={sair} noPadding>
      <Toast toast={toast} />
      <header className="bg-card border-b border-borda px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push('/cliente/buscar')} className="shrink-0 text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <p className="font-display text-white font-bold truncate flex-1 min-w-0">{loja.nome}</p>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-10 font-body">
        <FachadaBanner fotos={loja.fotos_fachada} nome={loja.nome} tipo={loja.tipo} />

        <div className="relative z-10 -mt-10 space-y-[18px]">
          {/* Card de info — sobrepõe o banner */}
          <div className="bg-card border border-borda rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold text-white truncate">{loja.nome}</h1>
                <span className="inline-block text-xs bg-elevado border border-borda text-gray-300 px-2.5 py-0.5 rounded-full mt-1.5">{loja.tipo}</span>
              </div>
              {avaliacoes.length > 0 && <RatingBadge media={mediaAval} total={avaliacoes.length} />}
            </div>

            <div className="flex flex-col gap-2 text-sm">
              {loja.localizacao && (
                <p className="text-gray-400 flex items-center gap-2.5"><MapPin size={15} className="text-gray-500 shrink-0" />{loja.localizacao}</p>
              )}
              {loja.horario && (
                <p className="text-gray-400 flex items-center gap-2.5"><Clock size={15} className="text-gray-500 shrink-0" />{loja.horario}</p>
              )}
              {loja.instagram && (
                <p className="text-gray-400 flex items-center gap-2.5"><AtSign size={15} className="text-gray-500 shrink-0" />{loja.instagram}</p>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 text-center"
                >
                  <MessageCircle size={18} className="shrink-0" />
                  Pedir pelo WhatsApp
                </a>
              )}
              <button
                onClick={() => router.push(`/cliente/mensagens/${id}`)}
                className="flex-1 bg-elevado border border-borda hover:bg-borda text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} />
                Mensagem
              </button>
              <button
                onClick={alternarFavorito}
                aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-xl border transition ${
                  favorito
                    ? 'bg-red-500/15 border-red-500/40 hover:bg-red-500/25'
                    : 'bg-elevado border-borda hover:bg-borda'
                }`}
              >
                <Heart size={20} className={favorito ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
              </button>
            </div>

            <button
              onClick={alternarSeguir}
              disabled={salvandoSeguir}
              className={`mt-2 w-full font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-60 ${
                seguindo
                  ? 'bg-elevado border border-borda text-gray-300 hover:bg-borda'
                  : 'bg-azul hover:brightness-110 text-white'
              }`}
            >
              {seguindo ? <UserCheck size={18} /> : <UserPlus size={18} />}
              {seguindo ? 'Seguindo' : 'Seguir'}
              {seguidores > 0 && (
                <span className={`text-xs font-normal ${seguindo ? 'text-gray-500' : 'text-white/70'}`}>
                  · {seguidores}
                </span>
              )}
            </button>

            {/* MUTEX do delivery: some o botão quando a loja pausou os pedidos
                ou quando a feature flag `delivery` está desligada na cidade
                dela. O trigger do banco recusaria o pedido de qualquer jeito —
                aqui o cliente descobre antes de montar o carrinho. */}
            {isDelivery(loja.tipo) && produtos.length > 0 && (
              loja.delivery_liberado === false ? (
                <p className="mt-2.5 w-full rounded-xl border border-borda bg-elevado py-3 text-center text-sm text-gray-400">
                  Pedidos indisponíveis nesta loja no momento.
                </p>
              ) : (
                <button
                  onClick={() => setPedidoAberto(true)}
                  className="mt-2.5 w-full bg-azul hover:brightness-110 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                  <ShoppingBag size={18} />
                  Fazer Pedido
                </button>
              )
            )}

            {loja.website_url && (
              <a
                href={loja.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 w-full bg-elevado border border-borda hover:bg-borda text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <Globe size={18} />
                Visitar site
              </a>
            )}
          </div>

          <MiniMapa latitude={loja.latitude} longitude={loja.longitude} localizacao={loja.localizacao} nome={loja.nome} />

          {produtos.length > 0 && (
            <div className="bg-card border border-borda rounded-2xl p-4">
              <h2 className="font-display text-white font-semibold text-lg mb-3">
                Produtos disponíveis <span className="text-gray-500 font-normal text-sm">({produtos.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {produtos.map(p => <ProdutoCard key={p.id} produto={p} tipoLoja={loja.tipo} />)}
              </div>
            </div>
          )}

          <div className="bg-card border border-borda rounded-2xl p-5">
            <h2 className="font-display text-white font-semibold text-lg mb-4">
              {minhaAvaliacao ? 'Sua avaliação' : 'Avaliar este comércio'}
            </h2>
            <div className="flex flex-col gap-3">
              <Estrelas nota={nota} onSelect={setNota} />
              <textarea
                placeholder="Deixe um comentário (opcional)"
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                rows={3}
                className="bg-superficie border border-borda text-white rounded-xl px-4 py-3 outline-none focus:border-[#F5C34B]/60 focus:ring-1 focus:ring-[#F5C34B]/40 resize-none text-sm"
              />
              <button
                onClick={submeterAvaliacao}
                disabled={enviandoAval || nota === 0}
                className={`font-semibold py-3 rounded-xl transition disabled:opacity-50 ${
                  minhaAvaliacao
                    ? 'bg-[#F5C34B] hover:bg-[#e6b43e] text-card'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {enviandoAval ? 'Enviando...' : minhaAvaliacao ? 'Atualizar avaliação' : 'Enviar avaliação'}
              </button>
            </div>
          </div>

          {avaliacoes.length > 0 && (
            <div className="bg-card border border-borda rounded-2xl p-5">
              <h2 className="font-display text-white font-semibold text-lg mb-2">Avaliações ({avaliacoes.length})</h2>
              <div className="divide-y divide-borda">
                {avaliacoes.map((a, i) => (
                  <div key={i} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Estrelas nota={a.nota} tamanho="text-base" />
                        <SeloVerificado hash={a.hash} />
                      </div>
                      <span className="text-gray-500 text-xs shrink-0">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {a.comentario && <p className="text-gray-300 text-sm mt-1.5">{a.comentario}</p>}
                    {a.foto_url && (
                      <a href={a.foto_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2">
                        <img src={a.foto_url} alt="Foto da avaliação" className="w-24 h-24 rounded-xl object-cover border border-borda" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {pedidoAberto && (
        <PedidoModal
          loja={loja}
          cliente={cliente}
          produtos={produtos}
          supabase={supabase}
          onFechar={() => setPedidoAberto(false)}
          onSucesso={(msg) => mostrarToast(msg, 'sucesso')}
          onErro={(msg) => mostrarToast(msg, 'erro')}
        />
      )}
    </ClienteLayout>
  )
}
