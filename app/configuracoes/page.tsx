'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { salvarNichoCustom, carregarNichoCustom } from '../lib/nicheStore'
import { MODULOS, type ModuloKey } from '../lib/nichos'
import { Eye, EyeOff, Store, Copy, ExternalLink } from 'lucide-react'

// Módulos que a IA pode sugerir / o comerciante pode escolher no fluxo "Outro".
const MODULOS_ESCOLHIVEIS: ModuloKey[] = ['agenda', 'servicos', 'pedidos', 'estoque', 'produtos', 'vendas', 'fornecedores']

const TIPOS = [
  'Açougue', 'Barbearia', 'Delivery', 'Distribuidora de bebidas',
  'Eletrônicos', 'Farmácia', 'Hamburgueria', 'Hortifruti',
  'Lanchonete', 'Loja de roupas', 'Mercadinho', 'Mercado',
  'Padaria', 'Pet Shop', 'Pizzaria', 'Restaurante',
  'Salão de Beleza', 'Sorveteria', 'Outro',
]

const HORAS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

function validarCPF(cpf: string) {
  cpf = cpf.replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  return resto === parseInt(cpf[10])
}

function validarCNPJ(cnpj: string) {
  cnpj = cnpj.replace(/\D/g, '')
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false
  const calc = (c: string, arr: number[]) => {
    let soma = 0
    for (let i = 0; i < arr.length; i++) soma += parseInt(c[i]) * arr[i]
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const d1 = calc(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13])
}

function formatarDocumento(valor: string) {
  const nums = valor.replace(/\D/g, '')
  if (nums.length <= 11) {
    return nums
      .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      .replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')
      .replace(/(\d{3})(\d{3})/, '$1.$2')
  } else {
    return nums
      .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
      .replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1.$2.$3/$4')
      .replace(/(\d{2})(\d{3})(\d{3})/, '$1.$2.$3')
      .replace(/(\d{2})(\d{3})/, '$1.$2')
  }
}

function formatarTelefone(valor: string): string {
  const nums = valor.replace(/\D/g, '').slice(0, 11)
  if (nums.length <= 2) return nums ? `(${nums}` : ''
  if (nums.length <= 6) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`
  if (nums.length <= 10) return `(${nums.slice(0, 2)}) ${nums.slice(2, 6)}-${nums.slice(6)}`
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`
}

function erroTelefone(valor: string): string {
  const nums = valor.replace(/\D/g, '')
  if (!nums) return ''
  const ddd = parseInt(nums.slice(0, 2))
  if (ddd < 11 || ddd > 99) return 'DDD inválido'
  if (nums.length < 10 || nums.length > 11) return 'Número incompleto'
  return ''
}

function erroInstagram(valor: string): string {
  if (!valor) return ''
  if (!/^@[\w.]{1,30}$/.test(valor)) return 'Use o formato @usuario'
  return ''
}

function parseHorario(horario: string): [string, string] {
  const match = horario?.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/)
  return match ? [match[1], match[2]] : ['08:00', '18:00']
}

