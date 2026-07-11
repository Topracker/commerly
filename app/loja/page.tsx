import type { Metadata } from 'next'
import { MarketingShell } from '../components/MarketingShell'

export const metadata: Metadata = {
  title: 'Loja Oficial Commerly',
  description: 'Bolsa, jaqueta, boné, camiseta, squeeze, caneca, adesivos e chaveiro da Commerly.',
  alternates: { canonical: '/loja' },
}

const PRODUTOS = [
  { nome: 'Bolsa térmica', emoji: '🎒' },
  { nome: 'Jaqueta', emoji: '🧥' },
  { nome: 'Boné', emoji: '🧢' },
  { nome: 'Camiseta', emoji: '👕' },
  { nome: 'Squeeze', emoji: '🥤' },
  { nome: 'Caneca', emoji: '☕' },
  { nome: 'Adesivos', emoji: '✨' },
  { nome: 'Chaveiro', emoji: '🔑' },
]

export default function LojaOficial() {
  return (
    <MarketingShell
      eyebrow="Loja oficial"
      titulo="Vista a Commerly"
      subtitulo="Produtos oficiais para comerciantes e entregadores parceiros. Em breve por aqui."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PRODUTOS.map(p => (
          <div key={p.nome} className="bg-card border border-borda rounded-2xl p-5 text-center">
            <div className="text-4xl mb-2">{p.emoji}</div>
            <p className="text-white text-sm font-medium">{p.nome}</p>
            <p className="text-gray-500 text-xs mt-1">em breve</p>
          </div>
        ))}
      </div>
    </MarketingShell>
  )
}
