'use client'

// Campo de senha com requisitos visíveis, checkmarks em tempo real e barra de
// força. Usado no cadastro dos 4 papéis e na redefinição de senha.
//
// Por que existe: o Supabase recusa senhas fracas/vazadas com um 422
// (weak_password) só DEPOIS do envio — e no cadastro esse erro chegava tarde
// demais, com o OTP já consumido. Mostrando as regras antes de digitar e
// travando o botão, o usuário não chega a enviar algo que seria recusado.
//
// Limite honesto: as regras locais não conseguem prever a lista de vazamentos
// (HaveIBeenPwned) que o Supabase consulta. Uma senha como "Password1!" cumpre
// todas as regras e ainda assim pode ser recusada — por isso o aviso fixo.

export type RegraSenha = { id: string; label: string; ok: (senha: string) => boolean }

export const REGRAS_SENHA: RegraSenha[] = [
  { id: 'min', label: 'Mínimo 6 caracteres', ok: s => s.length >= 6 },
  { id: 'maiuscula', label: 'Uma letra maiúscula', ok: s => /[A-Z]/.test(s) },
  { id: 'minuscula', label: 'Uma letra minúscula', ok: s => /[a-z]/.test(s) },
  { id: 'numero', label: 'Um número', ok: s => /[0-9]/.test(s) },
  { id: 'simbolo', label: 'Um símbolo (!@#$%...)', ok: s => /[^A-Za-z0-9]/.test(s) },
]

// Fonte única da verdade: as telas usam isto para habilitar/desabilitar o botão.
export function senhaValida(senha: string): boolean {
  return REGRAS_SENHA.every(r => r.ok(senha))
}

type Forca = { nivel: 0 | 1 | 2 | 3; rotulo: string; corBarra: string; corTexto: string; largura: string }

// Além das regras, comprimento conta: 6 caracteres cumprindo tudo ainda é uma
// senha curta, então só vira "forte" com tamanho de sobra.
export function forcaSenha(senha: string): Forca {
  if (!senha) return { nivel: 0, rotulo: '', corBarra: '', corTexto: '', largura: '0%' }

  let pontos = REGRAS_SENHA.filter(r => r.ok(senha)).length
  if (senha.length >= 10) pontos++
  if (senha.length >= 14) pontos++

  if (pontos <= 3) return { nivel: 1, rotulo: 'Fraca', corBarra: 'bg-red-500', corTexto: 'text-red-400', largura: '33%' }
  if (pontos <= 5) return { nivel: 2, rotulo: 'Média', corBarra: 'bg-amber-500', corTexto: 'text-amber-400', largura: '66%' }
  return { nivel: 3, rotulo: 'Forte', corBarra: 'bg-green-500', corTexto: 'text-green-400', largura: '100%' }
}

export default function CampoSenha({
  value,
  onChange,
  onEnter,
  className,
  placeholder = 'Senha',
  autoComplete = 'new-password',
  id,
}: {
  value: string
  onChange: (valor: string) => void
  onEnter?: () => void
  className?: string
  placeholder?: string
  autoComplete?: string
  id?: string
}) {
  const forca = forcaSenha(value)

  return (
    <div className="flex flex-col gap-2">
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
        className={className}
        aria-describedby={id ? `${id}-requisitos` : undefined}
      />

      {/* Barra de força: só aparece depois que o usuário começa a digitar. */}
      {value && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${forca.corBarra}`}
              style={{ width: forca.largura }} />
          </div>
          <span className={`text-xs font-semibold ${forca.corTexto}`}>{forca.rotulo}</span>
        </div>
      )}

      {/* Requisitos: visíveis ANTES de digitar, acendendo conforme o usuário
          escreve — é o ponto principal, ninguém deve descobrir a regra errando. */}
      <ul id={id ? `${id}-requisitos` : undefined} className="flex flex-col gap-1">
        {REGRAS_SENHA.map(regra => {
          const atendida = regra.ok(value)
          return (
            <li key={regra.id}
              className={`text-xs flex items-center gap-2 transition-colors ${atendida ? 'text-green-400' : 'text-gray-500'}`}>
              <span aria-hidden="true" className="w-3.5 text-center">{atendida ? '✓' : '○'}</span>
              <span>{regra.label}</span>
              <span className="sr-only">{atendida ? '(atendido)' : '(pendente)'}</span>
            </li>
          )
        })}
      </ul>

      <p className="text-gray-500 text-[11px] leading-snug">
        Senhas que já apareceram em vazamentos conhecidos são recusadas.
      </p>
    </div>
  )
}
