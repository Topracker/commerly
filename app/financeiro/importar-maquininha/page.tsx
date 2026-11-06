'use client'
import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, Upload } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { formatarData, formatarDataHora } from '../../lib/datas'
import { MAQUININHAS, ROTULO_MAQUININHA, type Maquininha, type VendaImportada } from '../../lib/maquininhaImport'
import { CONTA_PJ_PF, PASSOS_COMMERLY, TUTORIAIS } from '../../lib/maquininhaTutorial'

const reais = (v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Ignoradas = { canceladas: number; semId: number; invalidas: number; repetidasNoArquivo: number }
type Previa = {
  totalNoArquivo: number
  novas: number
  jaExistiam: number
  totalBruto: number
  totalLiquido: number
  semLiquido: number
  de: string
  ate: string
  possiveisDuplicadas: number
  ehPdf: boolean
  ignoradas: Ignoradas
  amostra: VendaImportada[]
}

function Numerados({ itens }: { itens: string[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {itens.map((t, i) => (
        <li key={t} className="flex gap-3 text-sm text-gray-300">
          <span className="shrink-0 w-6 h-6 rounded-full bg-gray-800 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  )
}

export default function ImportarMaquininha() {
  const { loja, loading, sair } = useAuth()
  const [maquininha, setMaquininha] = useState<Maquininha>('pagbank')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erro, setErro] = useState('')
  const [colunas, setColunas] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ gravadas: number; jaExistiam: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function limpar() {
    setPrevia(null)
    setErro('')
    setColunas([])
    setResultado(null)
  }

  function recomecar() {
    limpar()
    setArquivo(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function enviar(arq: File, confirmar: boolean) {
    setEnviando(true)
    setErro('')
    setColunas([])
    const form = new FormData()
    form.set('arquivo', arq)
    form.set('maquininha', maquininha)
    if (confirmar) form.set('confirmar', '1')
    try {
      const res = await fetch('/api/maquininha/importar', { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.ok === false) {
        setPrevia(null)
        setErro(d.erro || 'Não foi possível ler o arquivo. Tente de novo.')
        setColunas(Array.isArray(d.colunas) ? d.colunas : [])
      } else if (confirmar) {
        setPrevia(null)
        setResultado({ gravadas: d.gravadas, jaExistiam: d.jaExistiam })
      } else {
        setPrevia(d.previa)
      }
    } catch {
      setErro('Sem conexão. Confira sua internet e tente de novo.')
    }
    setEnviando(false)
  }

  function trocarMaquininha(m: Maquininha) {
    setMaquininha(m)
    recomecar()
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!loja) return null

  const tutorial = TUTORIAIS[maquininha]
  const ign = previa?.ignoradas

  return (
    <AppLayout loja={loja} sair={sair} titulo="Importar vendas da maquininha" maxWidth="max-w-2xl">
      <p className="text-gray-400 text-sm mb-4">
        Baixe o extrato no app da sua maquininha e suba aqui. As vendas entram no seu faturamento, separadas como Maquininha.
      </p>

      {/* Passo a passo */}
      <section className="bg-gray-900 rounded-2xl p-5 mb-4">
        <h2 className="text-white font-semibold mb-3">Qual é a sua maquininha?</h2>
        <div role="tablist" aria-label="Maquininha" className="flex flex-wrap gap-2 mb-5">
          {MAQUININHAS.map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={maquininha === m}
              onClick={() => trocarMaquininha(m)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${maquininha === m ? 'bg-acento text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              {ROTULO_MAQUININHA[m]}
            </button>
          ))}
        </div>

        <h3 className="text-white font-semibold text-sm mb-3">
          1. Baixe o extrato{maquininha === 'outra' ? '' : ` (${ROTULO_MAQUININHA[maquininha]})`}
        </h3>
        <Numerados itens={tutorial.passos} />
        <p className="text-gray-500 text-xs mt-3">{CONTA_PJ_PF}</p>
        {tutorial.dica && <p className="text-gray-400 text-xs mt-2 bg-gray-800 rounded-xl p-3">{tutorial.dica}</p>}

        <h3 className="text-white font-semibold text-sm mt-5 mb-3">2. Suba na Commerly</h3>
        <Numerados itens={PASSOS_COMMERLY} />
      </section>

      {/* Envio */}
      <section className="bg-gray-900 rounded-2xl p-5 mb-4">
        {resultado ? (
          <div className="text-center py-3">
            <CheckCircle2 className="mx-auto text-green-400 mb-2" size={32} />
            <p className="text-white font-semibold">
              {resultado.gravadas === 1 ? '1 venda importada' : `${resultado.gravadas} vendas importadas`}
            </p>
            {resultado.jaExistiam > 0 && (
              <p className="text-gray-400 text-sm mt-1">{resultado.jaExistiam} já estavam aqui e não entraram de novo.</p>
            )}
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <a href="/financeiro" className="bg-acento text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:opacity-90 transition">Ver no Financeiro</a>
              <button onClick={recomecar} className="bg-gray-800 text-gray-300 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-gray-700 transition">Importar outro arquivo</button>
            </div>
          </div>
        ) : (
          <>
            <label className="block border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-xl p-6 text-center cursor-pointer transition">
              <Upload className="mx-auto text-gray-400 mb-2" size={24} />
              <span className="text-white font-semibold text-sm block">{arquivo ? arquivo.name : 'Escolher arquivo'}</span>
              <span className="text-gray-500 text-xs">CSV, XLSX ou PDF, até 4 MB</span>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.pdf"
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null
                  setArquivo(f)
                  limpar()
                  if (f) enviar(f, false)
                }}
              />
            </label>

            {enviando && <p className="text-gray-400 text-sm mt-3 text-center">{previa ? 'Salvando as vendas...' : 'Lendo o arquivo...'}</p>}

            {erro && (
              <div className="bg-red-950 border border-red-800 rounded-xl p-3 mt-3">
                <p className="text-red-300 text-sm">{erro}</p>
                {colunas.length > 0 && <p className="text-red-400/80 text-xs mt-2">Colunas que encontramos: {colunas.join(', ')}</p>}
              </div>
            )}

            {previa && !enviando && (
              <div className="mt-4">
                <h3 className="text-white font-semibold text-sm mb-1">Prévia: nada foi salvo ainda</h3>
                <p className="text-gray-500 text-xs mb-3">De {formatarData(previa.de)} até {formatarData(previa.ate)}</p>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-400 text-xs">Vendas novas</p><p className="text-white font-bold text-lg">{previa.novas}</p></div>
                  <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-400 text-xs">Já existiam</p><p className="text-white font-bold text-lg">{previa.jaExistiam}</p></div>
                  <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-400 text-xs">Total bruto</p><p className="text-green-400 font-bold">{reais(previa.totalBruto)}</p></div>
                  <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-400 text-xs">Total líquido</p><p className="text-white font-bold">{reais(previa.totalLiquido)}</p></div>
                </div>
                <p className="text-gray-500 text-xs mb-3">Os totais somam só as vendas novas.</p>

                {previa.semLiquido > 0 && (
                  <p className="text-gray-400 text-xs mb-2">{previa.semLiquido} venda(s) sem valor líquido no arquivo: contamos o bruto no total líquido.</p>
                )}

                {previa.ehPdf && (
                  <div className="flex gap-2 bg-amber-950 border border-amber-800 rounded-xl p-3 mb-2">
                    <AlertTriangle size={16} className="text-amber-300 shrink-0 mt-0.5" />
                    <p className="text-amber-200 text-xs">PDF é mais difícil de ler. Compare os valores abaixo com o seu extrato antes de confirmar.</p>
                  </div>
                )}

                {previa.possiveisDuplicadas > 0 && (
                  <div className="flex gap-2 bg-amber-950 border border-amber-800 rounded-xl p-3 mb-2">
                    <AlertTriangle size={16} className="text-amber-300 shrink-0 mt-0.5" />
                    <p className="text-amber-200 text-xs">
                      {previa.possiveisDuplicadas} venda(s) têm o mesmo dia e valor de vendas que você já lançou no caixa. Se forem as mesmas, vão contar em dobro. Apague as do caixa em Histórico ou confira antes de confirmar.
                    </p>
                  </div>
                )}

                {ign && ign.canceladas + ign.semId + ign.invalidas + ign.repetidasNoArquivo > 0 && (
                  <ul className="text-gray-400 text-xs mb-3 flex flex-col gap-1">
                    {ign.canceladas > 0 && <li>{ign.canceladas} cancelada(s) ou estornada(s): não entram.</li>}
                    {ign.semId > 0 && <li>{ign.semId} sem código da venda: não entram, porque poderiam ficar em dobro.</li>}
                    {ign.invalidas > 0 && <li>{ign.invalidas} com data ou valor que não conseguimos ler: não entram.</li>}
                    {ign.repetidasNoArquivo > 0 && <li>{ign.repetidasNoArquivo} repetida(s) no arquivo: contamos uma vez só. Se for venda parcelada, confira se o valor está certo.</li>}
                  </ul>
                )}

                {previa.amostra.length > 0 && (
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-xs">
                      <thead><tr className="text-gray-500 text-left"><th className="py-1 pr-3 font-medium">Data</th><th className="py-1 pr-3 font-medium">Forma</th><th className="py-1 pr-3 font-medium text-right">Bruto</th><th className="py-1 font-medium text-right">Líquido</th></tr></thead>
                      <tbody>
                        {previa.amostra.map(v => (
                          <tr key={v.id} className="border-t border-gray-800 text-gray-300">
                            <td className="py-1.5 pr-3">{formatarDataHora(v.data)}</td>
                            <td className="py-1.5 pr-3">{v.forma}{v.bandeira ? ` · ${v.bandeira}` : ''}</td>
                            <td className="py-1.5 pr-3 text-right whitespace-nowrap">{reais(v.bruto)}</td>
                            <td className="py-1.5 text-right whitespace-nowrap">{v.liquido === null ? '—' : reais(v.liquido)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previa.novas > previa.amostra.length && <p className="text-gray-500 text-xs mt-1">Mostrando {previa.amostra.length} de {previa.novas}.</p>}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => arquivo && enviar(arquivo, true)}
                    disabled={previa.novas === 0}
                    className="flex-1 min-w-40 bg-acento text-white font-semibold text-sm py-3 rounded-xl hover:opacity-90 disabled:opacity-50 transition"
                  >
                    {previa.novas === 0 ? 'Nada novo para importar' : `Confirmar ${previa.novas} venda${previa.novas > 1 ? 's' : ''}`}
                  </button>
                  <button onClick={recomecar} className="bg-gray-800 text-gray-300 font-semibold text-sm px-4 py-3 rounded-xl hover:bg-gray-700 transition">Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <a href="/suporte" className="flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition py-2">
        <HelpCircle size={16} /> Precisa de ajuda? Fale com a gente
      </a>
    </AppLayout>
  )
}
