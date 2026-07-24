'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

// Página de destino do link de redefinição de senha (redirectTo do
// resetPasswordForEmail aponta direto para cá). O Supabase pode entregar o
// token de recuperação de mais de uma forma, então tratamos todas:
//   1. ?code=...            (fluxo PKCE — o próprio cliente troca por sessão)
//   2. ?token_hash=&type=recovery  (fluxo verifyOtp — validamos na mão)
//   3. sessão já estabelecida      (ex.: o link já foi trocado antes)
//   4. ?error=&error_code=         (link expirado/já usado — mostramos aviso)
// Só liberamos o formulário quando há sessão de recuperação válida.
export default function NovaSenha() {
  const [verificando, setVerificando] = useState(true)  // ainda validando o link?
  const [pronto, setPronto] = useState(false)           // sessão de recuperação válida?
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)
  // Garante que o token_hash seja verificado UMA vez só. verifyOtp consome o
  // token; uma segunda chamada (re-mount/StrictMode) falharia como "expirado".
  const verificouRef = useRef(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let ativo = true
    const q = new URLSearchParams(window.location.search)
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const tokenHash = q.get('token_hash')
    const type = q.get('type')

    // ---- DIAGNÓSTICO: o que REALMENTE chega na página (ver console) ----
    console.log('[nova-senha] URL:', window.location.href)
    console.log('[nova-senha] query:', Object.fromEntries(q.entries()))
    console.log('[nova-senha] hash :', Object.fromEntries(h.entries()))
    console.log('[nova-senha] token_hash:', tokenHash ? `PRESENTE (len=${tokenHash.length})` : 'AUSENTE',
      '| type:', type || '(nenhum)', '| code:', q.get('code') ? 'presente' : 'ausente')

    function liberar(origem: string) {
      console.log('[nova-senha] ✓ liberado via', origem)
      if (ativo) { setPronto(true); setVerificando(false) }
    }
    function invalidar(msg: string, motivo: string) {
      console.warn('[nova-senha] ✗ inválido —', motivo)
      if (ativo) { setVerificando(false); setErro(msg) }
    }

    // (A) Erro explícito devolvido pelo Supabase na URL (link já expirado/usado).
    const errCode = q.get('error_code') || h.get('error_code')
    const errDesc = q.get('error_description') || h.get('error_description')
    if (errCode || errDesc) {
      invalidar(errCode === 'otp_expired'
        ? 'Este link expirou. Solicite um novo link de redefinição.'
        : 'Link inválido ou já utilizado. Solicite um novo link de redefinição.',
        `URL error: ${errCode || ''} ${errDesc || ''}`.trim())
      return
    }

    // Captura sessão estabelecida de forma assíncrona (?code / #access_token).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[nova-senha] onAuthStateChange:', event, '| sessão:', !!session)
      if (session) liberar('onAuthStateChange:' + event)
    })

    ;(async () => {
      // (B) token_hash tem PRIORIDADE: é o fluxo recomendado (cross-device) e
      // estabelece a sessão de recuperação. Verificado no máximo UMA vez.
      if (tokenHash) {
        if (!verificouRef.current) {
          verificouRef.current = true
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: (type as 'recovery') || 'recovery',
          })
          if (error) {
            console.error('[nova-senha] verifyOtp ERRO:', {
              message: error.message,
              status: (error as { status?: number }).status,
              code: (error as { code?: string }).code,
            })
          } else {
            console.log('[nova-senha] verifyOtp OK — sessão:', !!data?.session)
          }
          if (!error) { liberar('verifyOtp'); return }
        }
        // Já tentou verificar (aqui ou noutro mount): confia na sessão resultante.
        const { data: { session } } = await supabase.auth.getSession()
        if (session) { liberar('getSession-pós-verify'); return }
        invalidar('Este link expirou ou já foi usado. Solicite um novo link de redefinição.',
          'verifyOtp não produziu sessão')
        return
      }

      // (C) Sem token_hash: talvez já haja sessão (?code trocado pelo cliente,
      // ou reuso da aba).
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[nova-senha] getSession inicial:', !!session)
      if (session) { liberar('getSession'); return }

      // (D) ?code (PKCE) é trocado pelo detectSessionInUrl de forma assíncrona.
      // Espera o onAuthStateChange; se nada vier, o link é inválido/expirado.
      setTimeout(async () => {
        if (!ativo) return
        const { data: { session: s2 } } = await supabase.auth.getSession()
        console.log('[nova-senha] getSession após timeout:', !!s2)
        if (s2) liberar('getSession-timeout')
        else invalidar('Link inválido ou expirado. Solicite um novo link de redefinição.',
          'sem token_hash e sem sessão após 3s')
      }, 3000)
    })()

    return () => { ativo = false; sub.subscription.unsubscribe() }
  }, [])

  // Após redefinir a senha, manda o usuário para a área do seu papel
  // (já está autenticado pela sessão de recuperação).
  async function rotearPorPapel(userId: string) {
    const { data: loja } = await supabase.from('lojas').select('id, plano').eq('user_id', userId).maybeSingle()
    if (loja) { router.push(loja.plano === 'ativo' ? '/dashboard' : '/planos'); return }

    const [{ data: cliente }, { data: fornecedor }, { data: entregador }] = await Promise.all([
      supabase.from('clientes').select('id').eq('user_id', userId).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', userId).maybeSingle(),
      supabase.from('entregadores').select('id').eq('user_id', userId).maybeSingle(),
    ])
    if (cliente) { router.push('/cliente/buscar'); return }
    if (fornecedor) { router.push('/fornecedor/dashboard'); return }
    if (entregador) { router.push('/entregador-delivery/dashboard'); return }
    router.push('/')
  }

  async function salvar() {
    if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    setErro('')
    const { data: { user }, error } = await supabase.auth.updateUser({ password: senha })
    if (error || !user) {
      console.error('[nova-senha] updateUser error:', error)
      // A falha aqui quase sempre é sessão de recuperação expirada/inválida:
      // caímos para o estado sem token, que exibe o botão "Solicitar novo link".
      setErro('Este link expirou. Solicite um novo link de redefinição.')
      setPronto(false)
      setLoading(false)
      return
    }
    setOk(true)
    await rotearPorPapel(user.id)
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <main data-theme="dark" className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
        <p className="text-blue-400 text-sm font-semibold mb-1">Recuperar acesso</p>
        <h1 className="text-2xl font-bold text-white mb-6">Definir nova senha</h1>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {ok ? (
          <p className="text-green-400 text-sm">Senha redefinida! Redirecionando…</p>
        ) : verificando ? (
          <p className="text-gray-400 text-sm">Validando link…</p>
        ) : !pronto ? (
          <button onClick={() => router.push('/recuperar-senha')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition w-full">
            Solicitar novo link
          </button>
        ) : (
          <div className="flex flex-col gap-4">
            <input type="password" autoComplete="new-password" placeholder="Nova senha (mín. 6 caracteres)" value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvar()} className={inp} />
            <input type="password" autoComplete="new-password" placeholder="Confirmar nova senha" value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvar()} className={inp} />
            <button onClick={salvar} disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
