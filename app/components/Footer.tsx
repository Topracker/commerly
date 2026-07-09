import Link from 'next/link'
import { CONTATO, EMPRESA, LINKS_RODAPE, PRODUTO } from '../lib/legal'

/**
 * Rodapé global (montado no layout raiz, aparece em todas as páginas).
 * `mt-auto` encosta no fim da viewport quando a página é curta — o <body> é
 * `min-h-full flex flex-col`.
 */
export function Footer() {
  const ano = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-gray-900 bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-gray-300 text-sm font-semibold">{PRODUTO.nome}</p>
            <p className="text-gray-600 text-xs mt-0.5">
              © {ano} {EMPRESA.nome}. Todos os direitos reservados.
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LINKS_RODAPE.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="text-gray-500 hover:text-gray-300 text-xs transition"
              >
                {l.label}
              </Link>
            ))}
            <a
              href={`mailto:${CONTATO.email}`}
              className="text-gray-500 hover:text-gray-300 text-xs transition"
            >
              {CONTATO.email}
            </a>
          </nav>
        </div>
      </div>
    </footer>
  )
}
