'use client'
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { gerarCardConquista, baixarDataUrl } from '../lib/cardImagem'

// Botão que gera e baixa um card PNG bonito da conquista, personalizado com o
// nome do usuário logado (fallback "Você" para visitantes).
export function BaixarConquista({ emoji, titulo, subtitulo, cor = '#f5c34b', arquivo }: {
  emoji: string; titulo: string; subtitulo: string; cor?: string; arquivo: string
}) {
  const [nome, setNome] = useState('Você')
  useEffect(() => {
    fetch('/api/gamificacao/sync').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.nome) setNome(d.nome) }).catch(() => {})
  }, [])
  function baixar() {
    const png = gerarCardConquista({ emoji, titulo, subtitulo, nome, cor })
    baixarDataUrl(png, `${arquivo}.png`)
  }
  return (
    <button onClick={baixar} className="bg-acento hover:bg-acento-forte text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5">
      <Download size={15} /> Baixar imagem PNG
    </button>
  )
}

export default BaixarConquista
