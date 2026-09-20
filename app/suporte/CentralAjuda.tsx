'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Search, X, ChevronDown, ArrowRight, Link2, Check } from 'lucide-react'
import {
  CATEGORIAS_FAQ, PERGUNTAS_FAQ, PUBLICOS, buscarFaq,
  type Publico, type PerguntaComCategoria,
} from '../lib/faq'

// Autoatendimento do /suporte: busca + filtro por categoria/perfil sobre o FAQ
// de lib/faq.ts. O conteúdo já vem no HTML (server component pai renderiza
// este client com os dados no bundle), então o acordeão nativo <details>
// funciona antes do JS carregar; busca e filtros são progressivos.
//
// URL: `?q=termo` pré-preenche a busca e `#id-da-pergunta` abre a pergunta
// (link compartilhável, que o suporte pode mandar por e-mail/WhatsApp).
// Lidos de window (useSyncExternalStore) para a página continuar estática —
// useSearchParams obrigaria um Suspense e tiraria a página do prerender.

const TODAS = 'todas'

// A URL é um sistema externo: `?q=` e `#hash` entram como snapshot (vazio no
// servidor, real no cliente após a hidratação), sem setState dentro de effect.
function assinarUrl(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
function lerUrl() { return window.location.search + window.location.hash }
function urlServidor() { return '' }

function useEstadoInicialDaUrl(): { q: string; hash: string | null } {
  const urlAtual = useSyncExternalStore(assinarUrl, lerUrl, urlServidor)
  return useMemo(() => {
    const [busca = '', hashBruto = ''] = urlAtual.split('#')
    const q = new URLSearchParams(busca).get('q') || ''
    const hash = PERGUNTAS_FAQ.some(p => p.id === hashBruto) ? hashBruto : null
    return { q, hash }
  }, [urlAtual])
}

export default function CentralAjuda() {
  const inicial = useEstadoInicialDaUrl()
  // `null` = o usuário ainda não mexeu; vale o que veio da URL.
  const [termoEditado, setTermoEditado] = useState<string | null>(null)
  const [abertaEditada, setAbertaEditada] = useState<string | null | undefined>(undefined)
  const termo = termoEditado ?? inicial.q
  const aberta = abertaEditada === undefined ? inicial.hash : abertaEditada
  const setTermo = setTermoEditado
  const setAberta = setAbertaEditada
  const [categoria, setCategoria] = useState<string>(TODAS)
  const [publico, setPublico] = useState<Publico | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Deep link: com a pergunta já aberta, leva-a para a vista.
  useEffect(() => {
    if (!inicial.hash) return
    const t = setTimeout(() => document.getElementById(inicial.hash!)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50)
    return () => clearTimeout(t)
  }, [inicial.hash])

  const buscando = termo.trim().length >= 2

  const resultados = useMemo(() => {
    let itens: PerguntaComCategoria[] = PERGUNTAS_FAQ
    if (publico) itens = itens.filter(p => p.publico.includes(publico))
    if (categoria !== TODAS) itens = itens.filter(p => p.categoria === categoria)
    return buscando ? buscarFaq(termo, itens) : itens
  }, [termo, categoria, publico, buscando])

  // Quando há busca, a lista vem ranqueada e plana; sem busca, agrupada por
  // categoria para o visitante "passear" pelo conteúdo.
  const grupos = useMemo(() => {
    if (buscando) return [{ id: 'busca', nome: null as string | null, itens: resultados }]
    return CATEGORIAS_FAQ
      .map(c => ({ id: c.id, nome: c.nome as string | null, itens: resultados.filter(p => p.categoria === c.id) }))
      .filter(g => g.itens.length > 0)
  }, [buscando, resultados])

  function limpar() {
    setTermo('')
    inputRef.current?.focus()
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Perguntas frequentes">
      {/* Busca */}
      <div className="relative">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={termo}
          onChange={e => setTermo(e.target.value)}
          placeholder="Busque por uma dúvida: taxa de entrega, cancelar, senha…"
          aria-label="Buscar nas perguntas frequentes"
          autoComplete="off"
          className="w-full bg-gray-900 border border-gray-800 focus:border-blue-600 text-white text-sm rounded-2xl pl-10 pr-10 py-3.5 outline-none transition placeholder:text-gray-600"
        />
        {termo && (
          <button type="button" onClick={limpar} aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition p-1">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Perfil */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por perfil">
        {PUBLICOS.map(p => {
          const ativo = publico === p.valor
          return (
            <button key={p.valor} type="button" aria-pressed={ativo}
              onClick={() => setPublico(ativo ? null : p.valor)}
              className={`text-xs font-medium rounded-full px-3 py-1.5 border transition ${
                ativo
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
              }`}>
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Categorias */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap" role="tablist" aria-label="Categorias">
        <Chip ativo={categoria === TODAS} onClick={() => setCategoria(TODAS)}>Todas</Chip>
        {CATEGORIAS_FAQ.map(c => (
          <Chip key={c.id} ativo={categoria === c.id} onClick={() => setCategoria(c.id)}>{c.nome}</Chip>
        ))}
      </div>

      {/* Contagem / estado */}
      <p className="text-gray-600 text-xs" aria-live="polite">
        {buscando
          ? `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'} para “${termo.trim()}”`
          : `${resultados.length} ${resultados.length === 1 ? 'pergunta' : 'perguntas'}`}
      </p>

      {resultados.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center flex flex-col items-center gap-2">
          <p className="text-white font-semibold text-sm">Não achamos nada com esses termos.</p>
          <p className="text-gray-500 text-xs">
            Tente uma palavra mais simples (ex.: “entrega”, “senha”, “estorno”) ou fale com a gente.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {(publico || categoria !== TODAS) && (
              <button type="button" onClick={() => { setPublico(null); setCategoria(TODAS) }}
                className="text-xs text-gray-300 border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition">
                Limpar filtros
              </button>
            )}
            <a href="#contato"
              className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 transition inline-flex items-center gap-1">
              Falar com o suporte <ArrowRight size={13} />
            </a>
          </div>
        </div>
      ) : (
        grupos.map(g => (
          <div key={g.id} className="flex flex-col gap-2">
            {g.nome && (
              <h2 className="text-white font-semibold text-lg mt-2">{g.nome}</h2>
            )}
            {g.itens.map(p => (
              <Pergunta key={p.id} item={p} aberta={aberta === p.id} mostrarCategoria={buscando}
                onToggle={abriu => setAberta(abriu ? p.id : (aberta === p.id ? null : aberta))} />
            ))}
          </div>
        ))
      )}
    </section>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={ativo} onClick={onClick}
      className={`shrink-0 text-xs font-medium rounded-lg px-3 py-1.5 border transition ${
        ativo
          ? 'bg-gray-800 border-gray-600 text-white'
          : 'bg-transparent border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
      }`}>
      {children}
    </button>
  )
}

function Pergunta({ item, aberta, mostrarCategoria, onToggle }: {
  item: PerguntaComCategoria
  aberta: boolean
  mostrarCategoria: boolean
  onToggle: (abriu: boolean) => void
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiarLink() {
    try {
      const url = `${window.location.origin}/suporte#${item.id}`
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem clipboard (http, navegador antigo): o hash já está na URL ao abrir.
    }
  }

  return (
    // <details> nativo: acordeão sem JavaScript, conteúdo já no HTML (bom
    // para busca do navegador, SEO e leitores de tela). `open` é controlado
    // para o deep link (#id) conseguir abrir a pergunta certa.
    <details id={item.id} open={aberta}
      onToggle={e => onToggle((e.currentTarget as HTMLDetailsElement).open)}
      className="group bg-gray-900 border border-gray-800 rounded-xl scroll-mt-4">
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none p-3.5">
        <span className="min-w-0">
          {mostrarCategoria && (
            <span className="block text-[11px] text-gray-500 mb-0.5">{item.categoriaNome}</span>
          )}
          <span className="text-gray-200 text-sm font-medium">{item.pergunta}</span>
        </span>
        <ChevronDown size={16} className="text-gray-500 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3.5 pb-3.5 -mt-1 text-gray-400 text-sm leading-relaxed flex flex-col gap-2">
        {item.resposta.split('\n\n').map((par, i) => <p key={i}>{par}</p>)}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1">
          {item.link && (
            <Link href={item.link.href} className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-medium transition">
              {item.link.label} <ArrowRight size={13} />
            </Link>
          )}
          <button type="button" onClick={copiarLink}
            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-400 text-xs transition"
            aria-label="Copiar link desta pergunta">
            {copiado ? <Check size={13} className="text-green-400" /> : <Link2 size={13} />}
            {copiado ? 'Link copiado' : 'Copiar link'}
          </button>
        </div>
      </div>
    </details>
  )
}
