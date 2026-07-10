// Entrega por drone (#14).
//
// As restrições abaixo são de segurança operacional e existem também no
// servidor (app/api/entrega/despachar). Não confie na UI para barrar: o cliente
// pode chamar a API direto.
//
// Base regulatória (RBAC-E nº 94 / ANAC + ICA 100-40 / DECEA): operação BVLOS
// e voo noturno exigem autorização específica que não temos, e o cadastro do
// equipamento no SISANT é obrigatório. Por isso pedimos número de série e o
// registro ANAC no onboarding, e travamos a operação em linha de visada curta,
// carga leve e período diurno.

/** Alcance máximo da entrega por drone, em km. */
export const DRONE_RAIO_MAX_KM = 5
/** Carga máxima transportável, em kg. */
export const DRONE_PESO_MAX_KG = 2
/** Janela diurna (hora local de Brasília), fim exclusivo. */
export const DRONE_HORA_INICIO = 6
export const DRONE_HORA_FIM = 18

import { agoraEmBrasilia } from './precoDinamico'

export type ItemComPeso = { quantidade: number; peso_kg?: number | null }

export type ContextoDrone = {
  distanciaKm: number | null
  itens: ItemComPeso[]
  lojaAceitaDrone: boolean
  agora?: Date
}

export type ChecagemDrone = {
  permitido: boolean
  /** Motivos legíveis; vazio quando permitido. */
  motivos: string[]
  pesoTotalKg: number
}

/**
 * Soma o peso dos itens. Item sem `peso_kg` cadastrado conta como 0 — e isso é
 * deliberado: barrar o pedido por falta de cadastro puniria o comerciante. O
 * risco fica coberto pelo teto de 2kg sobre o que se sabe, e o comerciante vê
 * um aviso no produto sem peso.
 */
export function pesoTotal(itens: ItemComPeso[]): number {
  const soma = itens.reduce((acc, i) => acc + (i.peso_kg ?? 0) * i.quantidade, 0)
  return Math.round(soma * 1000) / 1000
}

export function emJanelaDiurna(agora: Date = new Date()): boolean {
  const { hora } = agoraEmBrasilia(agora)
  return hora >= DRONE_HORA_INICIO && hora < DRONE_HORA_FIM
}

export function checarDrone({ distanciaKm, itens, lojaAceitaDrone, agora = new Date() }: ContextoDrone): ChecagemDrone {
  const motivos: string[] = []
  const peso = pesoTotal(itens)

  if (!lojaAceitaDrone) motivos.push('A loja não aceita entrega por drone.')
  if (distanciaKm === null) motivos.push('Distância desconhecida — drone exige endereço com coordenadas.')
  else if (distanciaKm > DRONE_RAIO_MAX_KM) motivos.push(`Entrega a ${distanciaKm.toFixed(1)} km; o drone opera até ${DRONE_RAIO_MAX_KM} km.`)
  if (peso > DRONE_PESO_MAX_KG) motivos.push(`Pedido com ${peso.toFixed(2)} kg; o drone leva até ${DRONE_PESO_MAX_KG} kg.`)
  if (!emJanelaDiurna(agora)) motivos.push(`Drone só voa das ${DRONE_HORA_INICIO}h às ${DRONE_HORA_FIM}h.`)

  return { permitido: motivos.length === 0, motivos, pesoTotalKg: peso }
}
