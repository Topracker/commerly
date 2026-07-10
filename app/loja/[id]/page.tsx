import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '../../lib/supabase-admin'
import { Estrelas } from '../../components/Estrelas'
import { MiniMapa } from '../../components/MiniMapa'
import { RatingBadge } from '../../components/RatingBadge'
import { ProdutoCard } from '../../components/ProdutoCard'
import { Phone, AtSign, MapPin, Clock, Globe, UtensilsCrossed, MessageCircle } from 'lucide-react'
import { isDelivery } from '../../lib/pedidosClientes'
import { VIEW_AVAL_LOJAS } from '../../lib/avaliacoes'
import { SeloVerificado } from '../../components/SeloVerificado'
import { linkWhatsApp, textoPedido, whatsappDaLoja } from '../../lib/whatsapp'

// Página pública da loja — acessível sem login. Lê os dados via service role
// (a view lojas_publicas é pública, mas produtos/avaliações têm RLS para
// usuários autenticados) e expõe apenas as colunas seguras.
export const dynamic = 'force-dynamic'

type Loja = {
  id: string
  nome: string
  tipo: string
  localizacao: string | null
  telefone: string | null
  instagram: string | null
  horario: string | null
  latitude: number | null
  longitude: number | null
  fotos_fachada: string[] | null
  website_url: string | null
  whatsapp_business: string | null
}

async function carregar(id: string) {
  const supabase = createAdminClient()
  const [lojaRes, prodRes, avalRes] = await Promise.all([
    supabase.from('lojas_publicas').select('id, nome, tipo, localizacao, telefone, instagram, horario, latitude, longitude, fotos_fachada, website_url, whatsapp_business').eq('id', id).maybeSingle(),
    supabase.from('produtos').select('id, nome, preco_venda, imagem_url, categoria').eq('loja_id', id).gt('quantidade', 0),
    supabase.from(VIEW_AVAL_LOJAS).select('nota, comentario, created_at, foto_url, hash').eq('loja_id', id).order('created_at', { ascending: false }),
  ])

  const loja = lojaRes.data as Loja | null
  if (!loja) return null

  const avaliacoes = (avalRes.data || []) as { nota: number; comentario: string | null; created_at: string; foto_url: string | null; hash: string | null }[]
  const media = avaliacoes.length > 0
    ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length
    : 0

  return { loja, produtos: prodRes.data || [], avaliacoes, media }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const dados = await carregar(id)
  if (!dados) return { title: 'Loja não encontrada', robots: { index: false, follow: false } }

  const { loja } = dados
  const local = loja.localizacao ? ` · ${loja.localizacao}` : ''
  const descricao = `${loja.nome} — ${loja.tipo}${local}. Veja produtos, avaliações e fale direto pelo WhatsApp. Página no Commerly.`
  const url = `/loja/${id}`
  const foto = loja.fotos_fachada?.[0]

  return {
    title: loja.nome,
    description: descricao,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: `${loja.nome} — ${loja.tipo}`,
      description: descricao,
      url,
      locale: 'pt_BR',
      siteName: 'Commerly',
      images: foto ? [{ url: foto, alt: loja.nome }] : undefined,
    },
    twitter: {
      card: foto ? 'summary_large_image' : 'summary',
      title: `${loja.nome} — ${loja.tipo}`,
      description: descricao,
      images: foto ? [foto] : undefined,
    },
  }
}

export default async function LojaPublica({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const dados = await carregar(id)
  if (!dados) notFound()

  const { loja, produtos, avaliacoes, media } = dados
  const whatsapp = linkWhatsApp(whatsappDaLoja(loja), textoPedido(loja.nome))

  return (
    <main data-theme="dark" className="min-h-screen bg-gray-950 font-body">
      <header className="bg-card border-b border-borda px-4 py-3 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <p className="font-display text-white font-bold truncate">{loja.nome}</p>
          <span className="text-gray-500 text-sm shrink-0">Commerly</span>
        </div>
      </header>

      {/* HERO: fachada em tela cheia, com gradiente escuro subindo até o texto. */}
      <section className="relative h-[52vh] min-h-[300px] w-full overflow-hidden">
        {loja.fotos_fachada?.[0] ? (
          <img src={loja.fotos_fachada[0]} alt={loja.nome} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-elevado to-fundo textura-diagonal" />
        )}
        {/* Duas camadas: uma escurece o topo (legibilidade do header sticky),
            a outra ancora o texto na base. */}
        <div className="absolute inset-0 bg-gradient-to-b from-fundo/70 via-fundo/10 to-fundo" />

        <div className="absolute inset-x-0 bottom-0 max-w-2xl mx-auto px-4 pb-6">
          <div className="anima-subir flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-block text-[11px] bg-white/10 backdrop-blur border border-white/15 text-white/90 px-2.5 py-0.5 rounded-full mb-2">
                {loja.tipo}
              </span>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight drop-shadow-lg">
                {loja.nome}
              </h1>
              {loja.localizacao && (
                <p className="text-white/70 text-sm mt-1.5 flex items-center gap-1.5">
                  <MapPin size={14} className="shrink-0" />{loja.localizacao}
                </p>
              )}
            </div>
            {avaliacoes.length > 0 && (
              <div className="shrink-0"><RatingBadge media={media} total={avaliacoes.length} /></div>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-10">
        <div className="relative z-10 space-y-[18px]">
          {/* Cabeçalho da loja */}
          <div className="bg-card border border-borda rounded-2xl p-5">

            {/* A localização já aparece no hero — aqui só o que não está lá. */}
            <div className="flex flex-col gap-2 text-sm">
              {loja.horario && (
                <p className="text-gray-400 flex items-center gap-2.5"><Clock size={15} className="text-gray-500 shrink-0" />{loja.horario}</p>
              )}
              {loja.telefone && (
                <p className="text-gray-400 flex items-center gap-2.5"><Phone size={15} className="text-gray-500 shrink-0" />{loja.telefone}</p>
              )}
              {loja.instagram && (
                <p className="text-gray-400 flex items-center gap-2.5"><AtSign size={15} className="text-gray-500 shrink-0" />{loja.instagram}</p>
              )}
            </div>

            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} />
                Pedir pelo WhatsApp
              </a>
            )}

            {isDelivery(loja.tipo) && produtos.length > 0 && (
              <Link
                href={`/cardapio/${id}`}
                className="mt-2.5 w-full bg-azul hover:brightness-110 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <UtensilsCrossed size={18} />
                Ver cardápio
              </Link>
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

          <MiniMapa latitude={loja.latitude} longitude={loja.longitude} nome={loja.nome} />

          {/* Produtos */}
          {produtos.length > 0 && (
            <div className="bg-card border border-borda rounded-2xl p-4">
              <h2 className="font-display text-white font-semibold text-lg mb-3">
                Produtos disponíveis <span className="text-gray-500 font-normal text-sm">({produtos.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {produtos.map((p: any) => <ProdutoCard key={p.id} produto={p} tipoLoja={loja.tipo} />)}
              </div>
            </div>
          )}

          {/* Avaliações */}
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

          <p className="text-center text-gray-600 text-xs pt-4">
            Página pública criada com <span className="text-gray-400">Commerly</span>
          </p>
        </div>
      </div>
    </main>
  )
}
