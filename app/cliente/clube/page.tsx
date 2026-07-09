'use client'
import { useEffect, useState } from 'react'
import { useCliente } from '../../hooks/useCliente'
import { ClienteLayout } from '../../components/ClienteLayout'
import { nivelDoCliente, descontoDePontos, PONTOS_POR_BLOCO, DESCONTO_POR_BLOCO } from '../../lib/fidelidade'
import { Sparkles, Store, ArrowUpRight, ArrowDownRight } from 'lucide-react'

type Movimento = {
  id: string
  tipo: 'ganho' | 'resgate'
  pontos: number
  created_at: string
  loja_id: string | null
}

type PontoLoja = { loja_id: string; pontos: number; nome: string }

const reais = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

export default function ClienteClube() {
  const { cliente, loading, supabase, sair } = useCliente()
  const [saldo, setSaldo] = useState(0)
  const [totalAcumulado, setTotalAcumulado] = useState(0)
  const [porLoja, setPorLoja] = useState<PontoLoja[]>([])
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { if (cliente) carregar() }, [cliente])

  async function carregar() {
    setCarregando(true)
    // clube_saldo é uma view security_invoker sobre pontos_clientes: a RLS
    // garante que o cliente só some os próprios pontos.
    const [saldoRes, porLojaRes, movRes] = await Promise.all([
      supabase.from('clube_saldo').select('saldo, total_acumulado').eq('cliente_id', cliente.id).maybeSingle(),
      supabase.from('pontos_clientes').select('loja_id, pontos').eq('cliente_id', cliente.id).gt('pontos', 0),
      supabase.from('clube_movimentos').select('id, tipo, pontos, created_at, loja_id')
        .eq('cliente_id', cliente.id).order('created_at', { ascending: false }).limit(20),
    ])

    setSaldo(Number(saldoRes.data?.saldo) || 0)
    setTotalAcumulado(Number(saldoRes.data?.total_acumulado) || 0)
    setMovimentos((movRes.data || []) as Movimento[])

    const rows = porLojaRes.data || []
    const ids = [...new Set([
      ...rows.map((r: { loja_id: string }) => r.loja_id),
      ...(movRes.data || []).map((m: { loja_id: string | null }) => m.loja_id).filter(Boolean) as string[],
    ])]
    const nomes = new Map<string, string>()
    if (ids.length) {
      const { data: lojas } = await supabase.from('lojas_publicas').select('id, nome').in('id', ids)
      for (const l of lojas || []) nomes.set(l.id, l.nome)
    }
    setPorLoja(
      rows
        .map((r: { loja_id: string; pontos: number }) => ({
          loja_id: r.loja_id, pontos: Number(r.pontos) || 0, nome: nomes.get(r.loja_id) || 'Loja',
        }))
        .sort((a: PontoLoja, b: PontoLoja) => b.pontos - a.pontos),
    )
    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!cliente) return null

  const nivel = nivelDoCliente(totalAcumulado)
  const faltam = nivel.proximo != null ? nivel.proximo - totalAcumulado : 0
  const pctNivel = nivel.proximo != null
    ? Math.min(100, Math.round((totalAcumulado / nivel.proximo) * 100))
    : 100
  const valeEmReais = descontoDePontos(saldo)

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <div className="max-w-2xl mx-auto">
        {/* Saldo global */}
        <div className="bg-gradient-to-br from-blue-950/70 to-gray-900 border border-blue-900/60 rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={15} className="text-blue-300" />
            <p className="text-blue-200 text-sm font-semibold">Clube Commerly</p>
          </div>
          <p className="text-4xl font-bold text-white mt-2">{saldo.toLocaleString('pt-BR')}</p>
          <p className="text-gray-400 text-sm">pontos · valem {reais(valeEmReais)} de desconto</p>
          <p className="text-gray-500 text-xs mt-3">
            Seus pontos valem em <strong className="text-gray-300">qualquer loja Commerly</strong>.
            Ganhe 1 ponto por real e troque {PONTOS_POR_BLOCO} pontos por {reais(DESCONTO_POR_BLOCO)}.
          </p>
        </div>

        {/* Nível */}
        <div className="bg-gray-900 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{nivel.emoji}</span>
              <p className="font-bold" style={{ color: nivel.cor }}>{nivel.nome}</p>
            </div>
            <p className="text-gray-500 text-xs">{totalAcumulado.toLocaleString('pt-BR')} pts acumulados</p>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
            <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${pctNivel}%`, backgroundColor: nivel.cor }} />
          </div>
          <p className="text-gray-500 text-xs mt-2">
            {nivel.proximo != null
              ? `Faltam ${faltam.toLocaleString('pt-BR')} pontos para o próximo nível.`
              : 'Você está no nível máximo. 💎'}
          </p>
        </div>

        {/* Onde os pontos foram ganhos */}
        {porLoja.length > 0 && (
          <div className="bg-gray-900 rounded-2xl p-5 mb-4">
            <p className="text-white font-semibold text-sm mb-3">Onde você acumulou</p>
            <div className="flex flex-col gap-2">
              {porLoja.map(l => (
                <div key={l.loja_id} className="flex items-center gap-2 text-sm">
                  <Store size={14} className="text-gray-500 shrink-0" />
                  <span className="text-gray-300 truncate flex-1">{l.nome}</span>
                  <span className="text-blue-300 font-semibold shrink-0">{l.pontos} pts</span>
                </div>
              ))}
            </div>
            <p className="text-gray-600 text-xs mt-3">
              Não importa onde ganhou: na hora de resgatar, usamos o saldo total.
            </p>
          </div>
        )}

        {/* Extrato */}
        <div className="bg-gray-900 rounded-2xl p-5">
          <p className="text-white font-semibold text-sm mb-3">Extrato</p>
          {carregando ? (
            <p className="text-gray-500 text-sm">Carregando...</p>
          ) : movimentos.length === 0 ? (
            <p className="text-gray-500 text-sm">Faça seu primeiro pedido para começar a acumular pontos.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {movimentos.map(m => {
                const ganho = m.tipo === 'ganho'
                return (
                  <div key={m.id} className="flex items-center gap-3 text-sm border-b border-gray-800 last:border-0 pb-2 last:pb-0">
                    {ganho
                      ? <ArrowUpRight size={15} className="text-green-400 shrink-0" />
                      : <ArrowDownRight size={15} className="text-amber-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300">{ganho ? 'Pontos ganhos' : 'Resgate'}</p>
                      <p className="text-gray-600 text-xs">
                        {new Date(m.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className={`font-semibold shrink-0 ${ganho ? 'text-green-400' : 'text-amber-400'}`}>
                      {ganho ? '+' : '−'}{m.pontos}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </ClienteLayout>
  )
}
