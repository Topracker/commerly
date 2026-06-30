import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../lib/rate-limit'
import { chamarGemini } from '../../lib/gemini'

const MAX_DESC = 1000

// Módulos que a IA pode sugerir (precisa bater com as keys de lib/nichos.ts).
const MODULOS_DISPONIVEIS: { key: string; quando: string }[] = [
  { key: 'agenda', quando: 'negócio com hora marcada / atendimento agendado (barbearia, salão, estética, clínica)' },
  { key: 'servicos', quando: 'cobra por serviços, não por produtos' },
  { key: 'pedidos', quando: 'recebe pedidos/comandas (restaurante, delivery, lanchonete)' },
  { key: 'estoque', quando: 'controla quantidade de produtos em estoque' },
  { key: 'produtos', quando: 'vende produtos de um catálogo' },
  { key: 'vendas', quando: 'registra vendas avulsas no balcão' },
  { key: 'fornecedores', quando: 'precisa repor mercadoria com fornecedores' },
  { key: 'funcionarios', quando: 'tem equipe/funcionários' },
  { key: 'fiado', quando: 'vende fiado / anota o que clientes devem' },
  { key: 'gastos', quando: 'quer controlar despesas' },
  { key: 'historico', quando: 'quer ver o histórico de vendas' },
]

const KEYS_VALIDAS = new Set(MODULOS_DISPONIVEIS.map(m => m.key))

type RespostaIA = { tipoSugerido?: unknown; resumo?: unknown; modulos?: unknown }

function extrairJSON(texto: string): RespostaIA | null {
  // Remove cercas ```json ... ``` e pega o primeiro objeto {}.
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim()
  const ini = limpo.indexOf('{')
  const fim = limpo.lastIndexOf('}')
  if (ini < 0 || fim < 0) return null
  try { return JSON.parse(limpo.slice(ini, fim + 1)) as RespostaIA } catch { return null }
}

