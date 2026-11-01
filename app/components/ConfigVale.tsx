'use client'
// Vale-alimentação / vale-refeição (VA/VR) na maquininha da loja (lib/vale.ts).
//
// Componente à parte do ConfigDelivery DE PROPÓSITO: lê/grava `aceita_vale` e
// `vale_bandeiras` numa query própria. Antes da migração
// sql/2026-10-31-vale-alimentacao.sql as colunas não existem e a query falha —
// aqui isso só esconde o bloco; dentro do select do ConfigDelivery derrubaria
// o preço dinâmico/drone/cupom junto.

import { useEffect, useState } from 'react'
import { Check, CreditCard } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BANDEIRAS_VALE, ROTULO_BANDEIRA, bandeirasValidas, type BandeiraVale } from '../lib/vale'

type Props = {
  supabase: SupabaseClient
  lojaId: string
  onToast: (msg: string, tipo: 'sucesso' | 'erro') => void
}

export function ConfigVale({ supabase, lojaId, onToast }: Props) {
  const [disponivel, setDisponivel] = useState(false)
  const [ligado, setLigado] = useState(false)
  const [bandeiras, setBandeiras] = useState<BandeiraVale[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!lojaId) return
    supabase.from('lojas').select('aceita_vale, vale_bandeiras').eq('id', lojaId).maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return // pré-migração: o bloco não aparece
        setLigado(!!data.aceita_vale)
        setBandeiras(bandeirasValidas(data.vale_bandeiras))
        setDisponivel(true)
      })
  }, [lojaId, supabase])

  // Grava os dois campos juntos: o CHECK do banco exige ao menos uma bandeira
  // com o vale ligado. `.select()` porque a RLS bloqueia em silêncio.
  async function salvar(novoLigado: boolean, novas: BandeiraVale[]) {
    if (novoLigado && novas.length === 0) {
      onToast('Escolha pelo menos uma bandeira de vale.', 'erro')
      return
    }
    const anterior = { ligado, bandeiras }
    setLigado(novoLigado); setBandeiras(novas); setSalvando(true)
    const { data, error } = await supabase.from('lojas')
      .update({ aceita_vale: novoLigado, vale_bandeiras: novas }).eq('id', lojaId).select('id')
    setSalvando(false)
    if (error || !data || data.length === 0) {
      setLigado(anterior.ligado); setBandeiras(anterior.bandeiras)
      onToast('Não foi possível salvar. Tente novamente.', 'erro')
      return
    }
    onToast(novoLigado ? 'Vale (VA/VR) ativado.' : novas.length ? 'Configuração salva.' : 'Vale (VA/VR) desligado.', 'sucesso')
  }

  function alternarLigado() {
    // Ao ligar sem nada marcado, já sugere as mais comuns — o lojista ajusta.
    if (!ligado) salvar(true, bandeiras.length ? bandeiras : ['alelo', 'vr', 'ticket', 'pluxee'])
    else salvar(false, bandeiras)
  }

  function alternarBandeira(b: BandeiraVale) {
    const novas = bandeiras.includes(b) ? bandeiras.filter(x => x !== b) : BANDEIRAS_VALE.filter(x => x === b || bandeiras.includes(x))
    if (ligado && novas.length === 0) { onToast('Deixe pelo menos uma bandeira, ou desligue o vale.', 'erro'); return }
    salvar(ligado, novas)
  }

  if (!disponivel) return null

  return (
    <div className={`rounded-xl border p-4 transition ${ligado ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 bg-white/5'}`}>
      <button type="button" onClick={alternarLigado} disabled={salvando} className="w-full text-left disabled:opacity-60">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-white">
            <CreditCard className="h-4 w-4 shrink-0" /> Aceito vale-alimentação/refeição (VA/VR) na maquininha
          </span>
          <span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${ligado ? 'bg-emerald-500' : 'bg-gray-700'}`}>
            <span className={`h-4 w-4 rounded-full bg-white transition ${ligado ? 'translate-x-4' : ''}`} />
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
          O cliente escolhe &quot;Vale na entrega&quot; e paga na <strong className="text-gray-300">sua maquininha</strong> —
          o entregador leva ou você mesmo cobra. A Commerly não processa o vale e não cobra taxa a mais.
          Sua loja ganha o selo &quot;Aceita VA/VR&quot; na vitrine.
        </p>
      </button>

      {ligado && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-gray-400">Quais você aceita?</p>
          <div className="flex flex-wrap gap-1.5">
            {BANDEIRAS_VALE.map(b => {
              const marcada = bandeiras.includes(b)
              return (
                <button key={b} type="button" onClick={() => alternarBandeira(b)} disabled={salvando}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                    marcada ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-gray-400 hover:border-white/25'
                  }`}>
                  {marcada && <Check className="h-3 w-3" />} {ROTULO_BANDEIRA[b]}
                </button>
              )
            })}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-gray-500">
            Com entregador: ele cobra o vale na sua maquininha, você confirma o recebimento em Pedidos
            e paga a corrida (a taxa de entrega) a ele.
          </p>
        </div>
      )}
    </div>
  )
}
