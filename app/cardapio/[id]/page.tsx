import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '../../lib/supabase-admin'
import { FachadaBanner } from '../../components/FachadaBanner'
import { emojiCategoria, corAcentoNicho } from '../../lib/temaLoja'
import { linkWhatsApp, textoPedidoCardapio, whatsappDaLoja } from '../../lib/whatsapp'
import { MapPin, Clock, Phone, ShoppingBag, UtensilsCrossed, MessageCircle } from 'lucide-react'

// Cardápio digital público — acessível sem login (ideal para QR code na mesa/
// balcão). Mostra a loja e todos os produtos disponíveis agrupados por
// categoria, com foto/emoji, nome, descrição e preço. CTA "Fazer pedido" leva
// ao fluxo de pedido do cliente.
export const dynamic = 'force-dynamic'

type Loja = {
  id: string
  nome: string
  tipo: string
  localizacao: string | null
  telefone: string | null
  horario: string | null
  fotos_fachada: string[] | null
  whatsapp_business: string | null
}

type Produto = {
  id: string
  nome: string
  preco_venda: number
  imagem_url: string | null
  categoria: string | null
  descricao?: string | null
}

async function carregar(id: string) {
  const supabase = createAdminClient()
  const [lojaRes, prodRes, promoRes] = await Promise.all([
    supabase
      .from('lojas_publicas')
      .select('id, nome, tipo, localizacao, telefone, horario, fotos_fachada, whatsapp_business')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('produtos')
      .select('id, nome, preco_venda, imagem_url, categoria')
      .eq('loja_id', id)
      .gt('quantidade', 0)
      .order('categoria', { ascending: true })
      .order('nome', { ascending: true }),
    // Promoções ativas (leitura pública) — o cardápio mostra o preço com desconto.
    supabase
      .from('promocoes')
      .select('produto_id, desconto_pct, preco_promocional')
      .eq('loja_id', id)
      .eq('ativa', true),
  ])

  const loja = lojaRes.data as Loja | null
  if (!loja) return null

  // produto_id -> promoção ativa (índice único parcial garante no máximo uma).
  const promocoes = new Map<string, { desconto_pct: number; preco_promocional: number }>(
    (promoRes.data || []).map((p: { produto_id: string; desconto_pct: number; preco_promocional: number }) =>
      [p.produto_id, { desconto_pct: p.desconto_pct, preco_promocional: Number(p.preco_promocional) }]),
  )

  // Agrupa por categoria preservando a ordem de chegada (já ordenada no SQL).
  const produtos = (prodRes.data || []) as Produto[]
  const grupos: { categoria: string; itens: Produto[] }[] = []
  for (const p of produtos) {
    const cat = p.categoria?.trim() || 'Cardápio'
    let g = grupos.find((x) => x.categoria === cat)
    if (!g) { g = { categoria: cat, itens: [] }; grupos.push(g) }
    g.itens.push(p)
  }

  return { loja, grupos, total: produtos.length, promocoes }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const dados = await carregar(id)
  if (!dados) return { title: 'Cardápio não encontrado', robots: { index: false, follow: false } }

  const { loja } = dados
  const descricao = `Veja o cardápio de ${loja.nome} e faça seu pedido pelo Commerly.`
  const url = `/cardapio/${id}`
  const foto = loja.fotos_fachada?.[0]

  return {
    title: `Cardápio · ${loja.nome}`,
    description: descricao,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: `Cardápio · ${loja.nome}`,
      description: descricao,
      url,
      locale: 'pt_BR',
      siteName: 'Commerly',
      images: foto ? [{ url: foto, alt: loja.nome }] : undefined,
    },
    twitter: {
      card: foto ? 'summary_large_image' : 'summary',
      title: `Cardápio · ${loja.nome}`,
      description: descricao,
      images: foto ? [foto] : undefined,
    },
  }
}

