// #7 Escrita das avaliações com integridade verificável.
//
// O cliente não escreve mais direto na tabela (as policies de INSERT/UPDATE/
// DELETE foram removidas). Toda avaliação entra por aqui, com service role,
// para receber `seq`, `hash_anterior` e `hash` — ver lib/integridade.ts.
//
// Editar uma avaliação NÃO altera a linha original: cria-se uma nova apontando
// para ela via `substitui_id`. A antiga continua na cadeia; as leituras usam a
// view `*_atuais`, que só mostra a última versão.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-admin'
import { rateLimit } from '../../lib/rate-limit'
import { supabaseDaRota, usuarioDaRota, clienteDoUsuario } from '../../lib/rotaSupabase'
import { calcularHash, HASH_GENESIS, type ConteudoAvaliacao } from '../../lib/integridade'

export const runtime = 'nodejs'

/** Duas escritas simultâneas disputam o mesmo `seq`; a perdedora retenta. */
const MAX_TENTATIVAS = 4
const CODIGO_UNIQUE_VIOLATION = '23505'

/**
 * Só estes conflitos significam "outra escrita chegou primeiro na cadeia".
 * Um conflito em `*_atual_uidx` é o cliente tentando avaliar duas vezes o mesmo
 * alvo — retentar não resolve, e mascará-lo como 409 de concorrência esconderia
 * o erro real do usuário.
 */
const CONFLITOS_DE_CADEIA = ['_seq_uidx', '_hash_ant_uidx']

function ehConflitoDeCadeia(mensagem: string): boolean {
  return CONFLITOS_DE_CADEIA.some(c => mensagem.includes(c))
}

type Alvo = 'loja' | 'entregador'

