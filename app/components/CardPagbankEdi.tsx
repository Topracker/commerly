'use client'
// Card "Maquininha (PagBank)" do financeiro e do dashboard: bruto, taxa e
// líquido do mês das vendas do PagBank, última sincronização e "Sincronizar
// agora". Só aparece para quem cadastrou o token EDI em Configurações.

import { useCallback, useEffect, useState } from 'react'
import { CreditCard, RefreshCw } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { diaLoja, formatarHora, inicioMesLoja, somarDias } from '../lib/datas'

type Props = {
  supabase: SupabaseClient
  lojaId: string
  onToast?: (msg: string, tipo: 'sucesso' | 'erro') => void
  /** Chamado depois de uma sincronização que trouxe venda nova. */
  onSincronizou?: () => void
  compacto?: boolean
}

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "hoje 07:00", "ontem 12:03", "05/11 07:00". */
export function quandoSincronizou(iso: string): string {
  const dia = diaLoja(iso)
  const hoje = diaLoja()
  const hora = formatarHora(iso)
  if (dia === hoje) return `hoje ${hora}`
  if (dia === somarDias(hoje, -1)) return `ontem ${hora}`
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)} ${hora}`
}

export function CardPagbankEdi({ supabase, lojaId, onToast, onSincronizou, compacto }: Props) {
  const [conexao, setConexao] = useState<{ status: string; ultima_sincronizacao: string | null; ultimo_erro: string | null } | null>(null)
  const [mes, setMes] = useState({ qtd: 0, bruto: 0, taxa: 0, liquido: 0 })
  const [sincronizando, setSincronizando] = useState(false)

  // Busca e aplica em passos separados: o setState fica no callback da promessa.
  const buscar = useCallback(async () => {
    const { data: con, error } = await supabase.from('pagbank_edi_conexoes')
      .select('status, ultima_sincronizacao, ultimo_erro').eq('loja_id', lojaId).maybeSingle()
    if (error || !con) return null
    const { data: vendas } = await supabase.from('vendas').select('valor_total, taxa, valor_liquido')
      .eq('loja_id', lojaId).eq('adquirente', 'pagbank')
      .gte('created_at', inicioMesLoja().toISOString()).limit(10000)
    const m = { qtd: 0, bruto: 0, taxa: 0, liquido: 0 }
    for (const v of vendas ?? []) {
      const bruto = Number(v.valor_total) || 0
      m.qtd++
      m.bruto += bruto
      m.taxa += Number(v.taxa) || 0
      m.liquido += v.valor_liquido == null ? bruto : Number(v.valor_liquido)
    }
    return { con, m }
  }, [supabase, lojaId])

  const aplicar = (r: Awaited<ReturnType<typeof buscar>>) => {
    setConexao(r?.con ?? null)
    if (r) setMes(r.m)
  }
  const carregar = async () => aplicar(await buscar())

  useEffect(() => { if (lojaId) buscar().then(aplicar) }, [lojaId, buscar]) // eslint-disable-line react-hooks/exhaustive-deps

  async function sincronizar() {
    setSincronizando(true)
    const res = await fetch('/api/maquininha/pagbank-edi/sincronizar', { method: 'POST' }).catch(() => null)
    const j = await res?.json().catch(() => null)
    setSincronizando(false)
    if (!res?.ok) onToast?.(j?.erro || j?.mensagem || 'Não foi possível sincronizar agora.', 'erro')
    else if (j?.novas > 0) onToast?.(`${j.novas} venda${j.novas > 1 ? 's' : ''} nova${j.novas > 1 ? 's' : ''} da maquininha PagBank.`, 'sucesso')
    else onToast?.(j?.mensagem || 'Tudo em dia: nenhuma venda nova.', 'sucesso')
    await carregar()
    if (j?.novas > 0) onSincronizou?.()
  }

  if (!conexao) return null
  const alerta = conexao.status === 'credencial_invalida' || conexao.status === 'erro'

  return (
    <div className={`bg-gray-900 rounded-2xl ${compacto ? 'p-4 mb-3' : 'p-5 mb-4'}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-white font-semibold text-sm flex items-center gap-2">
          <CreditCard size={15} className="text-acento" /> Maquininha (PagBank) neste mês
        </p>
        <button type="button" onClick={sincronizar} disabled={sincronizando}
          className="inline-flex items-center gap-1.5 text-acento hover:underline text-xs font-semibold shrink-0 disabled:opacity-50">
          <RefreshCw size={12} className={sincronizando ? 'animate-spin' : ''} />
          {sincronizando ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-400">Vendas</span><span className="text-white">{mes.qtd}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Valor bruto</span><span className="text-green-400">{reais(mes.bruto)}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">− Taxas do PagBank</span><span className="text-amber-300">{reais(mes.taxa)}</span></div>
        <div className="flex justify-between border-t border-gray-800 pt-2 mt-1 font-bold"><span className="text-white">= Líquido</span><span className="text-white">{reais(mes.liquido)}</span></div>
      </div>
      <p className="text-gray-500 text-xs mt-3">
        {conexao.ultima_sincronizacao ? `Última sincronização: ${quandoSincronizou(conexao.ultima_sincronizacao)}` : 'Ainda não sincronizou.'}
        {conexao.status === 'aguardando' && ' · O PagBank ainda está fechando o dia; tentamos de novo mais tarde.'}
      </p>
      {alerta && (
        <p className="text-red-400 text-xs mt-1">
          {conexao.ultimo_erro || 'Erro na última sincronização.'}{' '}
          <a href="/configuracoes" className="underline">Ver em Configurações</a>
        </p>
      )}
    </div>
  )
}
