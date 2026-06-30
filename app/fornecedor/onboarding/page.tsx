'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'
import {
  validarCNPJ, formatarCNPJ, erroCNPJ, formatarTelefone, erroTelefone,
  checarDuplicidade, MSG_DUPLICADO, registrarCadastroIp, AVISO_VERIFICACAO,
} from '../../lib/validacoes'
import FornecedorIaOutro from '../../components/FornecedorIaOutro'

const CATEGORIAS = ['Alimentos e bebidas', 'Limpeza e higiene', 'Eletrônicos', 'Roupas e acessórios', 'Papelaria', 'Construção', 'Serviços', 'Tecnologia', 'Outro']

export default function FornecedorOnboarding() {
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [localizacao, setLocalizacao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [descricao, setDescricao] = useState('')
  // Fluxo de IA para categoria "Outro"
  const [categoriaCustom, setCategoriaCustom] = useState('')
  const [foco, setFoco] = useState('')
  const [erroCnpj, setErroCnpj] = useState('')
  const [erroTel, setErroTel] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/fornecedor/login')
    })
  }, [])

  function handleCnpj(valor: string) {
    setCnpj(formatarCNPJ(valor))
    setErroCnpj(erroCNPJ(valor))
  }

  function handleTelefone(valor: string) {
    setTelefone(formatarTelefone(valor))
    setErroTel(erroTelefone(valor))
  }

  async function salvar() {
    if (!nome.trim() || !categoria) { setErro('Nome e categoria são obrigatórios!'); return }
    if (!validarCNPJ(cnpj)) { setErro('Informe um CNPJ válido. O fornecedor é uma empresa.'); return }
    if (telefone && erroTelefone(telefone)) { setErro('Telefone inválido. Use um número válido com DDD.'); return }

    setLoading(true)
    setErro('')
    const { data: { user } } = await supabase.auth.getUser()

    const [{ data: lojaExiste }, { data: clienteExiste }] = await Promise.all([
      supabase.from('lojas').select('id').eq('user_id', user!.id).maybeSingle(),
      supabase.from('clientes').select('id').eq('user_id', user!.id).maybeSingle(),
    ])
    if (lojaExiste) { setErro('Este e-mail já está cadastrado como comerciante. Faça login para acessar sua conta.'); setLoading(false); return }
    if (clienteExiste) { setErro('Este e-mail já está cadastrado como cliente. Faça login para acessar sua conta.'); setLoading(false); return }

    // CNPJ e telefone não podem se repetir em outra conta do Commerly.
    const dup = await checarDuplicidade({ cnpj, ...(telefone ? { telefone } : {}) })
    if (dup.erro) { setErro(dup.erro); setLoading(false); return }
    if (dup.duplicado) { setErro(MSG_DUPLICADO[dup.duplicado]); setLoading(false); return }

    // Anti-spam: no máx. 1 conta por dia por IP.
    const lim = await registrarCadastroIp('fornecedor')
    if (!lim.ok) { setErro(lim.erro!); setLoading(false); return }

    const categoriaFinal = categoria === 'Outro' ? (categoriaCustom.trim() || 'Outro') : categoria
    const descricaoFinal = descricao.trim() || foco.trim()

    const { error } = await supabase.from('fornecedores').insert({
      user_id: user!.id,
      nome: nome.trim(),
      categoria: categoriaFinal,
      cnpj,
      localizacao,
      telefone,
      instagram,
      descricao: descricaoFinal,
    })
    if (error) {
      if (error.code === '23505') setErro('Este CNPJ já está cadastrado no Commerly!')
      else setErro('Erro ao salvar. Tente novamente.')
      setLoading(false)
      return
    }
    router.push('/fornecedor/dashboard')
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500'

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
        <p className="text-purple-400 text-sm font-semibold mb-1">Área do Fornecedor</p>
        <h1 className="text-2xl font-bold text-white mb-1">Cadastro da empresa</h1>
        <p className="text-gray-400 mb-6">Conte sobre o seu negócio</p>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        <div className="flex flex-col gap-4">
          <input
            placeholder="Nome da empresa *"
            value={nome}
            onChange={e => setNome(e.target.value)}
            className={inp}
          />
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className={inp}
          >
            <option value="">Categoria *</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* IA de onboarding — aparece quando o fornecedor escolhe "Outro" */}
          {categoria === 'Outro' && (
            <FornecedorIaOutro
              descricao={descricao} onDescricao={setDescricao}
              categoria={categoriaCustom} onCategoria={setCategoriaCustom}
              foco={foco} onFoco={setFoco}
            />
          )}

          {/* CNPJ */}
          <div>
            <input
              placeholder="CNPJ *"
              value={cnpj}
              onChange={e => handleCnpj(e.target.value)}
              inputMode="numeric"
              maxLength={18}
              className={`w-full ${inp} ${erroCnpj ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
            />
            {erroCnpj && <p className="text-red-400 text-sm mt-1">{erroCnpj}</p>}
          </div>

          {categoria !== 'Outro' && (
            <textarea
              placeholder="Descrição da empresa (opcional)"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={3}
              className={`${inp} resize-none`}
            />
          )}
          <input
            placeholder="Localização"
            value={localizacao}
            onChange={e => setLocalizacao(e.target.value)}
            className={inp}
          />

          {/* Telefone / WhatsApp */}
          <div>
            <input
              placeholder="Telefone / WhatsApp"
              value={telefone}
              onChange={e => handleTelefone(e.target.value)}
              inputMode="numeric"
              className={`w-full ${inp} ${erroTel ? 'ring-2 ring-red-500 focus:ring-red-500' : ''}`}
            />
            {erroTel && <p className="text-red-400 text-sm mt-1">{erroTel}</p>}
          </div>

          <input
            placeholder="Instagram (ex: @empresa)"
            value={instagram}
            onChange={e => setInstagram(e.target.value)}
            className={inp}
          />
          <p className="text-gray-500 text-xs text-center">🔒 {AVISO_VERIFICACAO}</p>
          <button
            onClick={salvar}
            disabled={loading || !!erroCnpj || !!erroTel}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 mt-2"
          >
            {loading ? 'Salvando...' : 'Criar perfil e começar'}
          </button>
        </div>
      </div>
    </main>
  )
}
