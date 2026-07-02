import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '../../lib/supabase-admin'
import { Estrelas } from '../../components/Estrelas'
import { MiniMapa } from '../../components/MiniMapa'
import { FachadaBanner } from '../../components/FachadaBanner'
import { RatingBadge } from '../../components/RatingBadge'
import { ProdutoCard } from '../../components/ProdutoCard'
import { emojiNicho } from '../../lib/temaLoja'
import { Phone, AtSign, MapPin, Clock } from 'lucide-react'

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
}

async function carregar(id: string) {
  const supabase = createAdminClient()
  const [lojaRes, prodRes, avalRes] = await Promise.all([
    supabase.from('lojas_publicas').select('id, nome, tipo, localizacao, telefone, instagram, horario, latitude, longitude, fotos_fachada').eq('id', id).maybeSingle(),
    supabase.from('produtos').select('id, nome, preco_venda, imagem_url, categoria').eq('loja_id', id).gt('quantidade', 0),
    supabase.from('avaliacoes_lojas').select('nota, comentario, created_at').eq('loja_id', id).order('created_at', { ascending: false }),
  ])

  const loja = lojaRes.data as Loja | null
  if (!loja) return null

  const avaliacoes = (avalRes.data || []) as { nota: number; comentario: string | null; created_at: string }[]
  const media = avaliacoes.length > 0
    ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length
    : 0

  return { loja, produtos: prodRes.data || [], avaliacoes, media }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const dados = await carregar(id)
  if (!dados) return { title: 'Loja não encontrada — Commerly' }
  return {
    title: `${dados.loja.nome} — Commerly`,
    description: `${dados.loja.tipo}${dados.loja.localizacao ? ' · ' + dados.loja.localizacao : ''}`,
  }
}

export default async function LojaPublica({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const dados = await carregar(id)
  if (!dados) notFound()

  const { loja, produtos, avaliacoes, media } = dados
  const whatsapp = loja.telefone
    ? `https://wa.me/55${loja.telefone.replace(/\D/g, '')}?text=${encodeURIComponent('Olá! Vi seu comércio no Commerly.')}`
    : null

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <p className="text-white font-bold truncate">{loja.nome}</p>
          <span className="text-gray-500 text-sm shrink-0">Commerly</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        <FachadaBanner fotos={loja.fotos_fachada} nome={loja.nome} tipo={loja.tipo} />

        {/* Cabeçalho da loja */}
        <div className="bg-gradient-to-b from-gray-900 to-gray-900/60 border border-gray-800 rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-2xl shrink-0">{emojiNicho(loja.tipo)}</span>
                <h1 className="text-2xl font-bold text-white truncate">{loja.nome}</h1>
              </div>
              <span className="inline-block text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full mt-1">{loja.tipo}</span>
            </div>
            {avaliacoes.length > 0 && <RatingBadge media={media} total={avaliacoes.length} />}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            {loja.localizacao && (
              <p className="text-gray-400 flex items-center gap-2"><MapPin size={14} className="text-gray-500" />{loja.localizacao}</p>
            )}
            {loja.horario && (
              <p className="text-gray-400 flex items-center gap-2"><Clock size={14} className="text-gray-500" />{loja.horario}</p>
            )}
            {loja.telefone && (
              <p className="text-gray-400 flex items-center gap-2"><Phone size={14} className="text-gray-500" />{loja.telefone}</p>
            )}
            {loja.instagram && (
              <p className="text-gray-400 flex items-center gap-2"><AtSign size={14} className="text-gray-500" />{loja.instagram}</p>
            )}
          </div>

          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              <Phone size={18} />
              Falar no WhatsApp
            </a>
          )}
        </div>

        <MiniMapa latitude={loja.latitude} longitude={loja.longitude} nome={loja.nome} />

        {/* Produtos */}
        {produtos.length > 0 && (
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 mb-4">
            <h2 className="text-white font-semibold text-lg mb-3">Produtos disponíveis</h2>
            <div className="grid grid-cols-2 gap-3">
              {produtos.map((p: any) => <ProdutoCard key={p.id} produto={p} tipoLoja={loja.tipo} />)}
            </div>
          </div>
        )}

        {/* Avaliações */}
        {avaliacoes.length > 0 && (
          <div className="mb-4">
            <h2 className="text-white font-semibold text-lg mb-3">Avaliações ({avaliacoes.length})</h2>
            <div className="flex flex-col gap-3">
              {avaliacoes.map((a, i) => (
                <div key={i} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Estrelas nota={a.nota} tamanho="text-base" />
                    <span className="text-gray-500 text-xs">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {a.comentario && <p className="text-gray-300 text-sm">{a.comentario}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-gray-600 text-xs mt-8">
          Página pública criada com <span className="text-gray-400">Commerly</span>
        </p>
      </div>
    </main>
  )
}