export default async function CardapioPublico({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const dados = await carregar(id)
  if (!dados) notFound()

  const { loja, grupos, total, promocoes } = dados
  const acento = corAcentoNicho(loja.tipo)

  // Texto do WhatsApp: os produtos disponíveis, já com o preço promocional
  // quando houver — é o preço que o cliente vê na tela.
  const itensWhatsapp = grupos.flatMap(g => g.itens).map(p => ({
    nome: p.nome,
    preco: promocoes.get(p.id)?.preco_promocional ?? parseFloat(String(p.preco_venda)),
  }))
  const whatsapp = linkWhatsApp(whatsappDaLoja(loja), textoPedidoCardapio(loja.nome, itensWhatsapp))

  return (
    <main className="min-h-screen bg-gray-950 font-body">
      <header className="bg-[#12161B]/90 backdrop-blur border-b border-[#232A32] px-4 py-3 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <UtensilsCrossed size={18} style={{ color: acento }} className="shrink-0" />
            <p className="font-display text-white font-bold truncate">{loja.nome}</p>
          </div>
          <span className="text-gray-500 text-xs shrink-0">Cardápio digital</span>
        </div>
      </header>

      {/* pb acompanha a altura da barra fixa (1 ou 2 botões) */}
      <div className={`max-w-2xl mx-auto px-4 pt-4 ${whatsapp ? 'pb-44' : 'pb-28'}`}>
        <FachadaBanner fotos={loja.fotos_fachada} nome={loja.nome} tipo={loja.tipo} />

        <div className="relative z-10 -mt-10 space-y-[18px]">
          {/* Cabeçalho da loja */}
          <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-5">
            <h1 className="font-display text-2xl font-bold text-white truncate">{loja.nome}</h1>
            <span
              className="inline-block text-xs border px-2.5 py-0.5 rounded-full mt-1.5"
              style={{ color: acento, borderColor: `${acento}55`, background: `${acento}14` }}
            >
              {loja.tipo}
            </span>
            <div className="flex flex-col gap-2 text-sm mt-3">
              {loja.localizacao && (
                <p className="text-gray-400 flex items-center gap-2.5"><MapPin size={15} className="text-gray-500 shrink-0" />{loja.localizacao}</p>
              )}
              {loja.horario && (
                <p className="text-gray-400 flex items-center gap-2.5"><Clock size={15} className="text-gray-500 shrink-0" />{loja.horario}</p>
              )}
              {loja.telefone && (
                <p className="text-gray-400 flex items-center gap-2.5"><Phone size={15} className="text-gray-500 shrink-0" />{loja.telefone}</p>
              )}
            </div>
          </div>

          {/* Produtos por categoria */}
          {total === 0 ? (
            <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-8 text-center">
              <p className="text-4xl mb-2">🍽️</p>
              <p className="text-gray-300 font-medium">Cardápio em preparo</p>
              <p className="text-gray-500 text-sm mt-1">Esta loja ainda não cadastrou produtos.</p>
            </div>
          ) : (
            grupos.map((g) => (
              <section key={g.categoria} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
                <h2 className="font-display text-white font-semibold text-lg mb-3 flex items-center gap-2">
                  <span>{emojiCategoria(g.categoria, loja.tipo)}</span>
                  {g.categoria}
                  <span className="text-gray-500 font-normal text-sm">({g.itens.length})</span>
                </h2>
                <div className="flex flex-col divide-y divide-[#232A32]">
                  {g.itens.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      {/* Foto ou emoji temático */}
                      {p.imagem_url ? (
                        <img
                          src={p.imagem_url}
                          alt={p.nome}
                          className="w-16 h-16 rounded-xl object-cover shrink-0 border border-[#232A32]"
                        />
                      ) : (
                        <div
                          className="w-16 h-16 rounded-xl shrink-0 flex items-center justify-center border border-[#232A32]"
                          style={{ background: `radial-gradient(circle at center, ${acento}2e 0%, transparent 70%)` }}
                        >
                          <span className="text-2xl">{emojiCategoria(p.categoria, loja.tipo)}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{p.nome}</p>
                        {p.descricao && <p className="text-gray-400 text-sm line-clamp-2">{p.descricao}</p>}
                        {!p.descricao && p.categoria && (
                          <p className="text-gray-500 text-xs truncate">{p.categoria}</p>
                        )}
                      </div>
                      {(() => {
                        const promo = promocoes.get(p.id)
                        const cheio = parseFloat(String(p.preco_venda))
                        if (!promo) {
                          return (
                            <p className="font-display font-bold text-[#6FD98F] shrink-0">
                              R$ {cheio.toFixed(2)}
                            </p>
                          )
                        }
                        return (
                          <div className="shrink-0 text-right">
                            <span className="inline-block text-[10px] font-bold bg-[#C1441E]/20 text-[#E0632C] px-1.5 py-0.5 rounded mb-0.5">
                              -{promo.desconto_pct}%
                            </span>
                            <p className="text-gray-500 text-xs line-through leading-none">R$ {cheio.toFixed(2)}</p>
                            <p className="font-display font-bold text-[#6FD98F]">
                              R$ {promo.preco_promocional.toFixed(2)}
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}

          <p className="text-center text-gray-600 text-xs pt-2">
            Cardápio digital by <span className="text-gray-400">Commerly</span>
          </p>
        </div>
      </div>

      {/* CTA fixo: pedido pelo app e, quando a loja tem número, pelo WhatsApp */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent px-4 pt-6 pb-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          <Link
            href={`/cliente/loja/${loja.id}`}
            className="w-full bg-[#C1441E] hover:bg-[#a83a19] text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-black/40"
          >
            <ShoppingBag size={19} />
            Fazer pedido
          </Link>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-black/40"
            >
              <MessageCircle size={19} />
              Pedir pelo WhatsApp
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
