import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { ATUALIZADO_EM, temPendencias } from '../lib/legal'

type Props = {
  titulo: string
  subtitulo?: string
  /** Mostra "Atualizado em ..." — só faz sentido em documentos legais. */
  mostrarData?: boolean
  children: React.ReactNode
}

/**
 * Casca das páginas institucionais (/termos, /privacidade, /sobre, /suporte).
 * Quando os dados da empresa ainda têm placeholder, exibe um aviso — assim
 * ninguém publica um documento legal pela metade sem perceber.
 */
export function PaginaLegal({ titulo, subtitulo, mostrarData = false, children }: Props) {
  return (
    <main className="min-h-screen bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm transition mb-6">
          <ArrowLeft size={15} /> Voltar
        </Link>

        <h1 className="text-3xl font-bold text-white">{titulo}</h1>
        {subtitulo && <p className="text-gray-400 mt-2">{subtitulo}</p>}
        {mostrarData && (
          <p className="text-gray-600 text-xs mt-3">Última atualização: {ATUALIZADO_EM}</p>
        )}

        {mostrarData && temPendencias() && (
          <div className="mt-6 flex items-start gap-2 bg-amber-950/50 border border-amber-800 rounded-xl p-3">
            <AlertTriangle size={15} className="text-amber-300 shrink-0 mt-0.5" />
            <p className="text-amber-200/90 text-xs leading-relaxed">
              <strong>Rascunho.</strong> Este documento contém campos entre colchetes que ainda
              precisam ser preenchidos (razão social, CNPJ, endereço) e deve passar por revisão
              jurídica antes do lançamento.
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-6">{children}</div>
      </div>
    </main>
  )
}

/** Seção numerada de um documento legal. */
export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-white font-semibold text-lg mb-2">{titulo}</h2>
      <div className="flex flex-col gap-2 text-gray-400 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

/** Lista com marcadores, no tom das demais telas. */
export function Lista({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5 pl-1">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-gray-600 shrink-0">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
