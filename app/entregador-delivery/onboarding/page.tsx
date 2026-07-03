'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'
import {
  soDigitos, validarCPF, formatarCPF, formatarTelefone,
  erroCPF, erroTelefone, checarDuplicidade, MSG_DUPLICADO,
  registrarCadastroIp, AVISO_VERIFICACAO,
} from '../../lib/validacoes'
import { uploadFotoEntregador } from '../../lib/entregadores'
import { Camera } from 'lucide-react'

export default function EntregadorOnboarding() {
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [erroCpfMsg, setErroCpfMsg] = useState('')
  const [erroTelMsg, setErroTelMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/entregador-delivery/login')
    })
  }, [])

  function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { setErro('Selecione uma imagem.'); return }
    setFoto(f)
    setFotoPreview(URL.createObjectURL(f))
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Informe seu nome!'); return }
    if (!validarCPF(cpf)) { setErro('Informe um CPF válido.'); return }
    if (!telefone || erroTelefone(telefone)) { setErro('Informe um telefone válido com DDD.'); return }
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

    // Foto (opcional): sobe antes do insert pra já gravar a URL.
    let foto_url: string | null = null
    if (foto) {
      const res = await uploadFotoEntregador(supabase, user.id, foto)
      if ('error' in res) { setErro(res.error); setLoading(false); return }
      foto_url = res.url
    }

    const { error } = await supabase.from('entregadores').insert({
      user_id: user.id, nome: nome.trim(), cpf, telefone, foto_url,
    })
    if (error) {
      if (error.code === '23505') setErro('Já existe um entregador para esta conta.')
      else setErro('Erro ao salvar. Tente novamente.')
      setLoading(false); return
    }
    router.push('/entregador-delivery/dashboard')
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#C1441E]'

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm">
        <p className="text-[#E0632C] text-sm font-semibold mb-1">🛵 Área do Entregador</p>
        <h1 className="text-2xl font-bold text-white mb-1">Complete seu perfil</h1>
        <p className="text-gray-400 mb-6">Esses dados aparecem para a loja e o cliente na hora da entrega.</p>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        <div className="flex flex-col gap-4">
          {/* Foto */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-24 h-24 rounded-full bg-gray-800 border-2 border-dashed border-gray-700 hover:border-[#C1441E] overflow-hidden flex items-center justify-center transition"
            >
              {fotoPreview
                ? <img src={fotoPreview} alt="" className="w-full h-full object-cover" />
                : <Camera size={26} className="text-gray-500" />}
            </button>
            <p className="text-gray-500 text-xs">Foto (opcional)</p>
            <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={escolherFoto} className="hidden" />
          </div>

          <input type="text" autoComplete="name" placeholder="Seu nome *" value={nome} onChange={e => setNome(e.target.value)} className={inp} />
          <div>
            <input type="text" inputMode="numeric" placeholder="CPF *" value={cpf}
              onChange={e => { setCpf(formatarCPF(e.target.value)); setErroCpfMsg(erroCPF(e.target.value)) }}
              className={`w-full ${inp} ${erroCpfMsg ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`} />
            {erroCpfMsg && <p className="text-red-400 text-sm mt-1">{erroCpfMsg}</p>}
          </div>
          <div>
            <input type="tel" inputMode="numeric" placeholder="WhatsApp *" value={telefone}
              onChange={e => { setTelefone(formatarTelefone(e.target.value)); setErroTelMsg(erroTelefone(e.target.value)) }}
              className={`w-full ${inp} ${erroTelMsg ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`} />
            {erroTelMsg && <p className="text-red-400 text-sm mt-1">{erroTelMsg}</p>}
          </div>

          <p className="text-gray-500 text-xs text-center">🔒 {AVISO_VERIFICACAO}</p>
          <button onClick={salvar} disabled={loading || !!erroCpfMsg || !!erroTelMsg}
            className="bg-[#C1441E] hover:bg-[#a83a19] text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? 'Salvando...' : 'Criar perfil e começar'}
          </button>
        </div>
      </div>
    </main>
  )
}