// Categorias que o fornecedor pode escolher (precisa bater com a lista das
// telas de cadastro do fornecedor).
const CATEGORIAS_FORNECEDOR = [
  'Alimentos e bebidas', 'Limpeza e higiene', 'Eletrônicos', 'Roupas e acessórios',
  'Papelaria', 'Construção', 'Serviços', 'Tecnologia',
]

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const descricao: string = typeof body?.descricao === 'string' ? body.descricao : ''
  const modo: string = body?.modo === 'fornecedor' ? 'fornecedor' : 'comerciante'
  if (!descricao.trim()) return NextResponse.json({ erro: 'Descreva seu negócio.' }, { status: 400 })
  if (descricao.length > MAX_DESC) return NextResponse.json({ erro: 'Descrição muito longa.' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`onboarding-ia:${user.id}`, 30, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Tente novamente em alguns minutos.' }, { status: 429 })
  }

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    console.error('[onboarding-ia] GEMINI_API_KEY ausente')
    return NextResponse.json({ erro: 'Assistente não configurado.' }, { status: 500 })
  }

  // -------------------------------------------------------------------------
  // Modo fornecedor: sugere CATEGORIA e FOCO de atuação (não módulos).
  // -------------------------------------------------------------------------
  if (modo === 'fornecedor') {
    const promptForn = `Você é o assistente de onboarding de FORNECEDORES do Commerly, um app que conecta fornecedores a pequenos comércios no Brasil.
O fornecedor descreveu a empresa dele. Sua tarefa: identificar a CATEGORIA e o FOCO de atuação.

CATEGORIAS SUGERIDAS (use uma delas quando encaixar bem):
${CATEGORIAS_FORNECEDOR.map(c => `- ${c}`).join('\n')}
Se nenhuma encaixar, crie um nome de categoria curto e natural (máx 40 caracteres).

Regras:
- "categoriaSugerida": a categoria que melhor descreve o que a empresa FORNECE.
- "foco": 1 frase curta dizendo o que ela fornece / pra quem (máx 120 caracteres).
- "resumo": 1 frase amigável confirmando o perfil que você preparou.

Descrição do fornecedor: "${descricao.replace(/"/g, "'")}"

Responda APENAS com um JSON válido, sem texto antes ou depois, neste formato:
{"categoriaSugerida": "...", "foco": "...", "resumo": "..."}`

    const resForn = await chamarGemini(geminiApiKey, {
      contents: [{ parts: [{ text: promptForn }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 512, responseMimeType: 'application/json' },
    })

    if (!resForn.ok) {
      console.error('[onboarding-ia/fornecedor] gemini falhou:', resForn.status, resForn.body.slice(0, 300))
      const msg = resForn.status === 429
        ? 'Limite de consultas atingido. Tente novamente em alguns minutos.'
        : 'Erro ao consultar o assistente. Tente novamente.'
      return NextResponse.json({ erro: msg }, { status: 500 })
    }

    const textoForn = resForn.data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const parsedForn = extrairJSON(textoForn) as { categoriaSugerida?: unknown; foco?: unknown; resumo?: unknown } | null
    if (!parsedForn) {
      console.error('[onboarding-ia/fornecedor] resposta não parseável:', textoForn.slice(0, 300))
      return NextResponse.json({ erro: 'Não consegui entender. Tente descrever de outro jeito.' }, { status: 502 })
    }

    return NextResponse.json({
      categoriaSugerida: typeof parsedForn.categoriaSugerida === 'string' ? parsedForn.categoriaSugerida.slice(0, 40) : '',
      foco: typeof parsedForn.foco === 'string' ? parsedForn.foco.slice(0, 120) : '',
      resumo: typeof parsedForn.resumo === 'string' ? parsedForn.resumo.slice(0, 300) : '',
    })
  }

  const prompt = `Você é o assistente de onboarding do Commerly, um app de gestão para pequenos comércios no Brasil.
O comerciante descreveu o negócio dele. Sua tarefa: identificar o tipo de comércio e escolher os MÓDULOS mais úteis pro painel dele.

MÓDULOS DISPONÍVEIS (use exatamente estas keys):
${MODULOS_DISPONIVEIS.map(m => `- "${m.key}": ${m.quando}`).join('\n')}

Regras:
- Escolha de 2 a 4 módulos, em ordem de relevância (o mais importante primeiro).
- Foque nos módulos que definem o NEGÓCIO (agenda, servicos, pedidos, estoque, produtos, vendas, fornecedores). Só inclua fiado/gastos/historico/funcionarios se fizer muito sentido.
- "tipoSugerido": um nome curto e natural do ramo (ex: "Floricultura", "Lava-rápido"). Máx 30 caracteres.
- "resumo": 1 frase amigável explicando o que você preparou pro painel dele.

Descrição do comerciante: "${descricao.replace(/"/g, "'")}"

Responda APENAS com um JSON válido, sem texto antes ou depois, neste formato:
{"tipoSugerido": "...", "resumo": "...", "modulos": ["key1", "key2"]}`

  // Retenta até 2x em falhas transitórias (timeout/rede/5xx) antes de errar.
  const resultado = await chamarGemini(geminiApiKey, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 512, responseMimeType: 'application/json' },
  })

  if (!resultado.ok) {
    console.error('[onboarding-ia] gemini falhou:', resultado.status, resultado.body.slice(0, 300))
    const msg = resultado.status === 429
      ? 'Limite de consultas atingido. Tente novamente em alguns minutos.'
      : 'Erro ao consultar o assistente. Tente novamente.'
    return NextResponse.json({ erro: msg }, { status: 500 })
  }

  const texto = resultado.data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const parsed = extrairJSON(texto)
  if (!parsed) {
    console.error('[onboarding-ia] resposta não parseável:', texto.slice(0, 300))
    return NextResponse.json({ erro: 'Não consegui entender. Tente descrever de outro jeito.' }, { status: 502 })
  }

  const modulos: string[] = Array.isArray(parsed.modulos)
    ? parsed.modulos.filter((k: unknown) => typeof k === 'string' && KEYS_VALIDAS.has(k)).slice(0, 4)
    : []
  // Fallback seguro se a IA não trouxe módulos válidos.
  const modulosFinais = modulos.length ? modulos : ['produtos', 'vendas']

  return NextResponse.json({
    tipoSugerido: typeof parsed.tipoSugerido === 'string' ? parsed.tipoSugerido.slice(0, 30) : '',
    resumo: typeof parsed.resumo === 'string' ? parsed.resumo.slice(0, 300) : '',
    modulos: modulosFinais,
  })
}
