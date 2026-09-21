'use client'
// Configurações de delivery introduzidas nesta leva:
//   #5  Preço dinâmico
//   #9  Classificação nutricional dos produtos (IA)
//   #14 Aceitar entrega por drone
//   Cupom no Modo Festa (2026-09-20)

import { useEffect, useState } from 'react'
import { Loader2, Salad, Zap } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FATOR_PICO, FATOR_DEMANDA, LIMIAR_DEMANDA } from '../lib/precoDinamico'
import { DRONE_RAIO_MAX_KM, DRONE_PESO_MAX_KG, DRONE_HORA_INICIO, DRONE_HORA_FIM } from '../lib/drone'
import { AVISO_NUTRI } from '../lib/nutri'
import { AVISO_CUPOM_LOJA } from '../lib/cupons'

type Props = {
  supabase: SupabaseClient
  lojaId: string
  onToast: (msg: string, tipo: 'sucesso' | 'erro') => void
}

function Alternador({ ligado, onMudar, titulo, children }: {
  ligado: boolean
  onMudar: (v: boolean) => void
  titulo: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onMudar(!ligado)}
      className={`w-full rounded-xl border p-4 text-left transition ${
        ligado ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 bg-white/5 hover:border-white/20'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white">{titulo}</span>
        <span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${ligado ? 'bg-emerald-500' : 'bg-gray-700'}`}>
          <span className={`h-4 w-4 rounded-full bg-white transition ${ligado ? 'translate-x-4' : ''}`} />
        </span>
      </div>
      <div className="mt-1.5 text-xs leading-relaxed text-gray-400">{children}</div>
    </button>
  )
}

export function ConfigDelivery({ supabase, lojaId, onToast }: Props) {
  const [precoDinamico, setPrecoDinamico] = useState(false)
  const [aceitaDrone, setAceitaDrone] = useState(false)
  const [aceitaCupom, setAceitaCupom] = useState(false)
  const [carregado, setCarregado] = useState(false)

  const [classificando, setClassificando] = useState(false)
  const [restantes, setRestantes] = useState<number | null>(null)

  useEffect(() => {
    if (!lojaId) return
    supabase.from('lojas').select('preco_dinamico, aceita_drone, aceita_cupom').eq('id', lojaId).maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setPrecoDinamico(!!data.preco_dinamico)
          setAceitaDrone(!!data.aceita_drone)
          setAceitaCupom(!!data.aceita_cupom)
        }
        setCarregado(true)
      })
  }, [lojaId, supabase])

  type Flag = 'preco_dinamico' | 'aceita_drone' | 'aceita_cupom'
  const flags: Record<Flag, [boolean, (v: boolean) => void]> = {
    preco_dinamico: [precoDinamico, setPrecoDinamico],
    aceita_drone: [aceitaDrone, setAceitaDrone],
    aceita_cupom: [aceitaCupom, setAceitaCupom],
  }

  async function salvarFlag(campo: Flag, valor: boolean) {
    const [anterior, setter] = flags[campo]
    setter(valor)

    // `.select()` de propósito: a RLS bloqueia em silêncio (204, zero linhas).
    const { data, error } = await supabase.from('lojas').update({ [campo]: valor }).eq('id', lojaId).select('id')
    if (error || !data || data.length === 0) {
      setter(anterior) // reverte o otimismo
      onToast('Não foi possível salvar. Tente novamente.', 'erro')
      return
    }
    onToast('Configuração salva.', 'sucesso')
  }

  async function classificar() {
    setClassificando(true)
    try {
      // A rota processa em lotes; chamamos até zerar a fila.
      let restam = Infinity
      let voltas = 0
      while (restam > 0 && voltas < 10) {
        const r = await fetch('/api/nutri/classificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        const d = await r.json()
        if (!r.ok) { onToast(d.erro || 'Erro ao classificar.', 'erro'); return }
        restam = d.restantes ?? 0
        setRestantes(restam)
        voltas++
        if ((d.classificados ?? 0) === 0) break // nada avançou; evita laço infinito
      }
      onToast('Produtos classificados.', 'sucesso')
    } catch {
      onToast('Erro de rede ao classificar.', 'erro')
    } finally {
      setClassificando(false)
    }
  }

  if (!carregado) return null

  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-bold text-white">Delivery avançado</h3>

      <Alternador
        ligado={precoDinamico}
        onMudar={v => salvarFlag('preco_dinamico', v)}
        titulo="🔥 Preço dinâmico"
      >
        <p>
          Sexta, sábado e domingo das {18}h às {22}h os preços sobem {Math.round(FATOR_PICO * 100)}%.
          Com {LIMIAR_DEMANDA} ou mais pedidos abertos ao mesmo tempo, sobem mais {Math.round(FATOR_DEMANDA * 100)}%.
        </p>
        <p className="mt-1 text-gray-500">
          O cliente vê o aviso e o preço já ajustado antes de fechar. O valor é congelado no
          pedido — ninguém é cobrado a mais depois de confirmar.
        </p>
      </Alternador>

      <Alternador
        ligado={aceitaDrone}
        onMudar={v => salvarFlag('aceita_drone', v)}
        titulo="🚁 Aceito entrega por drone"
      >
        <p>
          Entregadores com drone poderão aceitar seus pedidos. O sistema só permite até{' '}
          {DRONE_RAIO_MAX_KM} km, {DRONE_PESO_MAX_KG} kg e das {DRONE_HORA_INICIO}h às {DRONE_HORA_FIM}h.
        </p>
        <p className="mt-1 text-gray-500">
          Para o limite de peso funcionar, cadastre o peso dos seus produtos.
        </p>
      </Alternador>

      <Alternador
        ligado={aceitaCupom}
        onMudar={v => salvarFlag('aceita_cupom', v)}
        titulo="🎟️ Aceito cupom no Modo Festa"
      >
        <p>
          No Modo Festa várias pessoas pedem juntas, de até 3 lojas, para um endereço só — são
          pedidos maiores. Com o cupom liberado, sua loja aparece com o selo &quot;Aceita cupom&quot;
          e entra no rateio do desconto de quem criou a festa.
        </p>
        <p className="mt-1 text-gray-500">
          {AVISO_CUPOM_LOJA}
        </p>
      </Alternador>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <Salad className="h-4 w-4" /> Classificação nutricional
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
          A IA lê o nome e a descrição de cada produto e marca as tags (vegetariano, sem glúten,
          menos de 500 cal, low carb). Clientes filtram a busca por elas.
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">{AVISO_NUTRI}</p>

        <button
          type="button"
          onClick={classificar}
          disabled={classificando}
          className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-50"
        >
          {classificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {classificando ? 'Classificando...' : 'Classificar meus produtos'}
        </button>

        {restantes !== null && !classificando && (
          <p className="mt-2 text-xs text-gray-500">
            {restantes === 0 ? 'Todos os produtos estão classificados.' : `${restantes} produtos ainda sem classificação.`}
          </p>
        )}
      </div>
    </div>
  )
}
