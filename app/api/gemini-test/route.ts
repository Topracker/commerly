import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ erro: 'GEMINI_API_KEY ausente' })

  const listRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
  )
  const listData = await listRes.json()

  if (!listRes.ok) {
    return NextResponse.json({ erro: 'ListModels falhou', status: listRes.status, body: listData })
  }

  const modelos = (listData.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes('generateContent')
    )
    .map((m: { name: string; displayName?: string }) => ({ name: m.name, displayName: m.displayName }))

  const candidates = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']
  const testes: Record<string, number> = {}
  for (const model of candidates) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ok' }] }] }),
      }
    )
    testes[model] = r.status
  }

  return NextResponse.json({ modelos, testes })
}
