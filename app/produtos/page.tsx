'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export default function Produtos() {
  const [produtos, setProdutos] = useState<any[]>([])
  const [loja, setLoja] = useState<any>(null)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [custo, setCusto] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [qtdMin, setQtdMin] = useState('5')
  const [categoria, setCategoria] = useState('')
  const [imagem, setImagem] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: lojaData } = await supabase.from('lojas').select('*').eq('user_id', user.id).single()
    if (!lojaData) { router.push('/onboarding'); return }
    setLoja(lojaData)
    const { data } = await supabase.from('produtos').select('*').eq('loja_id', lojaData.id).order('created_at', { ascending: false })
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
    } else {
      setEditando(null)
      setNome(''); setPreco(''); setCusto(''); setQuantidade(''); setQtdMin('5'); setCategoria('')
      setImagem(null); setImagemPreview('')
    }
    setModal(true)
  }

  function handleImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImagem(file)
    setImagemPreview(URL.createObjectURL(file))
  }

  async function salvar() {
    if (!nome || !preco || !custo || !quantidade) return alert('Preencha todos os campos obrigatórios!')
    setLoading(true)

    let imagem_url = editando?.imagem_url || ''

    if (imagem) {
      const ext = imagem.name.split('.').pop()
      const fileName = `${loja.id}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('produtos').upload(fileName, imagem, { upsert: true })
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('produtos').getPublicUrl(fileName)
        imagem_url = urlData.publicUrl
      }
    }

    const dados = {
      loja_id: loja.id,
      nome,
      preco_venda: parseFloat(preco),
      custo: parseFloat(custo),
      quantidade: parseInt(quantidade),
      quantidade_minima: parseInt(qtdMin),
      categoria,
      imagem_url
    }

    if (editando) {
      await supabase.from('produtos').update(dados).eq('id', editando.id)
    } else {
      await supabase.from('produtos').insert(dados)
    }

    setModal(false)
    setLoading(false)
    setImagem(null)
    carregar()
  }

  async function remover(id: string) {
    if (!confirm('Remover produto?')) return
    await supabase.from('produtos').delete().eq('id', id)
    carregar()
  }

  const filtrados = produtos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm mb-1 hover:text-white">← Dashboard</button>
            <h1 className="text-3xl font-bold text-white">Produtos</h1>
          </div>
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
                  <button onClick={() => remover(p.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm transition">Remover</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

              <input placeholder="Nome do produto *" value={nome} onChange={e => setNome(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>
              <input placeholder="Categoria" value={categoria} onChange={e => setCategoria(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>
              <input placeholder="Preço de venda *" type="number" value={preco} onChange={e => setPreco(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>
              <input placeholder="Custo *" type="number" value={custo} onChange={e => setCusto(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>
              <input placeholder="Quantidade em estoque *" type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>
              <input placeholder="Quantidade mínima (alerta)" type="number" value={qtdMin} onChange={e => setQtdMin(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>

              <div className="flex gap-3 mt-2">
                <button onClick={() => setModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition">Cancelar</button>
                <button onClick={salvar} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition">
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}