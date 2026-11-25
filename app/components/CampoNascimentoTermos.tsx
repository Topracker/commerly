'use client'
import { precisaResponsavel, type PapelCadastro } from '../lib/idade'

// Data de nascimento + caixinhas de aceite dos Termos (e da autorização do
// responsável quando o cliente tem de 12 a 17 anos). Usado no onboarding dos
// 4 papéis — ver app/lib/idade.ts para a regra.
export default function CampoNascimentoTermos({
  papel, nascimento, setNascimento, aceitou, setAceitou,
  responsavel, setResponsavel, className, semNascimento = false,
}: {
  papel: PapelCadastro
  nascimento: string
  setNascimento: (v: string) => void
  aceitou: boolean
  setAceitou: (v: boolean) => void
  responsavel: boolean
  setResponsavel: (v: boolean) => void
  className?: string
  /** Entregador já pergunta a data de nascimento em outro campo. */
  semNascimento?: boolean
}) {
  const hoje = new Date().toISOString().slice(0, 10)
  const menor = precisaResponsavel(papel, nascimento)
  const link = 'text-blue-400 hover:text-blue-300 underline'
  return (
    <div className="flex flex-col gap-3">
      {!semNascimento && (
        <label className="flex flex-col gap-1">
          <span className="text-gray-400 text-xs">Data de nascimento *</span>
          <input
            type="date"
            value={nascimento}
            max={hoje}
            onChange={e => setNascimento(e.target.value)}
            autoComplete="bday"
            className={className}
          />
        </label>
      )}
      {menor && (
        <label className="flex items-start gap-2 text-gray-300 text-sm cursor-pointer">
          <input type="checkbox" checked={responsavel} onChange={e => setResponsavel(e.target.checked)} className="mt-1" />
          <span>Tenho a autorização do meu pai, mãe ou responsável legal para criar esta conta.</span>
        </label>
      )}
      <label className="flex items-start gap-2 text-gray-300 text-sm cursor-pointer">
        <input type="checkbox" checked={aceitou} onChange={e => setAceitou(e.target.checked)} className="mt-1" />
        <span>
          Li e aceito os{' '}
          <a href="/termos" target="_blank" rel="noopener noreferrer" className={link}>Termos de Uso</a>{' '}
          e a{' '}
          <a href="/privacidade" target="_blank" rel="noopener noreferrer" className={link}>Política de Privacidade</a>.
        </span>
      </label>
    </div>
  )
}
