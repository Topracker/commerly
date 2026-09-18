'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, MessageCircle, Loader2 } from 'lucide-react'
import { NIVEIS_EMBAIXADOR, nivelDe } from '../../lib/crescimento'

// Certificados digitais da Commerly. Personalizados com o nome do usuário logado.
// Geração de PDF via impressão do navegador (window.print) — sem dependências.

type CertDef = {
  titulo: string
  selo: string
  cor: string
  subtitulo: string
  corpo: (nome: string, extra: string) => string
}

const CERTIFICADOS: Record<string, CertDef> = {
  fundador: {
    titulo: 'Fundador',
    selo: '🏅',
    cor: '#f5c34b',
    subtitulo: 'Membro fundador da Commerly',
    corpo: (nome) =>
      `Certificamos que ${nome} é um dos primeiros comerciantes a construir a maior comunidade de pequenos comércios do Brasil. Um verdadeiro fundador da Commerly.`,
  },
  pioneiro: {
    titulo: 'Pioneiro',
    selo: '🚀',
    cor: '#7dd3fc',
    subtitulo: 'Entregador pioneiro da rede oficial',
    corpo: (nome) =>
      `Certificamos que ${nome} está entre os primeiros entregadores da sua cidade, ajudando a movimentar o comércio local com a rede oficial da Commerly.`,
  },
  embaixador: {
    titulo: 'Embaixador',
    selo: '🎖️',
    cor: '#60a5fa',
    subtitulo: 'Embaixador oficial da Commerly',
    corpo: (nome, extra) =>
      `Certificamos que ${nome} é um Embaixador oficial da Commerly${extra ? ` (${extra})` : ''}, levando o Sistema Operacional do Pequeno Comércio para novas pessoas e cidades.`,
  },
  parceiro: {
    titulo: 'Parceiro Oficial',
    selo: '🤝',
    cor: '#34d399',
    subtitulo: 'Parceiro oficial da Commerly',
    corpo: (nome) =>
      `Certificamos que ${nome} é um Parceiro Oficial da Commerly, ajudando comerciantes a crescer com tecnologia e comunidade.`,
  },
  'comerciante-ouro': {
    titulo: 'Comerciante Ouro',
    selo: '🥇',
    cor: '#f5c34b',
    subtitulo: 'Nível Ouro alcançado',
    corpo: (nome) =>
      `Certificamos que ${nome} alcançou o nível Ouro na Commerly, com destaque na busca e reconhecimento pela sua dedicação ao comércio local.`,
  },
  'top-cidade': {
    titulo: 'Top Cidade',
    selo: '🏆',
    cor: '#a78bfa',
    subtitulo: 'Ajudou a cidade a ser escolhida',
    corpo: (nome, extra) =>
      `Certificamos que ${nome} foi decisivo para levar a Commerly${extra ? ` a ${extra}` : ' à sua cidade'}, somando pontos que fizeram a cidade ser escolhida.`,
  },
}

// ---------------------------------------------------------------------------
// Quem pode emitir cada certificado.
//
// O certificado é um artefato de marca, com o nome da pessoa e botão de
// compartilhar — ou seja, uma alegação pública. Antes, `tipo` era só um
// parâmetro de apresentação: qualquer conta logada abria `/certificado/fundador`
// e baixava um PDF dizendo "Certificamos que <nome> é um verdadeiro fundador da
// Commerly", sem ter a medalha.
//
// `EXIGE_MEDALHA` liga o certificado à medalha que o motor concede de fato
// (`gamificacaoServer.ts`). Só `fundador` e `embaixador` têm uma hoje.
//
// `SEM_CRITERIO` são os certificados cuja condição ainda não foi definida pelo
// produto. `pioneiro` entra aqui junto com os outros três porque a medalha
// `pioneiro` é uma das que nenhum código concede (ver `emBreve` em
// `crescimento.ts`) — mapeá-lo para `primeira-entrega` seria inventar critério.
const EXIGE_MEDALHA: Record<string, string> = {
  fundador: 'fundador',
  embaixador: 'embaixador',
}
const SEM_CRITERIO = new Set(['pioneiro', 'parceiro', 'comerciante-ouro', 'top-cidade'])

