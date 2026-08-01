'use client'
import { useEffect } from 'react'
import { createClient } from '../supabase'
import { CHAVE_INDICACAO, codigoDeConvite } from '../lib/convite'

// ============================================================================
// Confirma a indicação pendente (link /convite/[codigo]) assim que o convidado
// entra numa sessão autenticada — em QUALQUER papel.
// ----------------------------------------------------------------------------
// Isto morava dentro do PainelGamificacao, que só existe em três dashboards
// (comerciante, cliente, entregador). Quem se cadastrava como FORNECEDOR nunca
// passava por lá, e a indicação simplesmente não era creditada. Pior: quem caía
// direto em outra página do app também não. Montado no layout raiz, o resgate
// deixa de depender de qual tela o convidado abriu primeiro.
//
// O trabalho pesado (idempotência, papel do indicado, recompensa) é todo do
// /api/indicacao/registrar — aqui só entregamos o código uma vez.
// ============================================================================

export default function IndicacaoClaim() {
  useEffect(() => {
    let cancelado = false
    const supabase = createClient()

    async function resgatar() {
      // `?ref=CODIGO` em QUALQUER rota do app é capturado aqui e guardado — é o
      // que faz o convite sobreviver a ser aberto num aparelho diferente
      // daquele onde o localStorage foi escrito. Sem `?ref=`, cai no código
      // guardado (visita ao /convite ou campo de convite no cadastro).
      const cod = codigoDeConvite()
      if (!cod) return

      // Sem sessão não há a quem creditar; o código fica guardado para a
      // próxima montagem, já logado.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelado) return

      try {
        const r = await fetch('/api/indicacao/registrar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo: cod }),
        })
        // Só descarta o código quando o servidor respondeu. Se a rede caiu no
        // meio, apagar aqui perderia a indicação para sempre.
        if (r.ok) localStorage.removeItem(CHAVE_INDICACAO)
      } catch {
        /* tenta de novo na próxima navegação */
      }
    }

    resgatar()

    // O cadastro inteiro (login -> /onboarding -> /planos) é navegação de
    // cliente: o layout raiz NÃO remonta, então só o `resgatar()` acima rodava
    // — e ele roda ainda deslogado, na tela de login, quando não há a quem
    // creditar. Resultado: o convidado se cadastrava, o código ficava guardado
    // no localStorage e a indicação só nascia se ele por acaso recarregasse a
    // página. Reagir ao login fecha essa janela.
    const timers: ReturnType<typeof setTimeout>[] = []
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento !== 'SIGNED_IN' && evento !== 'INITIAL_SESSION') return
      // `setTimeout(0)` NÃO é cosmético: o supabase-js segura o lock de auth
      // enquanto este callback roda, e `resgatar()` chama `auth.getUser()`, que
      // disputa o MESMO lock — chamado direto aqui, o resgate trava (deadlock
      // conhecido do v2; a orientação oficial é não usar métodos de auth dentro
      // do callback). Sair para a próxima volta do event loop devolve o lock
      // antes do resgate começar.
      timers.push(setTimeout(() => { void resgatar() }, 0))
    })

    return () => {
      cancelado = true
      timers.forEach(clearTimeout)
      sub.subscription.unsubscribe()
    }
  }, [])

  return null
}
