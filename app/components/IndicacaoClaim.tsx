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
    return () => { cancelado = true }
  }, [])

  return null
}
