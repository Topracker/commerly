// Passo a passo da tela "Importar vendas da maquininha".
//
// Os apps mudam de menu com frequência e estes caminhos não foram conferidos
// dentro de cada app, então o texto é genérico de propósito. Ao confirmar um
// caminho em conta real, troque aqui. Não invente nome de menu.

import type { Maquininha } from './maquininhaImport'

export type Tutorial = {
  /** Onde baixar, em ordem. */
  passos: string[]
  /** Observação que só vale para esta maquininha. */
  dica?: string
}

const MENU_GENERICO = 'Procure o menu Vendas ou Extrato. Dentro dele, toque em Exportar ou Baixar.'
const PERIODO = 'Escolha as datas que você quer trazer. Exemplo: o mês passado.'
const FORMATO = 'Se puder escolher o formato, prefira Excel (XLSX) ou CSV. O PDF também serve, mas às vezes não dá para ler todas as vendas.'
const ENVIO = 'O arquivo vai para o seu celular ou computador, ou chega no seu e-mail. Guarde-o na pasta de downloads.'

export const TUTORIAIS: Record<Maquininha, Tutorial> = {
  pagbank: {
    passos: [
      'Abra o app do PagBank ou entre no site, na conta que recebe as vendas da maquininha.',
      'Procure o menu Extrato ou Vendas. Dentro dele, procure Exportar (no app, pode estar nos três pontinhos).',
      PERIODO,
      FORMATO,
      ENVIO,
    ],
  },
  mercadopago: {
    passos: [
      'Abra o app do Mercado Pago ou entre no site, na conta que recebe as vendas da maquininha.',
      'Procure o menu Vendas, Atividades ou Relatórios. Dentro dele, toque em Exportar ou Baixar.',
      PERIODO,
      FORMATO,
      ENVIO,
    ],
    dica: 'Tem Mercado Pago? Você também pode conectar a conta em Integrações. Assim as vendas entram sozinhas, e o que você importar aqui não fica em dobro.',
  },
  stone: {
    passos: [
      'Abra o app da Stone ou entre no site, na conta que recebe as vendas da maquininha.',
      MENU_GENERICO,
      PERIODO,
      FORMATO,
      ENVIO,
    ],
  },
  cielo: {
    passos: [
      'Abra o app da Cielo ou entre no site, com o cadastro da sua loja.',
      MENU_GENERICO,
      PERIODO,
      FORMATO,
      ENVIO,
    ],
  },
  infinitepay: {
    passos: [
      'Abra o app da InfinitePay, na conta que recebe as vendas da maquininha.',
      MENU_GENERICO,
      PERIODO,
      FORMATO,
      ENVIO,
    ],
  },
  outra: {
    passos: [
      'Abra o app ou o site da sua maquininha.',
      MENU_GENERICO,
      PERIODO,
      FORMATO,
      ENVIO,
    ],
    dica: 'O arquivo precisa ter a data da venda, o valor e o código de cada venda. Sem o código, não temos como evitar venda em dobro.',
  },
}

export const CONTA_PJ_PF =
  'Conta de empresa (PJ) ou pessoal (PF)? O caminho é parecido nas duas. Se você tem as duas, entre na que recebe o dinheiro da maquininha.'

export const PASSOS_COMMERLY = [
  'Aqui embaixo, toque em Escolher arquivo e selecione o extrato que você baixou.',
  'Confira a prévia: quantas vendas, o valor total e quantas já estavam aqui.',
  'Se estiver certo, toque em Confirmar. Pronto: as vendas entram no seu faturamento.',
]
