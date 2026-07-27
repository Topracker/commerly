'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'
import {
  validarCPF, formatarCPF, formatarTelefone,
  erroCPF, erroTelefone, checarDuplicidade, MSG_DUPLICADO,
  registrarCadastroIp, AVISO_VERIFICACAO,
} from '../../lib/validacoes'
import {
  uploadFotoEntregador, VEICULOS, CATEGORIAS_CNH, exigeCNH, exigeDocsDrone, idadeEmAnos,
  LINK_BOLSA, COMPROMISSO_BOLSA, type TipoVeiculo,
} from '../../lib/entregadores'
import { DRONE_RAIO_MAX_KM, DRONE_PESO_MAX_KG, DRONE_HORA_INICIO, DRONE_HORA_FIM } from '../../lib/drone'
import { Camera, AlertTriangle } from 'lucide-react'

// Upload de foto reutilizável (rosto / documento / CNH) com preview.
function FotoUpload({ label, hint, preview, onPick, captura = 'environment', redondo = false }: {
  label: string; hint?: string; preview: string; captura?: 'user' | 'environment'; redondo?: boolean
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="block text-gray-400 text-xs mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`bg-superficie border-2 border-dashed border-borda hover:border-acento overflow-hidden flex items-center justify-center transition ${
          redondo ? 'w-24 h-24 rounded-full mx-auto' : 'w-full h-36 rounded-xl'
        }`}
      >
        {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <Camera size={24} className="text-gray-500" />}
      </button>
      {hint && <p className="text-gray-600 text-xs mt-1">{hint}</p>}
      <input ref={ref} type="file" accept="image/*" capture={captura} onChange={onPick} className="hidden" />
    </div>
  )
}

export default function EntregadorOnboarding() {
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [telefone, setTelefone] = useState('')

  const [documentoTipo, setDocumentoTipo] = useState<'RG' | 'CNH' | ''>('')
  const [documentoNumero, setDocumentoNumero] = useState('')
  const [docFoto, setDocFoto] = useState<File | null>(null)
  const [docPreview, setDocPreview] = useState('')

  const [veiculoTipo, setVeiculoTipo] = useState<TipoVeiculo | ''>('')
  const [droneSerie, setDroneSerie] = useState('')
  const [droneAnac, setDroneAnac] = useState('')

  const [cnhNumero, setCnhNumero] = useState('')
  const [cnhCategoria, setCnhCategoria] = useState('')
  const [cnhFoto, setCnhFoto] = useState<File | null>(null)
  const [cnhPreview, setCnhPreview] = useState('')

  const [rostoFoto, setRostoFoto] = useState<File | null>(null)
  const [rostoPreview, setRostoPreview] = useState('')

  // Equipamento: bolsa térmica. `null` = ainda não respondeu (a escolha é
  // obrigatória, mas responder "não tenho" NÃO impede o cadastro).
  const [temBolsa, setTemBolsa] = useState<boolean | null>(null)
  const [bolsaFoto, setBolsaFoto] = useState<File | null>(null)
  const [bolsaPreview, setBolsaPreview] = useState('')
  const [bolsaCompromisso, setBolsaCompromisso] = useState(false)

  const [erroCpfMsg, setErroCpfMsg] = useState('')
  const [erroTelMsg, setErroTelMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/entregador-delivery/login')
    })
  }, [])

  const precisaCNH = exigeCNH(veiculoTipo)
  const precisaDocsDrone = exigeDocsDrone(veiculoTipo)
  // Limite de data: precisa ter ao menos 18 anos hoje.
  const maxData = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10) })()

  function pegarImagem(setFile: (f: File) => void, setPrev: (s: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (!f) return
      if (!f.type.startsWith('image/')) { setErro('Selecione uma imagem.'); return }
      setFile(f); setPrev(URL.createObjectURL(f)); setErro('')
    }
  }

  async function salvar() {
    // Validações (padrão dos apps de delivery).
    if (!nome.trim()) { setErro('Informe seu nome completo.'); return }
    if (!validarCPF(cpf)) { setErro('Informe um CPF válido.'); return }
    if (!dataNascimento) { setErro('Informe sua data de nascimento.'); return }
    const idade = idadeEmAnos(dataNascimento)
    if (isNaN(idade) || idade < 18) { setErro('Você precisa ter 18 anos ou mais para ser entregador.'); return }
    if (idade > 100) { setErro('Data de nascimento inválida.'); return }
    if (!telefone || erroTelefone(telefone)) { setErro('Informe um telefone válido com DDD.'); return }
    if (!documentoTipo) { setErro('Escolha o tipo de documento de identidade (RG ou CNH).'); return }
    if (!documentoNumero.trim()) { setErro('Informe o número do documento de identidade.'); return }
    if (!docFoto) { setErro('Envie a foto do seu documento de identidade.'); return }
    if (!veiculoTipo) { setErro('Escolha o tipo de veículo.'); return }
    // O banco também recusa (entregadores_drone_docs_chk); aqui é só a mensagem boa.
    if (precisaDocsDrone && (!droneSerie.trim() || !droneAnac.trim())) {
      setErro('Drone exige número de série e registro ANAC.'); return
    }
    if (!rostoFoto) { setErro('Envie uma foto do seu rosto para verificação.'); return }
    // Equipamento: responder é obrigatório; "não tenho" é resposta válida e
    // deixa cadastrar (bloquear aqui só afastaria entregador — a cobrança vem
    // pelo aviso e pela aprovação do /admin).
    if (temBolsa === null) { setErro('Responda se você tem bolsa térmica.'); return }
    if (temBolsa) {
      if (!bolsaFoto) { setErro('Envie uma foto da sua bolsa térmica.'); return }
      if (!bolsaCompromisso) { setErro('Confirme o compromisso de usar bolsa térmica nas entregas.'); return }
    }
    if (precisaCNH) {
      if (!cnhNumero.trim()) { setErro('Moto/carro exigem CNH — informe o número.'); return }
      if (!cnhCategoria) { setErro('Informe a categoria da sua CNH.'); return }
      if (!cnhFoto) { setErro('Envie a foto da sua CNH.'); return }
    }

    setLoading(true); setErro('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/entregador-delivery/login'); return }

    // Conta exclusiva: não pode já ser loja/cliente/fornecedor.
    const [{ data: loja }, { data: cliente }, { data: fornecedor }] = await Promise.all([
      supabase.from('lojas').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('clientes').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('fornecedores').select('id').eq('user_id', user.id).maybeSingle(),
    ])
    if (loja || cliente || fornecedor) {
      await supabase.auth.signOut()
      setErro('Este e-mail já está cadastrado em outra área do Commerly.'); setLoading(false); return
    }
    const { data: jaExiste } = await supabase.from('entregadores').select('id').eq('user_id', user.id).maybeSingle()
    if (jaExiste) { router.push('/entregador-delivery/dashboard'); return }

    // CPF e telefone não podem se repetir em outra conta do Commerly.
    const dup = await checarDuplicidade({ cpf, telefone })
    if (dup.erro) { setErro(dup.erro); setLoading(false); return }
    if (dup.duplicado) { setErro(MSG_DUPLICADO[dup.duplicado]); setLoading(false); return }

    const lim = await registrarCadastroIp('entregador')
    if (!lim.ok) { setErro(lim.erro!); setLoading(false); return }

    // Uploads (rosto + documento + CNH quando aplicável).
    const rostoRes = await uploadFotoEntregador(supabase, user.id, rostoFoto, 'rosto')
    if ('error' in rostoRes) { setErro(rostoRes.error); setLoading(false); return }
    const docRes = await uploadFotoEntregador(supabase, user.id, docFoto, 'documento')
    if ('error' in docRes) { setErro(docRes.error); setLoading(false); return }
    let cnh_foto_url: string | null = null
    if (precisaCNH && cnhFoto) {
      const cnhRes = await uploadFotoEntregador(supabase, user.id, cnhFoto, 'cnh')
      if ('error' in cnhRes) { setErro(cnhRes.error); setLoading(false); return }
      cnh_foto_url = cnhRes.url
    }
    let bolsa_foto_url: string | null = null
    if (temBolsa && bolsaFoto) {
      const bolsaRes = await uploadFotoEntregador(supabase, user.id, bolsaFoto, 'bolsa')
      if ('error' in bolsaRes) { setErro(bolsaRes.error); setLoading(false); return }
      bolsa_foto_url = bolsaRes.url
    }

    const { error } = await supabase.from('entregadores').insert({
      user_id: user.id,
      nome: nome.trim(),
      cpf,
      data_nascimento: dataNascimento,
      telefone,
      foto_url: rostoRes.url,
      documento_tipo: documentoTipo,
      documento_numero: documentoNumero.trim(),
      documento_foto_url: docRes.url,
      veiculo_tipo: veiculoTipo,
      drone_serie: precisaDocsDrone ? droneSerie.trim() : null,
      drone_anac: precisaDocsDrone ? droneAnac.trim() : null,
      cnh_numero: precisaCNH ? cnhNumero.trim() : null,
      cnh_categoria: precisaCNH ? cnhCategoria : null,
      cnh_foto_url,
      // O CHECK `entregadores_bolsa_chk` exige foto + compromisso quando
      // tem_bolsa é true; os três campos andam juntos de propósito.
      tem_bolsa: temBolsa,
      bolsa_foto_url,
      bolsa_confirmada_em: temBolsa && bolsaCompromisso ? new Date().toISOString() : null,
    })
    if (error) {
      if (error.code === '23505') setErro('Já existe um entregador para esta conta.')
      else setErro('Erro ao salvar. Tente novamente.')
      setLoading(false); return
    }
    router.push('/entregador-delivery/dashboard')
  }

  const inp = 'bg-superficie border border-borda text-white rounded-xl px-4 py-3 outline-none focus:border-acento/60 transition'
  const label = 'block text-gray-400 text-xs mb-1.5'

  return (
    <main className="min-h-screen bg-fundo flex items-center justify-center p-6">
      <div className="bg-card border border-borda rounded-3xl p-8 w-full max-w-md">
        <p className="text-acento text-sm font-semibold mb-1">🛵 Área do Entregador</p>
        <h1 className="text-2xl font-bold text-white mb-1">Complete seu cadastro</h1>
        <p className="text-gray-400 mb-6">Precisamos verificar seus dados antes de liberar as entregas.</p>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        <div className="flex flex-col gap-4">
          {/* Foto do rosto (verificação) */}
          <FotoUpload
            label="Foto do rosto (verificação) *"
            hint="Selfie nítida, sem óculos escuros ou boné."
            preview={rostoPreview}
            captura="user"
            redondo
            onPick={pegarImagem(setRostoFoto, setRostoPreview)}
          />

          <div>
            <label className={label}>Nome completo *</label>
            <input type="text" autoComplete="name" placeholder="Nome como no documento" value={nome} onChange={e => setNome(e.target.value)} className={`w-full ${inp}`} />
          </div>

          <div>
            <label className={label}>CPF *</label>
            <input type="text" inputMode="numeric" placeholder="000.000.000-00" value={cpf}
              onChange={e => { setCpf(formatarCPF(e.target.value)); setErroCpfMsg(erroCPF(e.target.value)) }}
              className={`w-full ${inp} ${erroCpfMsg ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`} />
            {erroCpfMsg && <p className="text-red-400 text-sm mt-1">{erroCpfMsg}</p>}
          </div>

          <div>
            <label className={label}>Data de nascimento *</label>
            <input type="date" max={maxData} value={dataNascimento} onChange={e => setDataNascimento(e.target.value)} className={`w-full ${inp}`} />
            <p className="text-gray-600 text-xs mt-1">É preciso ter 18 anos ou mais.</p>
          </div>

          <div>
            <label className={label}>Telefone / WhatsApp *</label>
            <input type="tel" inputMode="numeric" placeholder="(11) 98765-4321" value={telefone}
              onChange={e => { setTelefone(formatarTelefone(e.target.value)); setErroTelMsg(erroTelefone(e.target.value)) }}
              className={`w-full ${inp} ${erroTelMsg ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`} />
            {erroTelMsg && <p className="text-red-400 text-sm mt-1">{erroTelMsg}</p>}
          </div>

          {/* Documento de identidade */}
          <div className="border-t border-borda pt-4">
            <p className="text-white font-semibold text-sm mb-3">Documento de identidade</p>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                {(['RG', 'CNH'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setDocumentoTipo(t)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
                      documentoTipo === t ? 'bg-acento border-acento text-white' : 'bg-elevado border-borda text-gray-400 hover:bg-borda'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
              <input type="text" placeholder={`Número do ${documentoTipo || 'documento'}`} value={documentoNumero}
                onChange={e => setDocumentoNumero(e.target.value)} className={`w-full ${inp}`} />
              <FotoUpload
                label="Foto do documento *"
                hint="Frente do RG ou CNH, legível."
                preview={docPreview}
                onPick={pegarImagem(setDocFoto, setDocPreview)}
              />
            </div>
          </div>

          {/* Veículo */}
          <div className="border-t border-borda pt-4">
            <label className={label}>Tipo de veículo *</label>
            <div className="grid grid-cols-2 gap-2">
              {VEICULOS.map(v => (
                <button key={v.valor} type="button" onClick={() => setVeiculoTipo(v.valor)}
                  className={`py-3 rounded-xl text-sm font-semibold border transition flex items-center justify-center gap-2 ${
                    veiculoTipo === v.valor ? 'bg-acento border-acento text-white' : 'bg-elevado border-borda text-gray-300 hover:bg-borda'
                  }`}>
                  <span>{v.emoji}</span> {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Equipamento: bolsa térmica.
              Responder é obrigatório, TER não é: quem não tem segue no cadastro
              e recebe o aviso. Barrar aqui afastaria entregador sem melhorar
              entrega nenhuma — a régua real é a aprovação no /admin, que vê a
              foto. Vale bolsa de qualquer marca; o Kit Oficial é opcional e
              ainda nem está à venda. */}
          <div className="border-t border-borda pt-4">
            <p className="text-white font-semibold text-sm mb-1">🎒 Equipamento</p>
            <label className={label}>Você tem bolsa térmica para transportar pedidos? *</label>
            <div className="grid grid-cols-1 gap-2">
              {([
                { v: true, t: 'Sim, tenho bolsa térmica' },
                { v: false, t: 'Ainda não tenho' },
              ] as const).map(o => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setTemBolsa(o.v)}
                  className={`py-3 px-4 rounded-xl text-sm font-semibold border transition text-left ${
                    temBolsa === o.v ? 'bg-acento border-acento text-white' : 'bg-elevado border-borda text-gray-300 hover:bg-borda'
                  }`}
                >
                  {o.t}
                </button>
              ))}
            </div>

            {temBolsa === true && (
              <div className="flex flex-col gap-3 mt-3">
                <FotoUpload
                  label="Foto da sua bolsa térmica *"
                  hint="Qualquer marca serve. Só precisamos ver que ela conserva a temperatura."
                  preview={bolsaPreview}
                  onPick={pegarImagem(setBolsaFoto, setBolsaPreview)}
                />
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bolsaCompromisso}
                    onChange={e => setBolsaCompromisso(e.target.checked)}
                    className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--color-acento)]"
                  />
                  <span className="text-gray-300 text-sm leading-snug">{COMPROMISSO_BOLSA}</span>
                </label>
              </div>
            )}

            {temBolsa === false && (
              <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-200 text-sm font-semibold">A bolsa térmica é obrigatória para entregar</p>
                  <p className="text-amber-200/80 text-xs mt-1 leading-relaxed">
                    Você pode concluir o cadastro agora, mas precisa de uma bolsa térmica para manter a
                    qualidade do pedido — comida chega quente, bebida chega gelada. Serve a de qualquer marca.
                  </p>
                  <a href={LINK_BOLSA} target="_blank" rel="noopener noreferrer"
                    className="text-amber-200 text-xs font-semibold underline underline-offset-2 mt-2 inline-block">
                    Onde comprar uma bolsa térmica →
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Drone (#14): série + registro ANAC */}
          {precisaDocsDrone && (
            <div className="border-t border-borda pt-4">
              <p className="text-white font-semibold text-sm mb-1">🚁 Documentação do drone</p>
              <p className="text-gray-500 text-xs mb-3 leading-relaxed">
                Exigido pela RBAC-E nº 94 da ANAC. O equipamento precisa estar cadastrado no SISANT.
                Entregas por drone são limitadas a {DRONE_RAIO_MAX_KM} km, {DRONE_PESO_MAX_KG} kg e ao
                período das {DRONE_HORA_INICIO}h às {DRONE_HORA_FIM}h.
              </p>
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Número de série do drone"
                  value={droneSerie}
                  onChange={e => setDroneSerie(e.target.value.slice(0, 60))}
                  className={`w-full ${inp}`}
                />
                <input
                  type="text"
                  placeholder="Registro ANAC / SISANT"
                  value={droneAnac}
                  onChange={e => setDroneAnac(e.target.value.slice(0, 40))}
                  className={`w-full ${inp}`}
                />
              </div>
            </div>
          )}

          {/* CNH (obrigatório p/ moto e carro) */}
          {precisaCNH && (
            <div className="border-t border-borda pt-4">
              <p className="text-white font-semibold text-sm mb-1">CNH (obrigatória para {veiculoTipo === 'moto' ? 'moto' : 'carro'})</p>
              <div className="flex flex-col gap-3 mt-2">
                <input type="text" inputMode="numeric" placeholder="Número da CNH" value={cnhNumero}
                  onChange={e => setCnhNumero(e.target.value.replace(/\D/g, '').slice(0, 11))} className={`w-full ${inp}`} />
                <div>
                  <label className={label}>Categoria</label>
                  <select value={cnhCategoria} onChange={e => setCnhCategoria(e.target.value)} className={`w-full ${inp}`}>
                    <option value="">Selecione</option>
                    {CATEGORIAS_CNH.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <FotoUpload
                  label="Foto da CNH *"
                  hint="CNH aberta, com foto e categoria visíveis."
                  preview={cnhPreview}
                  onPick={pegarImagem(setCnhFoto, setCnhPreview)}
                />
              </div>
            </div>
          )}

          <p className="text-gray-500 text-xs text-center mt-1">🔒 {AVISO_VERIFICACAO}</p>
          <button onClick={salvar} disabled={loading || !!erroCpfMsg || !!erroTelMsg}
            className="bg-azul hover:brightness-110 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? 'Enviando dados...' : 'Criar perfil e começar'}
          </button>
        </div>
      </div>
    </main>
  )
}
