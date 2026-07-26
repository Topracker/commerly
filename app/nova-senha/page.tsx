'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'
import { emailResetLembrado, lembrarEmailReset } from '../lib/ultimoEmail'
import CampoSenha, { senhaValida } from '../components/CampoSenha'

// Página de destino do link de redefinição de senha. O e-mail é enviado por
// /api/auth/recuperar (Admin API + Resend) com link direto para cá no formato
// ?token_hash=...&type=recovery — o token só é consumido aqui, no verifyOtp,
// quando o usuário realmente abre a página.
//
// Ainda tratamos as outras formas que o Supabase pode usar (links antigos que
// já estejam na caixa de entrada, ou o fluxo OAuth):
//   1. ?token_hash=&type=recovery  (fluxo atual — verifyOtp na mão)
//   2. ?code=...                   (PKCE — o próprio cliente troca por sessão)
//   3. sessão já estabelecida      (ex.: o link já foi trocado antes)
//   4. ?error=&error_code=         (link expirado/já usado — mostramos aviso)
// Só liberamos o formulário quando há sessão de recuperação válida.
export default function NovaSenha() {
  const [verificando, setVerificando] = useState(true)  // ainda validando o link?
  const [pronto, setPronto] = useState(false)           // sessão de recuperação válida?
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  // Erro CRU do GoTrue, mostrado na tela sem truncar. Existe porque o DevTools
  // está bloqueado no app: sem isso, um "link expirado" não diz se foi
  // otp_expired, token inválido ou outra coisa.
  const [erroBruto, setErroBruto] = useState('')
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)
  // --- Reenvio do link (estado do bloco "link expirado") ---
  // emailReenvio começa com o e-mail que já conhecemos (sessão de recuperação
  // ou último pedido feito neste navegador); vazio = precisamos perguntar.
  const [emailReenvio, setEmailReenvio] = useState('')
  const [pedirEmail, setPedirEmail] = useState(false)   // usuário quer trocar o e-mail
  const [reenviando, setReenviando] = useState(false)
  const [reenviado, setReenviado] = useState(false)
  const [erroReenvio, setErroReenvio] = useState('')
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

    // Se o pedido saiu deste navegador, já sabemos para quem reenviar.
    const lembrado = emailResetLembrado()
    if (lembrado) setEmailReenvio(lembrado)

    function liberar() {
      if (ativo) { setPronto(true); setVerificando(false) }
      // Com sessão de recuperação válida dá para saber o e-mail real da conta.
      // Guardamos agora porque, se o updateUser depois falhar por sessão
      // expirada, o bloco de reenvio já terá o destinatário certo.
      supabase.auth.getUser().then(({ data }) => {
        if (ativo && data?.user?.email) setEmailReenvio(data.user.email)
      })
    }
    function invalidar(msg: string, motivo: string) {
      console.warn('[nova-senha] link inválido —', motivo)
      if (ativo) { setVerificando(false); setErro(msg) }
    }

    // (A) Erro explícito devolvido pelo Supabase na URL (link já expirado/usado).
    const errCode = q.get('error_code') || h.get('error_code')
    const errDesc = q.get('error_description') || h.get('error_description')
    if (errCode || errDesc) {
      setErroBruto(`erro na URL → error_code: ${errCode || '—'} | error_description: ${errDesc || '—'}`)
      invalidar(errCode === 'otp_expired'
        ? 'Este link expirou. Solicite um novo link de redefinição.'
        : 'Link inválido ou já utilizado. Solicite um novo link de redefinição.',
        `URL error: ${errCode || ''} ${errDesc || ''}`.trim())
      return
    }

    // Captura sessão estabelecida de forma assíncrona (?code / #access_token).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) liberar()
    })

    ;(async () => {
      // (B) token_hash tem PRIORIDADE: é o fluxo que /api/auth/recuperar envia.
      // A verificação acontece NO SERVIDOR (/api/auth/verificar-recovery) para
      // que o erro do GoTrue apareça nos logs da Vercel e volte inteiro para a
      // tela. Como o verifyOtp consome o token, ele é chamado só lá — se a
      // página também chamasse, a segunda tentativa falharia como "expirado" e
      // esconderia a causa real. Feito no máximo UMA vez (StrictMode/re-mount).
      if (tokenHash) {
        if (!verificouRef.current) {
          verificouRef.current = true
          try {
            const res = await fetch('/api/auth/verificar-recovery', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token_hash: tokenHash, type: type || 'recovery' }),
            })
            const j = await res.json().catch(() => null)

            if (j?.ok && j?.session) {
              // O token foi consumido no servidor: trazemos a sessão de
              // recuperação para o navegador, senão o updateUser não teria
              // sessão nenhuma para trocar a senha.
              const { error: erroSessao } = await supabase.auth.setSession(j.session)
              if (!erroSessao) {
                if (ativo && j.email) setEmailReenvio(j.email)
                liberar()
                return
              }
              if (ativo) setErroBruto(
                `setSession (navegador) → ${erroSessao.message}` +
                ` | status: ${(erroSessao as { status?: number }).status ?? '—'}` +
                ` | code: ${(erroSessao as { code?: string }).code ?? '—'}`)
            } else if (j?.erro) {
              // Erro CRU do GoTrue, sem máscara e sem truncar.
              if (ativo) setErroBruto(
                `verifyOtp (servidor) → ${j.erro.message}` +
                ` | status: ${j.erro.status ?? '—'}` +
                ` | code: ${j.erro.code ?? '—'}` +
                ` | name: ${j.erro.name ?? '—'}`)
            } else if (ativo) {
              setErroBruto(`Resposta inesperada da verificação (HTTP ${res.status}): ${JSON.stringify(j)}`)
            }
          } catch (e) {
            if (ativo) setErroBruto(
              `Falha de rede ao chamar /api/auth/verificar-recovery → ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        // Já tentou verificar (aqui ou noutro mount): confia na sessão resultante.
        const { data: { session } } = await supabase.auth.getSession()
        if (session) { liberar(); return }
        invalidar('Este link expirou ou já foi usado. Solicite um novo link de redefinição.',
          'verifyOtp não produziu sessão')
        return
      }

      // (C) Sem token_hash: talvez já haja sessão (?code trocado pelo cliente,
      // ou reuso da aba).
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { liberar(); return }

      // (D) ?code (PKCE) é trocado pelo detectSessionInUrl de forma assíncrona.
      // Espera o onAuthStateChange; se nada vier, o link é inválido/expirado.
      setTimeout(async () => {
        if (!ativo) return
        const { data: { session: s2 } } = await supabase.auth.getSession()
        if (s2) liberar()
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

  // Reenvia o link de redefinição sem sair da página. Usa o e-mail que já
  // conhecemos (sessão de recuperação ou último pedido neste navegador); se não
  // houver nenhum, o formulário pede. A rota responde igual para e-mail com ou
  // sem conta (anti-enumeração), então a confirmação aqui é sempre a mesma.
  async function reenviar() {
    const email = emailReenvio.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErroReenvio('Informe um e-mail válido.')
      setPedirEmail(true)
      return
    }
    setReenviando(true)
    setErroReenvio('')
    try {
      const res = await fetch('/api/auth/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        // 429 (limite de 3 pedidos por 10 min) cai aqui com a mensagem da rota.
        const j = await res.json().catch(() => null)
        setErroReenvio(j?.erro || 'Não foi possível reenviar o link. Tente novamente.')
        setReenviando(false)
        return
      }
      lembrarEmailReset(email)
      setEmailReenvio(email)
      setPedirEmail(false)
      setReenviado(true)
      // O aviso de link expirado não faz mais sentido depois do reenvio.
      setErro('')
    } catch {
      setErroReenvio('Falha de conexão. Verifique sua internet e tente novamente.')
    }
    setReenviando(false)
  }

  async function salvar() {
    // O botão já fica travado até aqui passar; isto é a rede de segurança para
    // Enter/autofill, que podem disparar sem passar pelo estado do botão.
    if (!senhaValida(senha)) { setErro('A senha ainda não atende a todos os requisitos abaixo.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    setErro('')
    const { data: { user }, error } = await supabase.auth.updateUser({ password: senha })
    if (error || !user) {
      console.error('[nova-senha] updateUser error:', error)
      const status = (error as { status?: number } | null)?.status
      const code = (error as { code?: string } | null)?.code
      setErroBruto(error
        ? `updateUser → ${error.message} | status: ${status ?? '—'} | code: ${code ?? '—'}`
        : 'updateUser não devolveu usuário nem erro')

      // ARMADILHA: nem toda falha do updateUser é link expirado. Se o Supabase
      // recusa a SENHA (fraca, vazada em leaks, curta, igual à anterior), a
      // sessão de recuperação continua perfeitamente válida — mandar o usuário
      // pedir um link novo é enganoso e ainda jogaria fora uma sessão boa.
      // Nesse caso mantemos o formulário aberto e mostramos o motivo real.
      const ehErroDeSenha =
        status === 422 || code === 'weak_password' || code === 'same_password'
      if (ehErroDeSenha) {
        setErro(
          code === 'same_password'
            ? 'A nova senha precisa ser diferente da senha atual.'
            : 'Essa senha é muito fraca ou já apareceu em vazamentos conhecidos. Escolha outra — misture letras, números e símbolos.')
        setLoading(false)
        return
      }

      // Aí sim: sessão de recuperação expirada/inválida.
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

        {erro && <p className="text-red-400 text-sm mb-2">{erro}</p>}

        {/* Erro cru do GoTrue/Supabase, sem máscara e sem truncar. Fica na tela
            porque o DevTools está bloqueado no app — é o que diz se o caso é
            otp_expired, token inválido ou outra coisa. */}
        {erroBruto && (
          <p className="text-gray-500 text-[11px] leading-relaxed font-mono break-all whitespace-pre-wrap mb-4 select-all">
            {erroBruto}
          </p>
        )}

        {ok ? (
          <p className="text-green-400 text-sm">Senha redefinida! Redirecionando…</p>
        ) : verificando ? (
          <p className="text-gray-400 text-sm">Validando link…</p>
        ) : !pronto ? (
          // Link expirado/inválido: reenvia daqui mesmo, sem voltar para
          // /recuperar-senha. Se já sabemos o e-mail, é um clique só.
          reenviado ? (
            <div className="flex flex-col gap-4">
              <p className="text-green-400 text-sm">
                Enviamos um novo link para <strong className="text-white">{emailReenvio}</strong>.
                Verifique sua caixa de entrada e o spam — o link vale por 1 hora.
              </p>
              <button onClick={() => { setReenviado(false); setPedirEmail(true) }}
                className="text-blue-400 text-sm hover:text-blue-300 transition text-left">
                Enviar para outro e-mail
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {erroReenvio && <p className="text-red-400 text-sm">{erroReenvio}</p>}

              {emailReenvio && !pedirEmail ? (
                <p className="text-gray-400 text-sm">
                  Vamos reenviar o link para <strong className="text-white">{emailReenvio}</strong>.
                </p>
              ) : (
                <>
                  <p className="text-gray-400 text-sm">
                    Informe o e-mail da sua conta para receber um novo link.
                  </p>
                  <input type="email" autoComplete="email" placeholder="Seu e-mail" value={emailReenvio}
                    onChange={e => setEmailReenvio(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && reenviar()} className={inp} />
                </>
              )}

              <button onClick={reenviar} disabled={reenviando}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition w-full">
                {reenviando ? 'Reenviando...' : 'Reenviar link'}
              </button>

              {emailReenvio && !pedirEmail && (
                <button onClick={() => setPedirEmail(true)}
                  className="text-gray-500 text-sm hover:text-gray-400 transition">
                  Usar outro e-mail
                </button>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <CampoSenha id="nova-senha" value={senha} onChange={setSenha} onEnter={salvar}
              placeholder="Nova senha" className={inp} />
            <input type="password" autoComplete="new-password" placeholder="Confirmar nova senha" value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvar()} className={inp} />
            {confirmar && senha !== confirmar && (
              <p className="text-amber-400 text-xs -mt-2">As senhas não coincidem.</p>
            )}
            <button onClick={salvar} disabled={loading || !senhaValida(senha) || senha !== confirmar}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
