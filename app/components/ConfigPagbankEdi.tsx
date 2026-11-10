'use client'
// Maquininha PagBank automática (API do Extrato EDI) — lib/pagbankEdi.ts.
//
// Separada da integração PagBank por token/OAuth, que segue "Em breve"
// (lib/pagbankStatus.ts). O token vai só para o servidor, que cifra e guarda;
// a tela lê de volta apenas os 4 últimos caracteres.

import { useCallback, useEffect, useState } from 'react'
import { CreditCard, ChevronDown, ExternalLink, Trash2 } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatarDataHora } from '../lib/datas'

type Props = {
  supabase: SupabaseClient
  lojaId: string
  onToast: (msg: string, tipo: 'sucesso' | 'erro') => void
}

type Conexao = {
  estabelecimento: string
  token_final: string
  status: string
  ultima_sincronizacao: string | null
  ultimo_erro: string | null
}

const STATUS: Record<string, { texto: string; cor: string }> = {
  nova: { texto: 'Salvo — teste a conexão', cor: 'text-gray-400' },
  ok: { texto: 'Conectada', cor: 'text-emerald-400' },
  aguardando: { texto: 'Aguardando o PagBank fechar o dia', cor: 'text-amber-300' },
  credencial_invalida: { texto: 'Número ou token recusado pelo PagBank', cor: 'text-red-400' },
  erro: { texto: 'Erro na última sincronização', cor: 'text-red-400' },
}

export const LINK_PEDIR_TOKEN = 'https://developer.pagbank.com.br/docs/edi'