export default function Configuracoes() {
  const { user, loja, setLoja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [documento, setDocumento] = useState('')
  const [localizacao, setLocalizacao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [horarioAbertura, setHorarioAbertura] = useState('08:00')
  const [horarioFechamento, setHorarioFechamento] = useState('18:00')
  const [metaMensal, setMetaMensal] = useState(5000)

  const [erroDoc, setErroDoc] = useState('')
  const [erroTel, setErroTel] = useState('')
  const [erroIG, setErroIG] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Blur/reveal
  const [mostrarDoc, setMostrarDoc] = useState(false)
  const [mostrarTel, setMostrarTel] = useState(false)

  // Fluxo de IA para tipo "Outro" (mesmo do onboarding)
  const [iaDescricao, setIaDescricao] = useState('')
  const [iaLoading, setIaLoading] = useState(false)
  const [iaErro, setIaErro] = useState('')
  const [iaResumo, setIaResumo] = useState('')
  const [tipoCustom, setTipoCustom] = useState('')
  const [modulosSel, setModulosSel] = useState<ModuloKey[]>([])

  // Link da loja pública (montado no client pra usar o origin correto)
  const [linkPublico, setLinkPublico] = useState('')

  useEffect(() => {
    if (loja?.id) {
      const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      setLinkPublico(`${base}/loja/${loja.id}`)
    }
  }, [loja?.id])

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(linkPublico)
      mostrarToast('Link copiado!', 'sucesso')
    } catch {
      mostrarToast('Não foi possível copiar o link', 'erro')
    }
  }

  useEffect(() => {
    if (loja) {
      setNome(loja.nome)
      // Tipo custom (ramo sugerido pela IA, ex.: "Floricultura") não está na
      // lista fixa: cai em "Outro" e reidrata o painel da IA com o que foi salvo.
      if (TIPOS.includes(loja.tipo)) {
        setTipo(loja.tipo)
      } else {
        setTipo('Outro')
        setTipoCustom(loja.tipo)
        const custom = carregarNichoCustom(loja.id)
        if (custom) {
          setIaDescricao(custom.descricao || '')
          setModulosSel(custom.modulos || [])
          setIaResumo(custom.modulos?.length ? 'Módulos salvos para o seu negócio.' : '')
        }
      }
      setDocumento(formatarDocumento(loja.documento || ''))
      setLocalizacao(loja.localizacao || '')
      setTelefone(formatarTelefone(loja.telefone || ''))
      setInstagram(loja.instagram || '')
      const [ab, fe] = parseHorario(loja.horario || '')
      setHorarioAbertura(ab)
      setHorarioFechamento(fe)
      setMetaMensal(Number(loja.meta_mensal) || 5000)
    }
  }, [loja])

  async function consultarIA() {
    if (!iaDescricao.trim()) { setIaErro('Conta um pouco sobre o seu negócio.'); return }
    setIaLoading(true); setIaErro('')
    try {
      const res = await fetch('/api/onboarding-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: iaDescricao }),
      })
      const data = await res.json()
      if (!res.ok) { setIaErro(data.erro || 'Erro ao consultar a IA.'); setIaLoading(false); return }
      setIaResumo(data.resumo || '')
      if (data.tipoSugerido) setTipoCustom(data.tipoSugerido)
      setModulosSel(((data.modulos || []) as string[]).filter(k => MODULOS_ESCOLHIVEIS.includes(k as ModuloKey)) as ModuloKey[])
    } catch {
      setIaErro('Erro de rede. Tente novamente.')
    }
    setIaLoading(false)
  }

  function toggleModulo(k: ModuloKey) {
    setModulosSel(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
  }

  function handleDocumento(valor: string) {
    const formatado = formatarDocumento(valor)
    setDocumento(formatado)
    const nums = valor.replace(/\D/g, '')
    if (nums.length === 11) setErroDoc(validarCPF(nums) ? '' : 'CPF inválido')
    else if (nums.length === 14) setErroDoc(validarCNPJ(nums) ? '' : 'CNPJ inválido')
    else setErroDoc('')
  }

  function handleTelefone(valor: string) {
    const formatado = formatarTelefone(valor)
    setTelefone(formatado)
    setErroTel(erroTelefone(formatado))
  }

  function handleInstagram(valor: string) {
    setInstagram(valor)
    setErroIG(erroInstagram(valor))
  }

  async function salvar() {
    if (!nome || !tipo) { mostrarToast('Nome e tipo são obrigatórios!', 'erro'); return }
    const nums = documento.replace(/\D/g, '')
    if (nums.length === 11 && !validarCPF(nums)) { mostrarToast('CPF inválido!', 'erro'); return }
    if (nums.length === 14 && !validarCNPJ(nums)) { mostrarToast('CNPJ inválido!', 'erro'); return }
    if (erroTel) { mostrarToast('Telefone inválido!', 'erro'); return }
    if (erroIG) { mostrarToast('Formato de Instagram inválido!', 'erro'); return }

    const horario = `${horarioAbertura} - ${horarioFechamento}`
    // Para "Outro", o ramo sugerido pela IA (se houver) vira o tipo da loja.
    const tipoFinal = tipo === 'Outro' && tipoCustom.trim() ? tipoCustom.trim() : tipo

    setSalvando(true)
    const { error } = await supabase.from('lojas').update({
      nome, tipo: tipoFinal, documento, localizacao, telefone, instagram, horario, meta_mensal: metaMensal,
    }).eq('id', loja.id)
    if (error) { mostrarToast('Erro ao salvar configurações', 'erro'); setSalvando(false); return }

    // Tipo custom ("Outro"): guarda os módulos escolhidos pra personalizar
    // dashboard e sidebar. Nichos conhecidos usam a config estática.
    if (tipo === 'Outro') {
      salvarNichoCustom(loja.id, {
        tipo: tipoFinal,
        descricao: iaDescricao.trim(),
        modulos: modulosSel,
      })
    }

    // Atualiza a loja local pra dashboard e menu lateral refletirem o novo
    // nicho na hora (useNicho recomputa a partir do tipo atualizado).
    setLoja({ ...loja, nome, tipo: tipoFinal, documento, localizacao, telefone, instagram, horario, meta_mensal: metaMensal })

    mostrarToast('Configurações salvas!', 'sucesso')
    setSalvando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  const inputClass = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'
  const selectClass = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <AppLayout loja={loja} sair={sair} titulo="Configurações" maxWidth="max-w-2xl">
      <Toast toast={toast} />

      <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4 mb-6">
        {/* E-mail da conta — somente leitura */}
        <div>
          <label className="block text-gray-400 text-xs mb-1.5">E-mail da conta</label>
          <input
            type="email"
            value={user?.email || ''}
            readOnly
            disabled
            className={`w-full ${inputClass} opacity-60 cursor-not-allowed`}
          />
          <p className="text-gray-600 text-xs mt-1">Vinculado ao seu login. Não pode ser alterado por aqui.</p>
        </div>

        <input placeholder="Nome da loja *" value={nome} onChange={e => setNome(e.target.value)} className={inputClass} />

        <select value={tipo} onChange={e => setTipo(e.target.value)} className={selectClass}>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* IA de onboarding — aparece quando o comerciante escolhe "Outro" */}
        {tipo === 'Outro' && (
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <p className="text-white font-semibold text-sm">Personalize seu painel</p>
            </div>
            <p className="text-gray-400 text-xs">
              Conta com suas palavras o que o seu negócio faz, que eu sugiro os módulos certos pro seu dashboard.
            </p>
            <textarea
              value={iaDescricao}
              onChange={e => setIaDescricao(e.target.value)}
              placeholder="Ex: Tenho uma floricultura, vendo flores e arranjos e faço entregas..."
              rows={3}
              maxLength={1000}
              className={`${inputClass} resize-none text-sm`}
            />
            <button
              type="button"
              onClick={consultarIA}
              disabled={iaLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition text-sm"
            >
              {iaLoading ? 'Pensando...' : iaResumo ? 'Gerar de novo' : 'Sugerir módulos'}
            </button>
            {iaErro && <p className="text-red-400 text-sm">{iaErro}</p>}

            {(iaResumo || modulosSel.length > 0) && (
              <div className="flex flex-col gap-3 border-t border-gray-800 pt-3">
                {iaResumo && <p className="text-gray-300 text-sm">{iaResumo}</p>}
                {tipoCustom && (
                  <div>
                    <label className="text-gray-500 text-xs">Ramo identificado</label>
                    <input
                      value={tipoCustom}
                      onChange={e => setTipoCustom(e.target.value)}
                      maxLength={30}
                      className={`w-full ${inputClass} text-sm mt-1`}
                    />
                  </div>
                )}
                <div>
                  <p className="text-gray-500 text-xs mb-2">Módulos do seu painel (toque pra ativar/desativar)</p>
                  <div className="flex flex-wrap gap-2">
                    {MODULOS_ESCOLHIVEIS.map(k => {
                      const ativo = modulosSel.includes(k)
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => toggleModulo(k)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                            ativo
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {MODULOS[k].emoji} {MODULOS[k].label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CPF / CNPJ com olhinho */}
        <div>
          <div className="relative flex items-center">
            {mostrarDoc ? (
              <input
                value={documento}
                onChange={e => handleDocumento(e.target.value)}
                maxLength={18}
                className={`w-full pr-10 ${inputClass} ${erroDoc ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
              />
            ) : (
              <div className={`w-full pr-10 ${inputClass} cursor-pointer select-none`} style={{ filter: 'blur(5px)' }}>
                {documento || '—'}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMostrarDoc(v => !v)}
              className="absolute right-3 text-gray-400 hover:text-white transition"
            >
              {mostrarDoc ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {erroDoc && <p className="text-red-400 text-sm mt-1">{erroDoc}</p>}
        </div>

        <input placeholder="Localização" value={localizacao} onChange={e => setLocalizacao(e.target.value)} className={inputClass} />

        {/* Telefone com olhinho */}
        <div>
          <div className="relative flex items-center">
            {mostrarTel ? (
              <input
                value={telefone}
                onChange={e => handleTelefone(e.target.value)}
                placeholder="(11) 98765-4321"
                className={`w-full pr-10 ${inputClass} ${erroTel ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
              />
            ) : (
              <div className={`w-full pr-10 ${inputClass} cursor-pointer select-none`} style={{ filter: 'blur(5px)' }}>
                {telefone || '—'}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMostrarTel(v => !v)}
              className="absolute right-3 text-gray-400 hover:text-white transition"
            >
              {mostrarTel ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {erroTel && <p className="text-red-400 text-sm mt-1">{erroTel}</p>}
        </div>

        {/* Instagram */}
        <div>
          <input
            placeholder="Instagram (ex: @minha_loja)"
            value={instagram}
            onChange={e => handleInstagram(e.target.value)}
            className={`w-full ${inputClass} ${erroIG ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
          />
          {erroIG && <p className="text-red-400 text-sm mt-1">{erroIG}</p>}
        </div>

        {/* Horário de funcionamento */}
        <div>
          <p className="text-gray-400 text-xs mb-2">Horário de funcionamento</p>
          <div className="flex items-center gap-3">
            <select value={horarioAbertura} onChange={e => setHorarioAbertura(e.target.value)} className={`flex-1 ${selectClass}`}>
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-gray-500 text-sm shrink-0">até</span>
            <select value={horarioFechamento} onChange={e => setHorarioFechamento(e.target.value)} className={`flex-1 ${selectClass}`}>
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        {/* Meta mensal */}
        <div>
          <label className="block text-gray-400 text-xs mb-1.5">🎯 Meta mensal de faturamento (R$)</label>
          <input
            type="number"
            min={0}
            step={100}
            value={metaMensal}
            onChange={e => setMetaMensal(Math.max(0, Number(e.target.value)))}
            className={`w-full ${inputClass}`}
          />
          <p className="text-gray-600 text-xs mt-1">Padrão: R$ 5.000. Aparece como barra de progresso no dashboard.</p>
        </div>

        <button
          onClick={salvar}
          disabled={salvando || !!erroDoc || !!erroTel || !!erroIG}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
        >
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>

      {/* Minha loja pública */}
      <div className="bg-gray-900 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Store size={18} className="text-blue-400" />
          <h2 className="text-white font-semibold">Minha loja pública</h2>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          Compartilhe este link em redes sociais e no WhatsApp. Qualquer pessoa pode ver sua loja,
          produtos e avaliações — sem precisar de login.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={linkPublico}
            readOnly
            onFocus={e => e.target.select()}
            className={`flex-1 ${inputClass} text-sm`}
          />
          <div className="flex gap-2">
            <button
              onClick={copiarLink}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              <Copy size={16} />
              Copiar
            </button>
            <a
              href={linkPublico || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none bg-gray-800 hover:bg-gray-700 text-white font-medium px-4 py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              <ExternalLink size={16} />
              Abrir
            </a>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
