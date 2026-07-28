'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Gift } from 'lucide-react'
import { lerCodigoDeConvite, guardarCodigo, normalizarCodigo } from '../lib/convite'

// Campo OPCIONAL de código de convite, usado nos cadastros dos quatro papéis
// (comerciante, cliente, entregador, fornecedor).
//
// Vem pré-preenchido quando há `?ref=` na URL ou um código guardado da visita
// ao /convite. Digitar aqui é o que salva o caso que mais acontecia: receber o
// convite no celular e se cadastrar no computador — o localStorage não
// atravessa aparelhos, e a indicação era perdida sem ninguém perceber.
//
// O componente só GUARDA o código; quem resgata é <IndicacaoClaim/> no layout
// raiz, assim que a sessão existir. Por isso ele não precisa ser costurado nas
// funções de cadastro de cada página — basta estar montado no formulário.

// URL e localStorage são estado EXTERNO: `useSyncExternalStore` lê os dois sem
// descasar a hidratação (no servidor o snapshot é vazio) e sem o setState dentro
// de efeito que causaria render em cascata. Nada aqui muda depois do mount, então
// o `subscribe` não precisa notificar ninguém.
const semInscricao = () => () => {}
const noServidor = () => ''

export default function CampoConvite({ className }: { className?: string }) {
  const doLink = useSyncExternalStore(semInscricao, lerCodigoDeConvite, noServidor)
  // `null` = o usuário ainda não digitou nada; vale o que veio do link.
  const [digitado, setDigitado] = useState<string | null>(null)
  const codigo = digitado ?? doLink

  // Persistir é escrever num sistema externo — o lugar certo para isso é um
  // efeito. Cobre o código que chegou pela URL sem ter passado pelo /convite.
  useEffect(() => { if (codigo) guardarCodigo(codigo) }, [codigo])

  return (
    <div>
      <input
        type="text"
        autoComplete="off"
        inputMode="text"
        placeholder="Código de convite (opcional)"
        value={codigo}
        onChange={e => setDigitado(normalizarCodigo(e.target.value))}
        className={`${className || ''} font-mono tracking-widest uppercase`}
      />
      {digitado === null && doLink && (
        <p className="text-acento text-xs mt-1.5 flex items-center gap-1.5">
          <Gift size={13} /> Convite aplicado — quem te trouxe vai ser creditado.
        </p>
      )}
    </div>
  )
}
