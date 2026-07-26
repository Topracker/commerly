'use client'
import Link from 'next/link'
import { MapPin, Trophy, ArrowRight } from 'lucide-react'
import FormularioInteresseCidade from './FormularioInteresseCidade'

// Mostrado na busca quando a localização do cliente cai numa cidade onde o
// delivery ainda não foi ligado. Reaproveita o formulário de interesse do
// /expansao (mesmo componente, mesma rota) em vez de duplicar a captação.
//
// Não é uma tela de erro: o cliente continua com o app inteiro à disposição —
// isto aparece no lugar da LISTA de lojas, dentro do layout normal, e o resto
// da navegação segue funcionando.

export type CidadeInfo = {
  cidade: string | null
  uf: string | null
  ranking: { posicao: number; pontos: number; meta_pontos: number } | null
}

export default function CidadeIndisponivel({ info }: { info: CidadeInfo }) {
  const nomeCidade = info.cidade || 'sua cidade'
  const rotulo = info.cidade ? `${info.cidade}${info.uf ? `/${info.uf}` : ''}` : 'sua cidade'
  const r = info.ranking
  const pct = r && r.meta_pontos > 0 ? Math.min(100, Math.round((r.pontos / r.meta_pontos) * 100)) : null

  return (
    <div className="bg-card border border-borda rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-acento/15 flex items-center justify-center shrink-0">
          <MapPin size={20} className="text-acento" />
        </div>
        <div className="min-w-0">
          <h2 className="text-white font-semibold text-lg">
            A Commerly ainda não chegou em {nomeCidade}
          </h2>
          <p className="text-gray-400 text-sm mt-1 leading-relaxed">
            Por enquanto o delivery funciona só nas cidades onde já temos lojas e entregadores
            parceiros. Você pode continuar usando o app normalmente — só não dá para fazer
            pedidos em {rotulo} ainda.
          </p>
        </div>
      </div>

      {/* Progresso da cidade, quando ela já pontuou: transforma a negativa em
          algo que a pessoa pode influenciar. */}
      {r && (
        <div className="bg-superficie border border-borda rounded-xl p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white font-medium flex items-center gap-2">
              <Trophy size={15} className="text-acento" /> {rotulo} está em {r.posicao}º no ranking
            </span>
            <span className="text-gray-500 text-xs tabular-nums">
              {r.pontos}/{r.meta_pontos} pts{pct !== null ? ` · ${pct}%` : ''}
            </span>
          </div>
          {pct !== null && (
            <div className="h-2 bg-elevado rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-acento" style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className="text-gray-500 text-xs mt-2">
            As cidades no topo do ranking entram primeiro.
          </p>
        </div>
      )}

      <div>
        <p className="text-white font-semibold text-sm mb-1">Avise quando chegar aqui</p>
        <p className="text-gray-500 text-xs mb-3">
          Deixe seu e-mail: a gente te chama assim que abrir em {rotulo}.
        </p>
        <FormularioInteresseCidade
          cidadeInicial={info.cidade || ''}
          ufInicial={info.uf || ''}
          cidadeFixa={!!info.cidade}
        />
      </div>

      <Link href="/expansao"
        className="inline-flex items-center justify-center gap-2 text-sm text-acento hover:underline">
        Quero trazer a Commerly pra minha cidade <ArrowRight size={15} />
      </Link>
    </div>
  )
}
