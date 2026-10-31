import type { Metadata } from 'next'
import Link from 'next/link'
import { TEXTO_PAUSA, ehModuloPausavel } from '../lib/pausa'

// Destino do proxy quando uma página que INICIA algo está com a chave do
// módulo desligada (ver app/lib/pausa.ts). Pública e sem sessão: só explica.

export const metadata: Metadata = {
  title: 'Pausado no momento',
  robots: { index: false },
}

export default async function Pausado({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { modulo } = await searchParams
  const info = ehModuloPausavel(modulo) ? TEXTO_PAUSA[modulo] : null

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-10">
      <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md text-center">
        <div className="text-4xl mb-3" aria-hidden>⏸️</div>
        <h1 className="text-white font-bold text-xl mb-2">{info?.titulo ?? 'Pausado no momento'}</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          {info?.texto ?? 'Esta parte do Commerly está pausada agora. O que já está em andamento continua normalmente.'}
        </p>
        <div className="flex flex-col gap-2">
          {info && (
            <Link href={info.voltar.href} className="block bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition">
              {info.voltar.label}
            </Link>
          )}
          <Link href="/" className="block bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-3 rounded-xl transition text-sm">
            Ir para o início
          </Link>
        </div>
        <p className="text-gray-600 text-xs mt-5">Voltamos em breve.</p>
      </div>
    </main>
  )
}
