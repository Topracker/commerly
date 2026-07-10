'use client'
// #7 Selo de avaliação verificada.
//
// O texto aqui foi escrito com cuidado. O selo NÃO diz "impossível falsificar"
// nem "blockchain", porque nenhuma das duas coisas é verdade: um servidor com o
// segredo pode reescrever a cadeia. O que ele diz é o que de fato garantimos —
// a avaliação foi assinada pelo servidor e está encadeada à anterior, então
// alterá-la ou apagá-la quebra a verificação. Ver lib/integridade.ts.

import { useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'

/** Prefixo curto do hash (o lib/integridade.ts equivalente roda no servidor). */
function curto(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`
}

export function SeloVerificado({ hash }: { hash: string | null | undefined }) {
  const [aberto, setAberto] = useState(false)

  // Avaliações anteriores à feature não têm hash. Nada de selo — não vamos
  // carimbar de "verificada" uma linha que nunca foi assinada.
  if (!hash) return null

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title="Avaliação verificada pelo Commerly"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-500/20"
      >
        <ShieldCheck className="h-3 w-3" />
        Verificada
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setAberto(false)}>
          <div className="w-full max-w-md rounded-2xl bg-gray-900 p-5" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-base font-bold text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Avaliação verificada
              </h3>
              <button onClick={() => setAberto(false)} className="rounded-lg p-1 text-gray-400 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-gray-300">
              Esta avaliação foi assinada pelo servidor do Commerly no momento em que foi
              enviada, e está encadeada à avaliação anterior. Se alguém alterar o texto, a
              nota ou apagar a avaliação, a verificação da cadeia passa a falhar — a
              adulteração fica detectável.
            </p>

            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              Avaliações não são editadas no lugar: quando o cliente corrige a dele, uma nova
              entra e a antiga permanece registrada.
            </p>

            <div className="mt-4 rounded-lg bg-black/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Assinatura</p>
              <code className="break-all font-mono text-xs text-emerald-400">{curto(hash)}</code>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              Transparência: a assinatura é gerada e conferida pelos nossos servidores. Ela
              protege contra adulteração por terceiros e contra remoção silenciosa, mas não é
              um registro público independente do Commerly.
            </p>

            <a
              href="/api/avaliacoes/verificar?alvo=loja"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block rounded-xl border border-white/10 py-2.5 text-center text-sm text-gray-300 transition hover:bg-white/5"
            >
              Verificar a cadeia agora
            </a>
          </div>
        </div>
      )}
    </>
  )
}