const CONFIG: Record<Alvo, { tabela: string; coluna: string }> = {
  loja: { tabela: 'avaliacoes_lojas', coluna: 'loja_id' },
  entregador: { tabela: 'avaliacoes_entregadores', coluna: 'entregador_id' },
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  const alvo: Alvo = body?.alvo === 'entregador' ? 'entregador' : 'loja'
  const alvoId = typeof body?.alvo_id === 'string' ? body.alvo_id : ''
  const nota = Number(body?.nota)
  const comentario = typeof body?.comentario === 'string' && body.comentario.trim()
    ? body.comentario.trim().slice(0, 1000)
    : null
  const fotoUrl = typeof body?.foto_url === 'string' ? body.foto_url.slice(0, 500) : null
  const pedidoId = typeof body?.pedido_id === 'string' ? body.pedido_id : null
  const substituiId = typeof body?.substitui_id === 'string' ? body.substitui_id : null

  if (!alvoId) return NextResponse.json({ erro: 'Alvo da avaliação ausente.' }, { status: 400 })
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return NextResponse.json({ erro: 'Nota deve ser de 1 a 5.' }, { status: 400 })
  }

  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ erro: 'Faça login para avaliar.' }, { status: 401 })

  const cliente = await clienteDoUsuario(supabase, user.id)
  if (!cliente) return NextResponse.json({ erro: 'Perfil de cliente não encontrado.' }, { status: 403 })

  if (!rateLimit(`avaliacao:${user.id}`, 20, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas avaliações seguidas.' }, { status: 429 })
  }

  if (!process.env.AVALIACOES_HMAC_SECRET) {
    console.error('[avaliacoes] AVALIACOES_HMAC_SECRET ausente')
    return NextResponse.json({ erro: 'Avaliações indisponíveis no momento.' }, { status: 500 })
  }

  const { tabela, coluna } = CONFIG[alvo]
  const admin = createAdminClient()

  // Editar: a avaliação substituída precisa ser deste cliente e ainda não ter
  // sido substituída (o índice único em substitui_id garante o segundo ponto).
  if (substituiId) {
    const { data: original } = await admin
      .from(tabela).select('id, cliente_id, substituida').eq('id', substituiId).maybeSingle()
    if (!original) return NextResponse.json({ erro: 'Avaliação original não encontrada.' }, { status: 404 })
    if (original.cliente_id !== cliente.id) {
      return NextResponse.json({ erro: 'Você só pode editar a sua avaliação.' }, { status: 403 })
    }
    if (original.substituida) {
      return NextResponse.json({ erro: 'Esta avaliação já foi substituída.' }, { status: 409 })
    }

    // Marcamos ANTES de inserir: o índice único parcial (cliente_id, alvo_id)
    // vale só para a versão atual, então a antiga precisa sair de cena primeiro.
    // `substituida` não entra no hash — a cadeia continua fechando.
    const { error: marcaErr } = await admin
      .from(tabela).update({ substituida: true }).eq('id', substituiId).eq('substituida', false)
    if (marcaErr) {
      console.error('[avaliacoes] falha ao marcar substituída:', marcaErr.message)
      return NextResponse.json({ erro: 'Não foi possível editar a avaliação.' }, { status: 500 })
    }
  }

  /** Desfaz a marcação se o insert da nova versão não vingar. */
  const reverterMarcacao = async () => {
    if (!substituiId) return
    await admin.from(tabela).update({ substituida: false }).eq('id', substituiId)
  }

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    // Último elo da cadeia. `seq` é a ordem total; `hash` pode ser null nas
    // linhas legadas, anteriores à feature — nesse caso a cadeia recomeça.
    const { data: ultimo } = await admin
      .from(tabela).select('seq, hash').order('seq', { ascending: false }).limit(1).maybeSingle()

    const seq = (ultimo?.seq ?? 0) + 1
    const hashAnterior: string = ultimo?.hash ?? HASH_GENESIS
    const createdAt = new Date().toISOString()

    const conteudo: ConteudoAvaliacao = {
      seq, cliente_id: cliente.id, alvo_id: alvoId, nota, comentario, created_at: createdAt,
    }

    let hash: string
    try { hash = calcularHash(conteudo, hashAnterior) } catch (e) {
      console.error('[avaliacoes] falha ao calcular hash:', e)
      await reverterMarcacao()
      return NextResponse.json({ erro: 'Avaliações indisponíveis no momento.' }, { status: 500 })
    }

    const linha: Record<string, unknown> = {
      cliente_id: cliente.id,
      [coluna]: alvoId,
      nota,
      comentario,
      created_at: createdAt,
      seq,
      hash,
      // Numa cadeia que ainda não começou gravamos null, não 'genesis', para
      // o índice único parcial em hash_anterior não colidir na primeira linha.
      hash_anterior: ultimo?.hash ?? null,
      substitui_id: substituiId,
    }
    if (alvo === 'loja' && fotoUrl) linha.foto_url = fotoUrl
    if (alvo === 'entregador' && pedidoId) linha.pedido_id = pedidoId

    const { data, error } = await admin.from(tabela).insert(linha).select('id, hash').single()

    if (!error) return NextResponse.json({ id: data.id, hash: data.hash, verificada: true })

    // Corrida na cadeia: outro insert pegou o mesmo seq/hash_anterior. Relê e refaz.
    if (error.code === CODIGO_UNIQUE_VIOLATION && ehConflitoDeCadeia(error.message)) continue

    await reverterMarcacao()

    if (error.code === CODIGO_UNIQUE_VIOLATION) {
      // Já existe avaliação atual deste cliente para este alvo.
      return NextResponse.json({ erro: 'Você já avaliou. Edite a avaliação existente.' }, { status: 409 })
    }

    console.error('[avaliacoes] insert falhou:', error.code, error.message)
    return NextResponse.json({ erro: 'Não foi possível salvar a avaliação.' }, { status: 500 })
  }

  await reverterMarcacao()
  console.error('[avaliacoes] esgotou tentativas de encadear')
  return NextResponse.json({ erro: 'Muitas avaliações ao mesmo tempo. Tente de novo.' }, { status: 409 })
}