export function ConfigPagbankEdi({ supabase, lojaId, onToast }: Props) {
  const [disponivel, setDisponivel] = useState(false)
  const [conexao, setConexao] = useState<Conexao | null>(null)
  const [estabelecimento, setEstabelecimento] = useState('')
  const [token, setToken] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [resultadoTeste, setResultadoTeste] = useState<{ ok: boolean; texto: string } | null>(null)
  const [tutorial, setTutorial] = useState(false)

  const buscar = useCallback(() => supabase.from('pagbank_edi_conexoes')
    .select('estabelecimento, token_final, status, ultima_sincronizacao, ultimo_erro')
    .eq('loja_id', lojaId).maybeSingle(), [supabase, lojaId])

  function aplicar({ data, error }: Awaited<ReturnType<typeof buscar>>) {
    if (error) return // pré-migração: o bloco não aparece
    setDisponivel(true)
    setConexao(data as Conexao | null)
    if (data) setEstabelecimento(String(data.estabelecimento))
  }
  const carregar = async () => aplicar(await buscar())

  useEffect(() => { if (lojaId) buscar().then(aplicar) }, [lojaId, buscar]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    setSalvando(true); setResultadoTeste(null)
    const res = await fetch('/api/maquininha/pagbank-edi', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estabelecimento, token }),
    }).catch(() => null)
    const j = await res?.json().catch(() => null)
    setSalvando(false)
    if (!res?.ok) { onToast(j?.erro || 'Não foi possível salvar.', 'erro'); return }
    setToken('')
    onToast('Maquininha PagBank salva. Agora teste a conexão.', 'sucesso')
    await carregar()
  }

  async function testar() {
    setTestando(true); setResultadoTeste(null)
    const res = await fetch('/api/maquininha/pagbank-edi/testar', { method: 'POST' }).catch(() => null)
    const j = await res?.json().catch(() => null)
    setTestando(false)
    if (!res?.ok && !j) { setResultadoTeste({ ok: false, texto: 'Não foi possível testar agora.' }); return }
    if (j?.erro) setResultadoTeste({ ok: false, texto: j.erro })
    else if (j?.autenticou) {
      const dia = String(j.dia).split('-').reverse().join('/')
      setResultadoTeste({
        ok: true,
        texto: `Conectou! O PagBank aceitou o número e o token. Dia ${dia}: ${j.temMovimento ? 'tem movimento' : 'sem movimento'}${j.validado ? '' : ' (ainda sendo fechado pelo PagBank)'}.`,
      })
    } else setResultadoTeste({ ok: false, texto: j?.mensagem || 'Não autenticou.' })
    await carregar()
  }

  async function remover() {
    if (!confirm('Desligar a sincronização automática? As vendas que já entraram continuam no faturamento.')) return
    const res = await fetch('/api/maquininha/pagbank-edi', { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) { onToast('Não foi possível remover.', 'erro'); return }
    setConexao(null); setEstabelecimento(''); setToken(''); setResultadoTeste(null)
    onToast('Sincronização automática do PagBank desligada.', 'sucesso')
  }

  if (!disponivel) return null
  const st = conexao ? STATUS[conexao.status] ?? STATUS.erro : null
  const podeSalvar = /^\d{3,20}$/.test(estabelecimento.replace(/\D/g, '')) && (token.trim().length > 0 || (!!conexao && estabelecimento !== conexao.estabelecimento))

  return (
    <div className="bg-gray-900 rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard size={18} className="text-acento" />
        <h2 className="text-white font-semibold">Maquininha PagBank (automático)</h2>
      </div>
      <p className="text-gray-400 text-sm mb-4">
        As vendas da sua maquininha PagBank entram sozinhas no faturamento, todo dia de manhã (as do dia anterior),
        com valor bruto, taxa e líquido.
      </p>

      {conexao && st && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 mb-4 text-sm">
          <p className={`font-semibold ${st.cor}`}>{st.texto}</p>
          <p className="text-gray-400 text-xs mt-1">
            Estabelecimento {conexao.estabelecimento} · Token ••••{conexao.token_final}
          </p>
          {conexao.ultima_sincronizacao && (
            <p className="text-gray-500 text-xs mt-0.5">Última sincronização: {formatarDataHora(conexao.ultima_sincronizacao)}</p>
          )}
          {conexao.ultimo_erro && <p className="text-amber-300 text-xs mt-1">{conexao.ultimo_erro}</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-gray-400 text-sm">Número do estabelecimento</span>
          <input
            inputMode="numeric" autoComplete="off" value={estabelecimento}
            onChange={e => setEstabelecimento(e.target.value.replace(/\D/g, '').slice(0, 20))}
            placeholder="Ex.: 126984538"
            className="mt-1 w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="block">
          <span className="text-gray-400 text-sm">Token EDI</span>
          <input
            type="password" autoComplete="new-password" spellCheck={false} value={token}
            onChange={e => setToken(e.target.value.trim())}
            placeholder={conexao ? `••••${conexao.token_final} (deixe em branco para manter)` : 'Cole o token que chegou por e-mail'}
            className="mt-1 w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>
      <p className="text-gray-500 text-xs mt-2">
        O token fica guardado criptografado e não aparece de novo nesta tela. Não é a senha da sua conta PagBank.
      </p>

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={salvar} disabled={salvando || !podeSalvar}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition">
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
        {conexao && (
          <button type="button" onClick={testar} disabled={testando}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition">
            {testando ? 'Testando...' : 'Testar conexão'}
          </button>
        )}
        {conexao && (
          <button type="button" onClick={remover}
            className="ml-auto inline-flex items-center gap-1.5 text-red-400 hover:text-red-300 text-sm px-2 py-2.5">
            <Trash2 size={14} /> Desligar
          </button>
        )}
      </div>

      {resultadoTeste && (
        <p className={`text-sm mt-3 ${resultadoTeste.ok ? 'text-emerald-400' : 'text-red-400'}`}>{resultadoTeste.texto}</p>
      )}

      <button type="button" onClick={() => setTutorial(t => !t)}
        className="mt-4 inline-flex items-center gap-1 text-acento text-sm font-semibold hover:underline">
        Como pedir o token EDI no PagBank <ChevronDown size={14} className={`transition ${tutorial ? 'rotate-180' : ''}`} />
      </button>
      {tutorial && (
        <ol className="mt-2 list-decimal pl-5 space-y-1.5 text-sm text-gray-400">
          <li>Abra a página do EDI do PagBank (link abaixo) e entre no portal de solicitação.</li>
          <li>Escolha <strong className="text-gray-300">Novas Ativações - EDI</strong> e o tipo <strong className="text-gray-300">Geração de token API EDI</strong>.</li>
          <li>Na descrição, informe o número do seu estabelecimento e peça um token <strong className="text-gray-300">1x1</strong> (um token para esse estabelecimento).</li>
          <li>O token chega no e-mail que você informou. Cole aqui junto com o número do estabelecimento e toque em Salvar.</li>
          <li>Toque em <strong className="text-gray-300">Testar conexão</strong>. A partir do dia seguinte, as vendas entram sozinhas.</li>
          <li className="list-none -ml-5 pt-1">
            <a href={LINK_PEDIR_TOKEN} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-acento hover:underline">
              Página do EDI no PagBank <ExternalLink size={12} />
            </a>
            <span className="text-gray-500"> · Dúvidas no PagBank: edi@pagbank.com.br</span>
          </li>
        </ol>
      )}
    </div>
  )
}
