// Validações e formatações reutilizáveis de CPF, CNPJ e telefone (Brasil).
//
// Usado tanto no client (formulários de cadastro) quanto no server
// (rota /api/cadastro/checar). NÃO importe nada de React/Next aqui — este
// módulo precisa rodar nos dois ambientes.
//
// As funções de formatação produzem EXATAMENTE o mesmo formato em que os
// dados já são gravados no banco (ex: telefone "(11) 98765-4321", CPF
// "000.000.000-00"), o que mantém a checagem de duplicidade confiável.

export function soDigitos(valor: string): string {
  return (valor || '').replace(/\D/g, '')
}

// CPFs que PASSAM no dígito verificador mas são notoriamente "de teste"
// (saem de geradores online e tutoriais). Os de dígitos repetidos
// (111.111.111-11 etc.) já são barrados pela regex de repetição.
const CPF_BLOCKLIST = new Set([
  '12345678909', // 123.456.789-09 — o "CPF de teste" mais famoso
  '11144477735', // muito citado em tutoriais/docs
  '00000000191',
  '11111111111', // (também pego pela regex, mantido por clareza)
])

// CNPJs de teste famosos que passam no dígito verificador.
const CNPJ_BLOCKLIST = new Set([
  '11222333000181', // CNPJ de teste recorrente em docs/geradores
  '00000000000191',
])

// ---------------------------------------------------------------------------
// CPF
// ---------------------------------------------------------------------------

export function validarCPF(valor: string): boolean {
  const cpf = soDigitos(valor)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  if (CPF_BLOCKLIST.has(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== parseInt(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  return resto === parseInt(cpf[10])
}

// ---------------------------------------------------------------------------
// CNPJ
// ---------------------------------------------------------------------------

export function validarCNPJ(valor: string): boolean {
  const cnpj = soDigitos(valor)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  if (CNPJ_BLOCKLIST.has(cnpj)) return false
  const calc = (pesos: number[]) => {
    let soma = 0
    for (let i = 0; i < pesos.length; i++) soma += parseInt(cnpj[i]) * pesos[i]
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const d1 = calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13])
}

// ---------------------------------------------------------------------------
// Telefone / WhatsApp
// ---------------------------------------------------------------------------

// DDDs realmente em uso no Brasil. Rejeitar fora dessa lista evita números
// com DDD inexistente (ex: "10", "20").
const DDDS_VALIDOS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
])

// Detecta sequência consecutiva crescente (12345678) ou decrescente (98765432).
function ehSequencia(d: string): boolean {
  if (d.length < 2) return false
  let crescente = true
  let decrescente = true
  for (let i = 1; i < d.length; i++) {
    if (parseInt(d[i]) !== parseInt(d[i - 1]) + 1) crescente = false
    if (parseInt(d[i]) !== parseInt(d[i - 1]) - 1) decrescente = false
  }
  return crescente || decrescente
}

export function validarTelefone(valor: string): boolean {
  const d = soDigitos(valor)
  if (d.length !== 10 && d.length !== 11) return false
  if (!DDDS_VALIDOS.has(d.slice(0, 2))) return false

  const assinante = d.slice(2)
  // Celular: 11 dígitos no total, parte do assinante começa com 9.
  // Fixo: 10 dígitos no total, começa de 2 a 5.
  if (d.length === 11 && assinante[0] !== '9') return false
  if (d.length === 10 && !['2', '3', '4', '5'].includes(assinante[0])) return false

  // Rejeita números óbvios: todos os dígitos repetidos (11111111111),
  // assinante repetido, ou sequência consecutiva (12345678901).
  if (/^(\d)\1+$/.test(d)) return false
  if (/^(\d)\1+$/.test(assinante)) return false
  if (ehSequencia(d)) return false

  return true
}

// ---------------------------------------------------------------------------
// Formatação (espelha o formato gravado no banco)
// ---------------------------------------------------------------------------

