'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import { RealceFoto } from '../components/RealceFoto'

export default function Produtos() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [produtos, setProdutos] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [confirmarId, setConfirmarId] = useState<string | null>(null)
  // Upload da foto falhou: pergunta se salva sem imagem em vez de fingir sucesso.
  const [falhaUpload, setFalhaUpload] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [custo, setCusto] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [qtdMin, setQtdMin] = useState('5')
  const [categoria, setCategoria] = useState('')
  const [imagem, setImagem] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState('')
  const [podeRealcar, setPodeRealcar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  // Descrição alimenta a IA Nutricionista (#9) e o Commerly Vision (#1);
  // peso é a restrição de carga da entrega por drone (#14).
  const [descricao, setDescricao] = useState('')
  const [pesoKg, setPesoKg] = useState('')

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    const { data, error } = await supabase.from('produtos').select('*').eq('loja_id', loja.id).order('created_at', { ascending: false })
    if (error) { mostrarToast('Erro ao carregar produtos', 'erro'); return }
    setProdutos(data || [])
  }

  function abrirModal(produto?: any) {
    if (produto) {
      setEditando(produto)
      setNome(produto.nome)
      setPreco(produto.preco_venda)
      setCusto(produto.custo)
      setQuantidade(produto.quantidade)
      setQtdMin(produto.quantidade_minima)
      setCategoria(produto.categoria || '')
      setImagemPreview(produto.imagem_url || '')
      setDescricao(produto.descricao || '')
      setPesoKg(produto.peso_kg != null ? String(produto.peso_kg) : '')
      setPodeRealcar(false)
    } else {
      setEditando(null)
      setNome(''); setPreco(''); setCusto(''); setQuantidade(''); setQtdMin('5'); setCategoria('')
      setImagem(null); setImagemPreview('')
      setDescricao(''); setPesoKg(''); setPodeRealcar(false)
    }
    setModal(true)
  }

  function handleImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // SVG executa script no <img>; bloqueia formatos não-raster
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!tiposPermitidos.includes(file.type)) {
      mostrarToast('Use uma imagem JPG, PNG, WEBP ou GIF.', 'erro')
      e.target.value = ''
      return
    }
    const MAX_BYTES = 5 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      mostrarToast('A imagem deve ter no máximo 5 MB.', 'erro')
      e.target.value = ''
      return
    }
    // GIF não passa pelo realce (o canvas achataria a animação); os demais sim.
    setImagem(file)
    setImagemPreview(URL.createObjectURL(file))
    setPodeRealcar(file.type !== 'image/gif')
  }

  /** #4 O comerciante escolheu entre a foto original e a realçada. */
  function escolherFoto(file: File) {
    setImagem(file)
    setImagemPreview(URL.createObjectURL(file))
  }

  async function salvar() {
    if (!nome || !preco || !custo || !quantidade) {
      mostrarToast('Preencha todos os campos obrigatórios!', 'erro'); return
    }
    // Nome precisa ter ao menos 2 caracteres e conter letra/número
    // (não pode ser só pontos, espaços ou símbolos).
    const nomeLimpo = nome.trim()
    if (nomeLimpo.length < 2 || !/[\p{L}\p{N}]/u.test(nomeLimpo)) {
      mostrarToast('Informe um nome de produto válido (mínimo 2 caracteres).', 'erro'); return
    }
    setSalvando(true)

    let imagem_url = editando?.imagem_url || ''
    if (imagem) {
      // Extensão derivada do MIME type, não do nome do arquivo do usuário.
      const extByMime: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
      }
      const ext = extByMime[imagem.type]
      if (!ext) { mostrarToast('Formato de imagem inválido.', 'erro'); setSalvando(false); return }
      // PASTA (`loja.id/arquivo`), não prefixo com hífen: a policy do bucket
      // casa por `storage.foldername(name)[1]`, e um nome plano não tem pasta
      // nenhuma — o upload voltaria 400. Mesmo formato do bucket `feed`.
      const fileName = `${loja.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('produtos')
        .upload(fileName, imagem, { upsert: true, contentType: imagem.type })
      if (uploadError) {
        // Antes este erro era engolido e o produto era salvo SEM imagem: o
        // comerciante via "Produto cadastrado!" e a foto sumia sem explicação.
        // Foi assim que o bucket ficou anos sem policy sem ninguém notar.
        // Agora ele decide: tentar de novo ou salvar sem imagem mesmo.
        console.error('[produtos] upload falhou:', uploadError.message)
        setSalvando(false)
        setFalhaUpload(true)
        return
      }
      const { data: urlData } = supabase.storage.from('produtos').getPublicUrl(fileName)
      imagem_url = urlData.publicUrl
    }

    await persistir(imagem_url)
  }

  // Grava o produto. Separado do `salvar` para que a confirmação "salvar sem
  // imagem" possa retomar daqui sem repetir o upload.
  async function persistir(imagem_url: string) {
    if (!loja) return
    setSalvando(true)

    const dados = {
      loja_id: loja.id,
      nome,
      preco_venda: parseFloat(preco),
      custo: parseFloat(custo),
      quantidade: parseInt(quantidade),
      quantidade_minima: parseInt(qtdMin),
      categoria,
      imagem_url,
      descricao: descricao.trim() || null,
      peso_kg: pesoKg.trim() ? Number(pesoKg.replace(',', '.')) : null,
      // Mudou o texto -> a classificação nutricional anterior não vale mais.
      ...(editando && descricao.trim() !== (editando.descricao || '')
        ? { tags_nutri: [], nutri_analisado_em: null }
        : {}),
    }

    const { error } = editando
      ? await supabase.from('produtos').update(dados).eq('id', editando.id).eq('loja_id', loja.id)
      : await supabase.from('produtos').insert(dados)

    if (error) { mostrarToast('Erro ao salvar produto', 'erro'); setSalvando(false); return }

    mostrarToast(editando ? 'Produto atualizado!' : 'Produto cadastrado!', 'sucesso')
    setModal(false)
    setSalvando(false)
    setImagem(null)
    carregar()
  }

  async function remover() {
    if (!confirmarId) return
    const { error } = await supabase.from('produtos').delete().eq('id', confirmarId).eq('loja_id', loja.id)
    if (error) { mostrarToast('Erro ao remover produto', 'erro') }
    else { mostrarToast('Produto removido', 'sucesso') }
    setConfirmarId(null)
    carregar()
  }

  const filtrados = produtos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Produtos">
      <Toast toast={toast} />
      <ConfirmModal
        aberto={!!confirmarId}
        titulo="Remover produto"
        mensagem="Tem certeza que deseja remover este produto?"
        textoBotao="Remover"
        onConfirm={remover}
        onCancel={() => setConfirmarId(null)}
      />
      <ConfirmModal
        // Abre POR CIMA do modal do formulário (que é z-50): sem subir a
        // camada o aviso aparece mas os botões não recebem clique.
        z="z-[60]"
        aberto={falhaUpload}
        titulo="Não conseguimos enviar a foto"
        mensagem="A imagem do produto não subiu. Você pode salvar o produto sem foto agora e adicioná-la depois, ou cancelar e tentar de novo."
        textoBotao="Salvar sem foto"
        onConfirm={() => {
          setFalhaUpload(false)
          setImagem(null)
          setImagemPreview('')
          void persistir(editando?.imagem_url || '')
        }}
        onCancel={() => setFalhaUpload(false)}
      />

      <div className="flex items-center justify-between mb-4">
        <span />
        <button onClick={() => abrirModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition">
          + Adicionar
        </button>
      </div>

      <input
        placeholder="Buscar produto..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="w-full bg-gray-900 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 mb-6"
      />

      {filtrados.length === 0 ? (
        <div className="text-center text-gray-500 py-20">Nenhum produto ainda. Adicione o primeiro!</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtrados.map(p => (
            <div key={p.id} className="bg-gray-900 rounded-2xl p-4 flex items-center gap-4">
              {p.imagem_url ? (
                <img src={p.imagem_url} alt={p.nome} className="w-16 h-16 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center shrink-0">
                  <span className="text-gray-500 text-2xl">📦</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold">{p.nome}</p>
                  {p.quantidade <= p.quantidade_minima && (
                    <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">Estoque baixo</span>
                  )}
                </div>
                {p.categoria && <p className="text-gray-500 text-sm">{p.categoria}</p>}
                <div className="flex gap-4 mt-1 flex-wrap">
                  <p className="text-green-400 text-sm">Venda: R$ {p.preco_venda.toFixed(2)}</p>
                  <p className="text-gray-400 text-sm">Custo: R$ {p.custo.toFixed(2)}</p>
                  <p className="text-blue-400 text-sm">Estoque: {p.quantidade}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => abrirModal(p)} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm transition">Editar</button>
                <button onClick={() => setConfirmarId(p.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm transition">Remover</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-3xl p-6 w-full max-w-md max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-6">{editando ? 'Editar produto' : 'Novo produto'}</h2>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-3">
                {imagemPreview ? (
                  <img src={imagemPreview} alt="Preview" className="w-24 h-24 rounded-xl object-cover" />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-500 text-3xl">📦</span>
                  </div>
                )}
                <label className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm cursor-pointer transition">
                  {imagemPreview ? 'Trocar imagem' : 'Adicionar imagem'}
                  <input type="file" accept="image/*" onChange={handleImagem} className="hidden" />
                </label>
              </div>

              {/* #4 Realce da foto (recorte + luz + cor; não gera pixels novos) */}
              {imagem && podeRealcar && (
                <RealceFoto key={imagem.name + imagem.size} arquivo={imagem} onEscolher={escolherFoto} />
              )}

              <input placeholder="Nome do produto *" value={nome} onChange={e => setNome(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea
                placeholder="Descrição (ingredientes) — usada pelos filtros de dieta e pela busca por foto"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={2}
                maxLength={300}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
              />
              <input placeholder="Categoria" value={categoria} onChange={e => setCategoria(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Preço de venda *" type="number" value={preco} onChange={e => setPreco(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Custo *" type="number" value={custo} onChange={e => setCusto(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Quantidade em estoque *" type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Quantidade mínima (alerta)" type="number" value={qtdMin} onChange={e => setQtdMin(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <div>
                <input
                  placeholder="Peso (kg) — necessário para entrega por drone"
                  inputMode="decimal"
                  value={pesoKg}
                  onChange={e => setPesoKg(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-gray-500 text-xs mt-1">Sem peso, o produto conta como 0 kg no limite de 2 kg do drone.</p>
              </div>
              <div className="flex gap-3 mt-2">
                <button onClick={() => setModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition">Cancelar</button>
                <button onClick={salvar} disabled={salvando} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition">
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
