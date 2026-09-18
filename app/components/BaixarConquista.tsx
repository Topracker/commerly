'use client'
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { gerarCardConquista, baixarDataUrl } from '../lib/cardImagem'

// Botão que gera e baixa um card PNG da conquista, personalizado com o nome do
// usuário logado.
//
// O card só aparece para quem TEM a medalha. Antes ele era incondicional numa
// página pública: qualquer visitante abria `/medalhas/top-vendedor` e baixava um
// card "Conquistei a medalha 👑 Top Vendedor" com o próprio nome — inclusive de
// medalhas que nenhum código concede. Como a página é de marketing e segue
// aberta para leitura, a checagem é aqui, no artefato, não na rota.
//
// Falha fechada de propósito: sem sessão, com `sync` fora do ar ou com resposta
// inesperada, o botão não aparece. Perder o botão é um aborrecimento; emitir
// prova falsa de conquista é o bug que estamos fechando.
export function BaixarConquista({ slug, emoji, titulo, subtitulo, cor = '#f5c34b', arquivo }: {
  slug: string; emoji: string; titulo: string; subtitulo: string; cor?: string; arquivo: string
}) {
  const [nome, setNome] = useState('')
  const [tem, setTem] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch('/api/gamificacao/sync')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!vivo || !d || d.error) return
        const medalhas: { slug: string }[] = Array.isArray(d.medalhas) ? d.medalhas : []
        setTem(medalhas.some(m => m?.slug === slug))
        if (d.nome) setNome(d.nome)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [slug])

  if (!tem) return null

  function baixar() {
    const png = gerarCardConquista({ emoji, titulo, subtitulo, nome: nome || 'Você', cor })
    baixarDataUrl(png, `${arquivo}.png`)
  }

  return (
    <button onClick={baixar} className="bg-acento hover:bg-acento-forte text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5">
      <Download size={15} /> Baixar imagem PNG
    </button>
  )
}

export default BaixarConquista