export function formatarCPF(valor: string): string {
  const d = soDigitos(valor).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function formatarCNPJ(valor: string): string {
  const d = soDigitos(valor).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

// Formata como CPF (até 11 dígitos) ou CNPJ (acima disso) automaticamente.
export function formatarDocumento(valor: string): string {
  const d = soDigitos(valor)
  return d.length > 11 ? formatarCNPJ(d) : formatarCPF(d)
}

export function formatarTelefone(valor: string): string {
  const d = soDigitos(valor).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// ---------------------------------------------------------------------------
// Mensagens de erro inline (retornam '' quando válido ou campo vazio)
// ---------------------------------------------------------------------------

export function erroCPF(valor: string): string {
  const d = soDigitos(valor)
  if (!d) return ''
  if (d.length !== 11) return 'CPF incompleto'
  return validarCPF(d) ? '' : 'CPF inválido'
}

export function erroCNPJ(valor: string): string {
  const d = soDigitos(valor)
  if (!d) return ''
  if (d.length !== 14) return 'CNPJ incompleto'
  return validarCNPJ(d) ? '' : 'CNPJ inválido'
}

export function erroTelefone(valor: string): string {
  const d = soDigitos(valor)
  if (!d) return ''
  if (!DDDS_VALIDOS.has(d.slice(0, 2))) return 'DDD inválido'
  if (d.length !== 10 && d.length !== 11) return 'Número incompleto'
  return validarTelefone(d) ? '' : 'Telefone inválido'
}

// ---------------------------------------------------------------------------
// Website da loja (URL opcional)
// ---------------------------------------------------------------------------

// Normaliza o que o comerciante digitou numa URL gravável: aceita "loja.com",
// "www.loja.com" ou "https://loja.com" e sempre devolve com esquema http(s).
// Devolve '' quando vazio (campo é opcional).
export function normalizarWebsite(valor: string): string {
  const t = (valor || '').trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

// '' quando válido ou vazio; mensagem de erro caso contrário. Exige um host
// com ponto (ex.: "loja.com") pra barrar digitação incompleta.
export function erroWebsite(valor: string): string {
  const t = (valor || '').trim()
  if (!t) return ''
  try {
    const u = new URL(normalizarWebsite(t))
    if (!u.hostname.includes('.') || u.hostname.endsWith('.')) return 'Endereço de site inválido'
    return ''
  } catch {
    return 'Endereço de site inválido'
  }
}

// ---------------------------------------------------------------------------
// Checagem de duplicidade (client → /api/cadastro/checar)
// ---------------------------------------------------------------------------

export type CampoDuplicado = 'cpf' | 'cnpj' | 'telefone'

export const MSG_DUPLICADO: Record<CampoDuplicado, string> = {
  cpf: 'Este CPF já está cadastrado em outra conta do Commerly.',
  cnpj: 'Este CNPJ já está cadastrado em outra conta do Commerly.',
  telefone: 'Este telefone já está cadastrado em outra conta do Commerly.',
}

// Consulta a rota server-side (que usa service role pra contornar a RLS) e
// devolve qual campo está duplicado, se houver. Em caso de erro de rede
// retorna { erro } — o chamador decide se bloqueia ou segue.
export async function checarDuplicidade(payload: {
  cpf?: string
  cnpj?: string
  telefone?: string
}): Promise<{ duplicado?: CampoDuplicado; erro?: string }> {
  try {
    const res = await fetch('/api/cadastro/checar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { erro: data?.erro || 'Não foi possível validar seus dados.' }
    return { duplicado: data?.duplicado as CampoDuplicado | undefined }
  } catch {
    return { erro: 'Erro de rede ao validar seus dados. Tente novamente.' }
  }
}

// Aviso exibido em todos os cadastros.
export const AVISO_VERIFICACAO =
  'Seus dados serão verificados — contas com informações falsas serão suspensas.'

// ---------------------------------------------------------------------------
// Limite de criação de conta por IP (anti-spam: 1 por dia por IP)
// ---------------------------------------------------------------------------

// Chamado imediatamente antes de criar o perfil (loja/cliente/fornecedor). O
// servidor registra o IP e bloqueia se já houve uma criação nas últimas 24h.
// Falha "aberta" (ok) em erro de rede pra não travar cadastro legítimo — o
// servidor é a barreira real de qualquer forma.
export async function registrarCadastroIp(area: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const res = await fetch('/api/cadastro/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, erro: data?.erro || 'Não foi possível concluir o cadastro agora.' }
    return { ok: true }
  } catch {
    return { ok: true }
  }
}
