'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const CHAVE = 'commerly:cookies-ok'

// Aviso de cookies (boa prática de LGPD — a Política de Privacidade, seção 9,
// já explica que são só cookies necessários, mas isso não substitui um aviso
// visível na primeira visita). Montado no layout raiz, aparece em cima de
// qualquer página até o visitante confirmar; depois fica só em localStorage
// (sem backend, sem banco, é só "visto ou não visto" neste navegador).
export function CookieBanner() {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE) !== '1') setVisivel(true)
    } catch {
      // localStorage bloqueado (modo privado restrito etc.): não insiste.
    }
  }, [])

  function fechar() {
    try { localStorage.setItem(CHAVE, '1') } catch { /* melhor esforço */ }
    setVisivel(false)
  }

  if (!visivel) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-800 bg-gray-950/95 backdrop-blur px-4 py-4">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-gray-400 text-xs leading-relaxed flex-1">
          Usamos apenas cookies necessários ao funcionamento do app (manter sua sessão, proteger
          formulários). Não usamos cookies de publicidade nem de rastreamento entre sites. Veja a{' '}
          <Link href="/privacidade" className="text-blue-400 hover:text-blue-300 underline">
            Política de Privacidade
          </Link>.
        </p>
        <button
          onClick={fechar}
          className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          Entendi
        </button>
      </div>
    </div>
  )
}

export default CookieBanner