export default function Certificado({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = use(params)
  const cert = CERTIFICADOS[tipo]
  const [nome, setNome] = useState<string>('')
  const [extra, setExtra] = useState<string>('')
  const [perfilUrl, setPerfilUrl] = useState<string>('')
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)
  // Começa em `false` e só vira `true` com a medalha confirmada: se o sync
  // falhar, a resposta vier estranha ou a sessão tiver caído, o certificado
  // NÃO é emitido. Falhar fechado é o ponto central desta tela.
  const [temDireito, setTemDireito] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch('/api/gamificacao/sync')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!vivo) return
        if (p && !p.error) {
          setNome(p.nome || '')
          if (p.perfilPath) setPerfilUrl(`${window.location.origin}${p.perfilPath}`)
          if (tipo === 'embaixador' && p.comunidade) {
            const total = (p.comunidade.comerciantes || 0) + (p.comunidade.clientes || 0) + (p.comunidade.entregadores || 0)
            setExtra(`nível ${nivelDe(NIVEIS_EMBAIXADOR, total).atual.nome}`)
          }
          const exigida = EXIGE_MEDALHA[tipo]
          const medalhas: { slug: string }[] = Array.isArray(p.medalhas) ? p.medalhas : []
          setTemDireito(!!exigida && medalhas.some((m) => m?.slug === exigida))
        }
      })
      .catch(() => {})
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [tipo])

  if (!cert) {
    return (
      <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-white font-semibold mb-2">Certificado não encontrado</p>
          <Link href="/" className="text-acento text-sm">Voltar ao início</Link>
        </div>
      </main>
    )
  }

  // Aviso: mesmo layout das três saídas que não emitem o certificado.
  const aviso = (titulo: string, texto: string) => (
    <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <div className="text-5xl mb-4 opacity-40 grayscale">{cert.selo}</div>
        <p className="text-white font-semibold mb-2">{titulo}</p>
        <p className="text-gray-400 text-sm mb-6">{texto}</p>
        <Link href="/medalhas" className="text-acento text-sm">Ver as medalhas</Link>
      </div>
    </main>
  )

  if (SEM_CRITERIO.has(tipo)) {
    return aviso(
      `Certificado ${cert.titulo} ainda não disponível`,
      'Este certificado ainda não tem condição definida. Assim que existir um critério, ele passa a ser emitido para quem cumprir.',
    )
  }

  // Enquanto o sync não responde, nada de certificado na tela — senão ele
  // pisca por um instante para quem não tem direito.
  if (carregando) {
    return (
      <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center px-6 text-center">
        <p className="text-gray-500 text-sm flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Verificando sua conquista…</p>
      </main>
    )
  }

  if (!temDireito) {
    return aviso(
      `Você ainda não tem o certificado ${cert.titulo}`,
      'Ele é emitido para quem já conquistou a medalha correspondente. Veja no catálogo o que falta para chegar lá.',
    )
  }

  const nomeExibido = nome || 'Seu nome'
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  // O jsPDF só é carregado quando alguém clica — são ~350 KB que não fazem
  // falta a quem só veio olhar o certificado na tela.
  async function baixar() {
    if (!cert || gerando) return
    setGerando(true)
    try {
      const { baixarCertificadoPdf } = await import('../../lib/certificadoPdf')
      await baixarCertificadoPdf({
        tipo, titulo: cert.titulo, subtitulo: cert.subtitulo, cor: cert.cor,
        corpo: cert.corpo(nomeExibido, extra), nome: nomeExibido,
        urlPerfil: perfilUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
      })
    } catch (e) {
      console.error('[certificado] falha ao gerar PDF:', e)
      // Último recurso: o caminho antigo, que ao menos sempre existiu.
      window.print()
    } finally {
      setGerando(false)
    }
  }
  const shareMsg = `Recebi o certificado ${cert.selo} ${cert.titulo} da Commerly! #Commerly`

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .cert-area { margin: 0 !important; padding: 0 !important; }
          .cert-card { box-shadow: none !important; border-color: ${cert.cor} !important; }
        }
      `}</style>

      <header className="no-print border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Commerly</Link>
        </div>
      </header>

      <div className="cert-area max-w-3xl mx-auto px-6 py-10">
        {/* Certificado */}
        <div
          className="cert-card relative rounded-3xl bg-gradient-to-br from-[#111418] to-[#0b0d10] p-10 sm:p-14 text-center overflow-hidden"
          style={{ border: `2px solid ${cert.cor}`, boxShadow: `0 0 60px ${cert.cor}22` }}
        >
          <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-20" style={{ background: cert.cor }} />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-6" style={{ color: cert.cor }}>Commerly · Certificado</p>
          <div className="text-6xl mb-4" style={{ filter: `drop-shadow(0 0 20px ${cert.cor}66)` }}>{cert.selo}</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">{cert.titulo}</h1>
          <p className="text-gray-400 text-sm mt-1">{cert.subtitulo}</p>

          <div className="my-8">
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Concedido a</p>
            <p className="font-display text-2xl sm:text-3xl font-bold" style={{ color: cert.cor }}>
              {nomeExibido}
            </p>
          </div>

          <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-xl mx-auto">
            {cert.corpo(nomeExibido, extra)}
          </p>

          <div className="mt-10 pt-6 border-t border-borda flex items-center justify-between text-left">
            <div>
              <p className="text-white text-sm font-semibold">Commerly</p>
              <p className="text-gray-500 text-xs">O Sistema Operacional do Pequeno Comércio</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">Emitido em</p>
              <p className="text-white text-sm font-medium">{hoje}</p>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="no-print flex flex-wrap items-center justify-center gap-2 mt-6">
          <button
            onClick={baixar}
            disabled={gerando}
            className="flex items-center gap-1.5 bg-acento hover:bg-acento-forte disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition"
          >
            {gerando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {gerando ? 'Gerando…' : 'Baixar PDF'}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareMsg + ' ' + shareUrl)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-[#25D366] text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
            <MessageCircle size={15} /> WhatsApp
          </a>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-[#0a66c2] text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
            LinkedIn
          </a>
        </div>
        <p className="no-print text-center text-gray-500 text-xs mt-3">
          O PDF sai pronto, com o QR do seu perfil — sem passar pelo diálogo de impressão.
        </p>
      </div>
    </main>
  )
}
