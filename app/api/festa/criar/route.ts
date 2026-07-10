import { NextRequest, NextResponse } from 'next/server'
import { autenticarCliente, bodyDe } from '../_lib'
import { rateLimit } from '../../../lib/rate-limit'
import { distanciaKm } from '../../../lib/geo'
import { isDelivery } from '../../../lib/pedidosClientes'
import { gerarCodigoFesta, FESTA_MAX_LOJAS, FESTA_RAIO_LOJAS_KM } from '../../../lib/festas'

// Cria uma festa: nome, endereço único de entrega e as lojas participantes
// (até 3, a até 2 km umas das outras). Quem cria já entra como participante.
// O trigger festa_lojas_guard reforça os limites no banco — aqui validamos
// antes para dar um erro amigável e não deixar festa órfã.
export async function POST(request: NextRequest) {
  const auth = await autenticarCliente()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin, cliente } = auth.ctx

  if (!rateLimit(`festa-criar:${cliente.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })
  }

  const body = await bodyDe(request)
  const nome = String(body?.nome || '').trim()
  const endereco = String(body?.endereco_entrega || '').trim()
  const lat = Number(body?.entrega_latitude)
  const lng = Number(body?.entrega_longitude)
  const lojaIdsRaw: string[] = (Array.isArray(body?.loja_ids) ? body.loja_ids : [])
    .filter((x: any): x is string => typeof x === 'string' && !!x)
  const lojaIds: string[] = [...new Set<string>(lojaIdsRaw)]

  if (nome.length < 2 || nome.length > 60) {
    return NextResponse.json({ error: 'Dê um nome à festa (2 a 60 caracteres).' }, { status: 400 })
  }
  if (!endereco || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Confirme o endereço de entrega no mapa.' }, { status: 400 })
  }
  if (lojaIds.length < 1 || lojaIds.length > FESTA_MAX_LOJAS) {
    return NextResponse.json({ error: `Escolha de 1 a ${FESTA_MAX_LOJAS} lojas para a festa.` }, { status: 400 })
  }

  // Lojas: existem, são delivery e têm localização.
  const { data: lojas } = await admin
    .from('lojas').select('id, nome, tipo, latitude, longitude').in('id', lojaIds)
  if (!lojas || lojas.length !== lojaIds.length) {
    return NextResponse.json({ error: 'Alguma loja escolhida não foi encontrada.' }, { status: 404 })
  }
  for (const l of lojas) {
    if (!isDelivery(l.tipo)) {
      return NextResponse.json({ error: `${l.nome} não aceita pedidos de delivery.` }, { status: 400 })
    }
    if (l.latitude == null || l.longitude == null) {
      return NextResponse.json({ error: `${l.nome} não tem localização cadastrada e não pode entrar na festa.` }, { status: 400 })
    }
  }
  // Raio de 2 km entre as lojas (checagem par a par).
  for (let i = 0; i < lojas.length; i++) {
    for (let j = i + 1; j < lojas.length; j++) {
      const d = distanciaKm(
        { latitude: lojas[i].latitude, longitude: lojas[i].longitude },
        { latitude: lojas[j].latitude, longitude: lojas[j].longitude },
      )
      if (d != null && d > FESTA_RAIO_LOJAS_KM) {
        return NextResponse.json(
          { error: `As lojas precisam estar a até ${FESTA_RAIO_LOJAS_KM} km umas das outras. ${lojas[i].nome} e ${lojas[j].nome} estão a ${d.toFixed(1)} km.` },
          { status: 400 },
        )
      }
    }
  }

  // Cria a festa com código único (tenta alguns códigos em caso de colisão).
  let festa: any = null
  for (let tentativa = 0; tentativa < 6 && !festa; tentativa++) {
    const codigo = gerarCodigoFesta()
    const { data, error } = await admin.from('festas').insert({
      criador_cliente_id: cliente.id,
      nome,
      codigo,
      endereco_entrega: endereco,
      entrega_latitude: lat,
      entrega_longitude: lng,
    }).select('*').single()
    if (!error && data) { festa = data; break }
    // 23505 = unique_violation (código repetido) -> tenta outro.
    if (error && error.code !== '23505') {
      console.error('[festa/criar] erro ao criar festa:', error.message)
      return NextResponse.json({ error: 'Não foi possível criar a festa.' }, { status: 500 })
    }
  }
  if (!festa) return NextResponse.json({ error: 'Não foi possível gerar o código da festa. Tente de novo.' }, { status: 500 })

  // Lojas participantes (o trigger reforça os limites).
  const { error: flErr } = await admin.from('festa_lojas')
    .insert(lojaIds.map(loja_id => ({ festa_id: festa.id, loja_id })))
  if (flErr) {
    await admin.from('festas').delete().eq('id', festa.id)
    return NextResponse.json({ error: flErr.message.replace(/^.*P0001[^:]*:?\s*/, '') || 'Não foi possível adicionar as lojas.' }, { status: 400 })
  }

  // Quem cria já entra na festa (carrinho vazio).
  await admin.from('festa_participantes').insert({ festa_id: festa.id, cliente_id: cliente.id })

  return NextResponse.json({ festa: { id: festa.id, codigo: festa.codigo, nome: festa.nome } })
}
