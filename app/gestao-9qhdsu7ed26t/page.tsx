import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { autorizarAdmin } from '../lib/admin'
import PainelAdmin from './PainelAdmin'

// ============================================================================
// PAINEL MASTER — porta de entrada (server component)
// ----------------------------------------------------------------------------
// Antes esta página era 100% client: renderizava para QUALQUER visitante,
// inclusive anônimo, e só ficava vazia porque a API respondia 403. Com dado
// financeiro dentro, "renderiza mas fica vazio" não serve — agora a checagem
// acontece ANTES de qualquer HTML sair, e quem não é o dono recebe 404.
//
// `noindex` em vez de entrada no robots.ts: o robots.txt é PÚBLICO, então
// listar o caminho lá seria justamente publicar o endereço que queremos
// discreto. A meta tag mantém o buscador fora sem anunciar nada.
// ============================================================================

export const metadata: Metadata = {
  title: 'Gestão',
  robots: { index: false, follow: false, nocache: true },
}

// Sessão por requisição: nada de cache entre usuários.
export const dynamic = 'force-dynamic'

export default async function PaginaGestao() {
  const r = await autorizarAdmin()

  // Só o dono chega a ver uma tela diferente de 404 — e mesmo ele, sem o
  // segundo fator, não passa daqui. Como o uuid já casou, dizer o motivo não
  // entrega nada a ninguém.
  if (!r.ok && r.motivo === 'mfa-requerida') {
    return (
      <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <ShieldAlert size={28} className="text-amber-300 mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">Verificação em duas etapas</p>
          <p className="text-gray-400 text-sm mb-4">
            Esta área exige o segundo fator. Entre novamente concluindo a verificação
            do seu autenticador para continuar.
          </p>
          <Link href="/login" className="text-acento text-sm">Ir para o login</Link>
        </div>
      </main>
    )
  }

  // Qualquer outro motivo (anônimo, conta errada, env não configurada) responde
  // exatamente como um caminho inexistente.
  if (!r.ok) notFound()

  return <PainelAdmin />
}
