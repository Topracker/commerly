'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Landmark, TrendingUp, TrendingDown, Wallet, AlertTriangle, Receipt, Banknote, WalletCards, CreditCard } from 'lucide-react'
import { situacaoAcerto, type AcertoComConfirmacoes } from '../lib/acertos'
import { diaLoja, formatarData, inicioDiaLoja } from '../lib/datas'
import { FORMA_VALE_CAIXA, ORDEM_FORMAS, formaDaVenda, formaDoPedido, type FormaResumo } from '../lib/vale'
import {
  LIMITE_MEI_ANUAL, SALARIO_MINIMO, cmvDosItens, fluxoDeCaixa, limiteMeiProporcional,
  usoDoLimiteMei, valorDasMei, type AtividadeMei, type Entrada, type MesFinanceiro, type Saida,
} from '../lib/financeiro'

const MESES_GRAFICO = 6
const reais = (v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const ATIVIDADES: { valor: AtividadeMei; label: string }[] = [
  { valor: 'comercio', label: 'Comércio' },
  { valor: 'servicos', label: 'Serviços' },
  { valor: 'ambos', label: 'Ambos' },
]

export default function Financeiro() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [saidas, setSaidas] = useState<Saida[]>([])
  const [carregando, setCarregando] = useState(true)
  const [regime, setRegime] = useState<string>('mei')
  const [atividade, setAtividade] = useState<AtividadeMei>('comercio')
  // Acertos em dinheiro (lib/acertos.ts): repasses de entregadores ainda não
  // confirmados e créditos que a Commerly deve à loja (cupom da Garantia).
  const [acertos, setAcertos] = useState<AcertoComConfirmacoes[]>([])
  // Entradas do mês atual por forma de pagamento (vale separado — lib/vale.ts).
  const [porForma, setPorForma] = useState<{ forma: FormaResumo; valor: number }[]>([])
  const [maquininha, setMaquininha] = useState({ bruto: 0, taxa: 0, liquido: 0, qtd: 0 })

  useEffect(() => {
    if (!loja) return
    setRegime(loja.regime || 'mei')
    setAtividade((loja.mei_atividade as AtividadeMei) || 'comercio')
    carregar()
  }, [loja])

  async function carregar() {
    setCarregando(true)
    // Meses no fuso da loja (app/lib/datas.ts).
    const [ano, mes] = diaLoja().split('-').map(Number)
    const mesAntigo = new Date(Date.UTC(ano, mes - MESES_GRAFICO, 1))
    const seisMeses = inicioDiaLoja(mesAntigo.toISOString().slice(0, 10))
    const inicioAno = inicioDiaLoja(`${ano}-01-01`)
    // O gráfico quer 6 meses; o limite do MEI quer o ano todo. Uma query só.
    const desde = new Date(Math.min(seisMeses.getTime(), inicioAno.getTime())).toISOString()

    const [vendasRes, pedidosRes, gastosRes, produtosRes] = await Promise.all([
      // `*`: taxa e valor_liquido só existem depois da migração da maquininha.
      supabase.from('vendas').select('*').eq('loja_id', loja.id).gte('created_at', desde),
      // `*` e não lista: forma_pagamento só existe depois da migração do vale,
      // e uma coluna inexistente na lista derrubaria o financeiro inteiro.
      supabase.from('pedidos_clientes').select('*')
        .eq('loja_id', loja.id).neq('status', 'cancelado').gte('created_at', desde),
      supabase.from('gastos').select('valor, created_at').eq('loja_id', loja.id).gte('created_at', desde),
      supabase.from('produtos').select('id, custo').eq('loja_id', loja.id),
    ])

    const custoPorProduto = new Map<string, number>(
      (produtosRes.data || []).map((p: { id: string; custo: number | null }) => [p.id, Number(p.custo) || 0]),
    )

    const ents: Entrada[] = []
    // Venda de balcão/integração: o CMV está implícito (valor_total - lucro).
    for (const v of vendasRes.data || []) {
      const valor = Number(v.valor_total) || 0
      ents.push({ valor, cmv: Math.max(0, valor - (Number(v.lucro) || 0)), data: v.created_at as string })
    }
    // Pedido online: a taxa de entrega não é receita da loja (vai pro entregador).
    for (const p of pedidosRes.data || []) {
      const bruto = Number(p.total) || 0
      const taxa = Number(p.taxa_entrega) || 0
      ents.push({
        valor: Math.max(0, bruto - taxa),
        cmv: cmvDosItens(p.itens, custoPorProduto),
        data: p.created_at as string,
      })
    }

    setEntradas(ents)

    // Mesma régua das Entradas (pedido = total − taxa), só que por forma e
    // só no mês corrente — a soma bate com o card "Entradas".
    const mesCorrente = diaLoja().slice(0, 7)
    const soma = new Map<FormaResumo, number>()
    const somar = (f: FormaResumo, v: number) => soma.set(f, (soma.get(f) || 0) + v)
    const maq = { bruto: 0, taxa: 0, liquido: 0, qtd: 0 }
    for (const v of vendasRes.data || []) {
      if (diaLoja(v.created_at as string).slice(0, 7) !== mesCorrente) continue
      const forma = formaDaVenda(v.forma_pagamento, v.origem)
      somar(forma, Number(v.valor_total) || 0)
      if (forma === 'Maquininha') {
        maq.qtd++
        maq.bruto += Number(v.valor_total) || 0
        maq.taxa += Number(v.taxa) || 0
        maq.liquido += v.valor_liquido == null ? Number(v.valor_total) || 0 : Number(v.valor_liquido)
      }
    }
    setMaquininha(maq)
    for (const p of pedidosRes.data || []) {
      if (diaLoja(p.created_at as string).slice(0, 7) === mesCorrente) {
        somar(formaDoPedido(p), Math.max(0, (Number(p.total) || 0) - (Number(p.taxa_entrega) || 0)))
      }
    }
    setPorForma(ORDEM_FORMAS.filter(f => (soma.get(f) || 0) > 0).map(f => ({ forma: f, valor: soma.get(f) || 0 })))
    setSaidas((gastosRes.data || []).map(g => ({ valor: Number(g.valor) || 0, data: g.created_at as string })))

    const { data: acs } = await supabase.from('acertos_dinheiro').select('*, acertos_confirmacoes(*)')
      .eq('loja_id', loja.id).eq('para_papel', 'loja').is('estorna_id', null).order('created_at', { ascending: false }).limit(300)
    setAcertos((acs || []) as AcertoComConfirmacoes[])
    setCarregando(false)
  }

  // "A receber": só o que ainda não foi confirmado como recebido pela loja.
  const aReceber = useMemo(() => {
    const pend = acertos.filter(a => situacaoAcerto(a) !== 'confirmado')
    const soma = (xs: AcertoComConfirmacoes[]) => xs.reduce((s, a) => s + Number(a.valor), 0)
    return {
      entregadores: soma(pend.filter(a => a.de_papel === 'entregador')),
      nEntregadores: pend.filter(a => a.de_papel === 'entregador').length,
      commerly: soma(pend.filter(a => a.de_papel === 'commerly')),
      nCommerly: pend.filter(a => a.de_papel === 'commerly').length,
      // Vale com entregador: passou na maquininha da loja, falta ela confirmar.
      vale: soma(pend.filter(a => a.de_papel === 'cliente')),
      nVale: pend.filter(a => a.de_papel === 'cliente').length,
    }
  }, [acertos])

  const meses: MesFinanceiro[] = useMemo(
    () => fluxoDeCaixa(entradas, saidas, MESES_GRAFICO),
    [entradas, saidas],
  )
  const mesAtual = meses[meses.length - 1]

  const faturamentoAno = useMemo(() => {
    const ano = diaLoja().slice(0, 4)
    return entradas
      .filter(e => diaLoja(e.data).slice(0, 4) === ano)
      .reduce((a, e) => a + e.valor, 0)
  }, [entradas])

  async function salvarFiscal(novoRegime: string, novaAtividade: AtividadeMei) {
    setRegime(novoRegime)
    setAtividade(novaAtividade)
    const { error } = await supabase.from('lojas')
      .update({ regime: novoRegime, mei_atividade: novaAtividade }).eq('id', loja.id)
    if (error) mostrarToast('Erro ao salvar', 'erro')
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!loja) return null

  const das = valorDasMei(atividade)
  const uso = usoDoLimiteMei(faturamentoAno)
  const pctLimite = Math.min(100, Math.round(uso * 100))
  const estourou = uso >= 1
  const perto = uso >= 0.8 && !estourou

  return (
    <AppLayout loja={loja} sair={sair} titulo="Financeiro" maxWidth="max-w-3xl">
      <Toast toast={toast} />

      {carregando ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : (
        <>
          {/* Mês atual */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-900 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1"><TrendingUp size={13} /> Entradas</div>
              <p className="text-lg font-bold text-green-400">{reais(mesAtual.entradas)}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1"><TrendingDown size={13} /> Saídas</div>
              <p className="text-lg font-bold text-red-400">{reais(mesAtual.saidas)}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1"><Wallet size={13} /> Saldo de caixa</div>
              <p className={`text-lg font-bold ${mesAtual.saldo >= 0 ? 'text-white' : 'text-red-400'}`}>{reais(mesAtual.saldo)}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1"><Landmark size={13} /> Lucro real</div>
              <p className={`text-lg font-bold ${mesAtual.lucroReal >= 0 ? 'text-acento' : 'text-red-400'}`}>{reais(mesAtual.lucroReal)}</p>
            </div>
          </div>

          {/* A receber em dinheiro (Caminho B): entregadores e Commerly */}
          {/* Entradas do mês por forma de pagamento */}
          {porForma.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5 mb-4">
              <p className="text-white font-semibold text-sm mb-3">Entradas do mês por forma de pagamento</p>
              <div className="flex flex-col gap-2 text-sm">
                {porForma.map(({ forma, valor }) => (
                  <div key={forma} className={`flex justify-between gap-2 ${forma === FORMA_VALE_CAIXA ? 'rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 -mx-2' : ''}`}>
                    <span className={`flex items-center gap-1.5 ${forma === FORMA_VALE_CAIXA ? 'text-emerald-300 font-semibold' : 'text-gray-400'}`}>
                      {forma === FORMA_VALE_CAIXA && <WalletCards size={13} />} {forma}
                    </span>
                    <span className="text-white font-semibold shrink-0">{reais(valor)}</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-500 text-xs mt-3">
                Caixa e delivery somados. No delivery conta o valor dos produtos (a taxa de entrega é do entregador).
              </p>
            </div>
          )}

          {/* Maquininha física: sincronizada ou importada */}
          <div className="bg-gray-900 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-white font-semibold text-sm flex items-center gap-2"><CreditCard size={15} className="text-acento" /> Maquininha neste mês</p>
              <a href="/financeiro/importar-maquininha" className="text-acento hover:underline text-xs font-semibold shrink-0">Importar vendas</a>
            </div>
            {maquininha.qtd > 0 ? (
              <>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Vendas</span><span className="text-white">{maquininha.qtd}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Valor bruto</span><span className="text-green-400">{reais(maquininha.bruto)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">− Taxas da maquininha</span><span className="text-amber-300">{reais(maquininha.taxa)}</span></div>
                  <div className="flex justify-between border-t border-gray-800 pt-2 mt-1 font-bold"><span className="text-white">= Líquido</span><span className="text-white">{reais(maquininha.liquido)}</span></div>
                </div>
                <p className="text-gray-500 text-xs mt-3">
                  O valor bruto entra nas Entradas. O extrato não diz o custo do que foi vendido, então essas vendas não aumentam o lucro real.
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-xs">Nenhuma venda de maquininha neste mês.</p>
            )}
          </div>

          {(aReceber.nEntregadores > 0 || aReceber.nCommerly > 0 || aReceber.nVale > 0) && (
            <div className="bg-gray-900 rounded-2xl p-5 mb-4">
              <p className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Banknote size={15} className="text-acento" /> A receber</p>
              <div className="flex flex-col gap-2 text-sm">
                {aReceber.nEntregadores > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">Repasses de entregadores ({aReceber.nEntregadores} pedido{aReceber.nEntregadores > 1 ? 's' : ''} em dinheiro)</span>
                    <span className="text-amber-300 font-semibold shrink-0">{reais(aReceber.entregadores)}</span>
                  </div>
                )}
                {aReceber.nVale > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">Vale (VA/VR) a confirmar na maquininha ({aReceber.nVale} pedido{aReceber.nVale > 1 ? 's' : ''})</span>
                    <span className="text-amber-300 font-semibold shrink-0">{reais(aReceber.vale)}</span>
                  </div>
                )}
                {aReceber.nCommerly > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">Crédito da Commerly (cupom da Garantia bancado pela plataforma)</span>
                    <span className="text-amber-300 font-semibold shrink-0">{reais(aReceber.commerly)}</span>
                  </div>
                )}
              </div>
              <p className="text-gray-500 text-xs mt-3">
                Confirme os repasses em <a href="/pedidos" className="text-acento hover:underline">Pedidos</a> quando o entregador acertar com você.
                As entradas acima já contam esses pedidos como vendidos.
              </p>
            </div>
          )}

          {/* Lucro real explicado */}
          <div className="bg-gray-900 rounded-2xl p-5 mb-4">
            <p className="text-white font-semibold text-sm mb-3">Como chegamos no lucro real deste mês</p>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Receita</span><span className="text-green-400">{reais(mesAtual.entradas)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">− Custo dos produtos vendidos</span><span className="text-amber-300">{reais(mesAtual.cmv)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">− Gastos</span><span className="text-red-400">{reais(mesAtual.saidas)}</span></div>
              <div className="flex justify-between border-t border-gray-800 pt-2 mt-1 font-bold">
                <span className="text-white">= Lucro real</span>
                <span className={mesAtual.lucroReal >= 0 ? 'text-acento' : 'text-red-400'}>{reais(mesAtual.lucroReal)}</span>
              </div>
            </div>
            <p className="text-gray-600 text-xs mt-3">
              O custo vem do campo &quot;custo&quot; de cada produto. Produtos sem custo cadastrado entram como zero
              e inflam o lucro — vale conferir em Produtos.
            </p>
          </div>

          {/* Fluxo de caixa */}
          <div className="bg-gray-900 rounded-2xl p-5 mb-4">
            <p className="text-white font-semibold mb-4">Fluxo de caixa — {MESES_GRAFICO} meses</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={meses} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-800)" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fill: 'var(--color-gray-500)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--color-gray-500)', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-gray-900)', border: '1px solid var(--color-gray-700)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--tema-tinta)', fontSize: 12 }}
                  formatter={(v, n) => [reais(Number(v) || 0), n === 'entradas' ? 'Entradas' : 'Saídas']}
                  cursor={{ fill: 'var(--color-gray-800)' }}
                />
                <Legend formatter={(v) => <span className="text-xs text-gray-400">{v === 'entradas' ? 'Entradas' : 'Saídas'}</span>} />
                <Bar dataKey="entradas" fill="var(--color-acento)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" fill="var(--color-red-400)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Regime + DAS */}
          <div className="bg-gray-900 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={16} className="text-blue-400" />
              <p className="text-white font-semibold">Imposto</p>
            </div>

            <label className="text-gray-400 text-xs">Regime</label>
            <select
              value={regime}
              onChange={e => salvarFiscal(e.target.value, atividade)}
              className="w-full mt-1 mb-4 bg-gray-800 text-white rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="mei">MEI</option>
              <option value="simples">Simples Nacional</option>
              <option value="outro">Outro</option>
            </select>

            {regime === 'mei' ? (
              <>
                <label className="text-gray-400 text-xs">Atividade</label>
                <div className="flex gap-2 mt-1 mb-4">
                  {ATIVIDADES.map(a => (
                    <button
                      key={a.valor}
                      onClick={() => salvarFiscal(regime, a.valor)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                        atividade === a.valor ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-4 mb-4">
                  <p className="text-gray-400 text-xs mb-1">DAS mensal</p>
                  <p className="text-2xl font-bold text-white">{reais(das)}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    5% do salário mínimo ({reais(SALARIO_MINIMO)}) + tributo fixo da atividade.
                  </p>
                </div>

                <p className="text-gray-400 text-xs mb-2">
                  Faturamento de {new Date().getFullYear()}: <strong className="text-gray-200">{reais(faturamentoAno)}</strong> de {reais(LIMITE_MEI_ANUAL)}
                </p>
                <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden mb-2">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-700 ${estourou ? 'bg-red-500' : perto ? 'bg-amber-400' : 'bg-green-500'}`}
                    style={{ width: `${pctLimite}%` }}
                  />
                </div>

                {estourou ? (
                  <div className="flex items-start gap-2 text-red-300 text-xs">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <p>Você passou do teto do MEI. Procure um contador: pode haver desenquadramento e cobrança de diferença.</p>
                  </div>
                ) : perto ? (
                  <div className="flex items-start gap-2 text-amber-300 text-xs">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <p>Você já usou {pctLimite}% do teto anual. Faltam {reais(LIMITE_MEI_ANUAL - faturamentoAno)}.</p>
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs">Faltam {reais(LIMITE_MEI_ANUAL - faturamentoAno)} para o teto anual.</p>
                )}

                <p className="text-gray-600 text-xs mt-3">
                  Abriu o MEI este ano? O teto é proporcional: {reais(limiteMeiProporcional(12 - new Date().getMonth()))} se
                  abriu em {formatarData(new Date(), { month: 'long' })}.
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-xs">
                O cálculo automático de imposto hoje só cobre o MEI. Para {regime === 'simples' ? 'o Simples Nacional' : 'outros regimes'}, use o fluxo de caixa acima com seu contador.
              </p>
            )}
          </div>
        </>
      )}
    </AppLayout>
  )
}
