'use client'
import { useState, useEffect } from 'react'
import { useCliente } from '../../hooks/useCliente'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { ClienteLayout } from '../../components/ClienteLayout'
import { CardIndicacao } from '../../components/CardIndicacao'
import { PainelGamificacao } from '../../components/PainelGamificacao'
import { PerfilPrivacidadeCard } from '../../components/PerfilPrivacidadeCard'
import { nivelDoCliente } from '../../lib/fidelidade'
import { Sparkles } from 'lucide-react'

type PontoLoja = { loja_id: string; pontos: number; nome: string }

export default function ClienteDashboard() {
  const { cliente, loading, supabase, sair } = useCliente()
  const { toast, mostrarToast } = useToast()

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)

  // Fidelidade
  const [pontosLojas, setPontosLojas] = useState<PontoLoja[]>([])
  const totalPontos = pontosLojas.reduce((s, p) => s + p.pontos, 0)
  const nivel = nivelDoCliente(totalPontos)

  useEffect(() => {
    if (cliente) {
      setNome(cliente.nome || '')
      setCpf(cliente.cpf || '')
      carregarEmail()
      carregarPontos()
    }
  }, [cliente])

  async function carregarPontos() {
    const { data: rows } = await supabase
      .from('pontos_clientes').select('loja_id, pontos').eq('cliente_id', cliente.id).gt('pontos', 0)
    if (!rows || rows.length === 0) { setPontosLojas([]); return }
    // Nomes das lojas via view pública (a tabela lojas tem RLS owner-only).
    const ids = rows.map((r: any) => r.loja_id)
    const { data: lojas } = await supabase.from('lojas_publicas').select('id, nome').in('id', ids)
    const nomes = new Map((lojas || []).map((l: any) => [l.id, l.nome]))
    setPontosLojas(
      rows
        .map((r: any) => ({ loja_id: r.loja_id, pontos: Number(r.pontos) || 0, nome: nomes.get(r.loja_id) || 'Loja' }))
        .sort((a: PontoLoja, b: PontoLoja) => b.pontos - a.pontos),
    )
  }

  async function carregarEmail() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setEmail(user.email || '')
  }

  async function salvarPerfil() {
    if (!nome.trim()) { mostrarToast('Nome é obrigatório', 'erro'); return }
    setSalvandoPerfil(true)
    const { error } = await supabase
      .from('clientes')
      .update({ nome: nome.trim(), cpf: cpf.trim() || null })
      .eq('id', cliente.id)
    if (error) mostrarToast('Erro ao salvar perfil', 'erro')
    else mostrarToast('Perfil atualizado!', 'sucesso')
    setSalvandoPerfil(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <Toast toast={toast} />
      <h1 className="text-2xl font-bold text-white mb-6 hidden md:block">Minha conta</h1>

      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* Gamificação: XP, nível, missões, medalhas, streak */}
        <PainelGamificacao papel="cliente" />

        {/* Privacidade do perfil público */}
        <PerfilPrivacidadeCard />

        {/* Indique e ganhe (código de indicação + link de convite) */}
        <CardIndicacao />

        {/* Programa de fidelidade */}
        <div className="rounded-2xl p-6 border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-900/40">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: `${nivel.cor}22`, border: `1px solid ${nivel.cor}55` }}
              >
                {nivel.emoji}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Nível de fidelidade</p>
                <p className="text-lg font-bold" style={{ color: nivel.cor }}>{nivel.nome}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-white tabular-nums flex items-center gap-1.5 justify-end">
                <Sparkles size={18} className="text-[#F5C34B]" />{totalPontos}
              </p>
              <p className="text-xs text-gray-400">pontos acumulados</p>
            </div>
          </div>

          {nivel.proximo != null && (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (totalPontos / nivel.proximo) * 100)}%`, backgroundColor: nivel.cor }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                Faltam <span className="text-gray-300 font-medium">{Math.max(0, nivel.proximo - totalPontos)}</span> pontos para o próximo nível.
              </p>
            </div>
          )}

          {pontosLojas.length > 0 ? (
            <div className="mt-4 border-t border-gray-800 pt-4">
              <p className="text-xs text-gray-500 mb-2">Seus pontos por loja</p>
              <div className="flex flex-col gap-1.5">
                {pontosLojas.map(p => (
                  <div key={p.loja_id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300 truncate">{p.nome}</span>
                    <span className="text-white font-semibold tabular-nums shrink-0 ml-3">{p.pontos} pts</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mt-4 border-t border-gray-800 pt-4">
              Faça pedidos nas lojas de delivery e ganhe <span className="text-gray-300">1 ponto por R$ 1</span>. Junte 100 pontos e troque por R$ 5 de desconto.
            </p>
          )}
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="text-white font-semibold text-lg">Meu perfil</h2>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Nome</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">CPF</label>
            <input
              value={cpf}
              onChange={e => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">E-mail</label>
            <input
              value={email}
              disabled
              className="w-full bg-gray-800 text-gray-500 rounded-xl px-4 py-3 outline-none cursor-not-allowed"
            />
          </div>
          <button
            onClick={salvarPerfil}
            disabled={salvandoPerfil}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
          >
            {salvandoPerfil ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </ClienteLayout>
  )
}
