'use client'
import { useEffect, useState } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'
import { idadeVerificada } from '../../lib/restritos'

// Verificação de idade por documento: libera bebida alcoólica e cigarro.
export default function VerificarIdade() {
  const supabase = createClient()
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [verificada, setVerificada] = useState(false)
  const [aguardando, setAguardando] = useState(false)
  const [consentiu, setConsentiu] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function conferir(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/cliente/login'); return false }
    const ok = idadeVerificada(user)
    setVerificada(ok)
    return ok
  }

  useEffect(() => {
    const voltou = new URLSearchParams(window.location.search).get('retorno') === '1'
    conferir().then(ok => {
      setCarregando(false)
      if (ok || !voltou) return
      // Voltou da Didit: o resultado chega por webhook em alguns segundos.
      setAguardando(true)
      let tentativas = 0
      const t = setInterval(async () => {
        tentativas++
        if (await conferir() || tentativas >= 20) { clearInterval(t); setAguardando(false) }
      }, 3000)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function iniciar() {
    setErro('')
    setEnviando(true)
    const res = await fetch('/api/idade/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentimento: consentiu }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d.url) { setErro(d.error || 'Não foi possível iniciar a verificação.'); setEnviando(false); return }
    window.location.href = d.url
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm">
        <p className="text-green-400 text-sm font-semibold mb-1">Área do Cliente</p>
        <h1 className="text-2xl font-bold text-white mb-3">Verificar minha idade</h1>

        {carregando ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : verificada ? (
          <>
            <p className="text-green-400 font-semibold mb-2">✓ Idade verificada</p>
            <p className="text-gray-400 text-sm mb-4">Você já pode comprar produtos de venda restrita a maiores de 18 anos.</p>
            <button onClick={() => router.push('/cliente/buscar')} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition">Voltar às lojas</button>
          </>
        ) : aguardando ? (
          <p className="text-gray-300 text-sm">Recebemos seus dados. Estamos conferindo, isso leva alguns segundos...</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm">
              Bebida alcoólica e cigarro só podem ser vendidos a maiores de 18 anos. Para liberar, confirmamos sua
              idade com uma foto do seu documento oficial e uma selfie.
            </p>
            <label className="flex items-start gap-2 text-gray-300 text-sm cursor-pointer">
              <input type="checkbox" checked={consentiu} onChange={e => setConsentiu(e.target.checked)} className="mt-1" />
              <span>
                Concordo em enviar a foto do meu documento e uma selfie para a Didit, empresa que faz a conferência por nós.
                Veja a <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Política de Privacidade</a>.
              </span>
            </label>
            {erro && <p className="text-red-400 text-sm">{erro}</p>}
            <button onClick={iniciar} disabled={!consentiu || enviando}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {enviando ? 'Abrindo...' : 'Verificar minha idade'}
            </button>
            <p className="text-gray-500 text-xs text-center">Menores de 18 anos não passam na verificação e não compram esses produtos.</p>
          </div>
        )}
      </div>
    </main>
  )
}
