// Caça builders do PostgREST que ninguém consome.
//
// O `no-floating-promises` do typescript-eslint não serve: ele acusa também as
// Promises DE VERDADE (`carregar()` disparada sem await), que executam
// normalmente. O defeito aqui é outro e é específico do supabase-js — o
// `PostgrestFilterBuilder` é PREGUIÇOSO: só monta a requisição quando alguém
// consome a thenable (`await`, `.then()`, `Promise.all`, desestruturação).
// Sem isso a query é montada e descartada, e NENHUM HTTP sai da máquina.
//
// Este script usa o type checker para achar exatamente esse caso: uma
// expressão em posição de statement cujo TIPO é um builder do PostgREST.
//
//   node scripts/achar-builder-nao-consumido.mjs
//
// Saída: uma linha por ocorrência, `arquivo:linha  trecho`. Silêncio = limpo.

import ts from 'typescript'
import path from 'node:path'

const raiz = process.cwd()
const configPath = ts.findConfigFile(raiz, ts.sys.fileExists, 'tsconfig.json')
if (!configPath) {
  console.error('tsconfig.json não encontrado')
  process.exit(1)
}

const config = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath))
const program = ts.createProgram(parsed.fileNames, parsed.options)
const checker = program.getTypeChecker()

/**
 * O tipo é uma thenable PREGUIÇOSA — tem `.then` mas NÃO é uma `Promise`?
 *
 * Essa é a distinção que importa, e não o nome do builder: uma `Promise` de
 * verdade (`carregar()` solta sem await) já está rodando, largá-la é no máximo
 * um erro não tratado. Uma thenable preguiçosa largada é código MORTO — nunca
 * executa. O checker resolve a cadeia do PostgREST ora como
 * `PostgrestFilterBuilder`, ora como `PromiseLike<T>`, então casar por nome de
 * símbolo deixava passar justamente o caso real (foi o que aconteceu na
 * primeira versão deste script, que dava "OK" com o defeito na frente).
 */
function ehThenablePreguicosa(tipo) {
  const tipos = tipo.isUnion?.() ? tipo.types : [tipo]
  return tipos.some(t => {
    const nome = t.getSymbol()?.getName() || t.aliasSymbol?.getName()
    if (nome === 'Promise') return false // Promise real: já está rodando
    return !!t.getProperty('then')
  })
}

const achados = []

for (const arquivo of program.getSourceFiles()) {
  if (arquivo.isDeclarationFile) continue
  if (!arquivo.fileName.includes('/app/') && !arquivo.fileName.includes('\\app\\')) continue

  const visitar = no => {
    // Só interessa expressão em posição de STATEMENT — aí ninguém consome o
    // resultado. `void x` conta: o `void` descarta sem nunca disparar nada.
    if (ts.isExpressionStatement(no)) {
      let expr = no.expression

      // `query = query.eq(...)` guarda o builder numa variável para consumir
      // depois (o padrão de filtro condicional). Não é defeito.
      if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        expr = null
      }

      while (expr && (ts.isVoidExpression(expr) || ts.isAwaitExpression(expr))) {
        if (ts.isAwaitExpression(expr)) { expr = null; break } // await consome
        expr = expr.expression
      }

      // Cadeia terminada em `.then`/`.catch`/`.finally` JÁ disparou — é o
      // fire-and-forget correto. (O `.then` do PostgREST devolve `PromiseLike`,
      // não `Promise`, então sem esta checagem ela cairia como falso positivo.)
      if (
        expr && ts.isCallExpression(expr)
        && ts.isPropertyAccessExpression(expr.expression)
        && ['then', 'catch', 'finally'].includes(expr.expression.name.text)
      ) {
        expr = null
      }
      if (expr) {
        try {
          if (ehThenablePreguicosa(checker.getTypeAtLocation(expr))) {
            const { line } = arquivo.getLineAndCharacterOfPosition(no.getStart())
            achados.push({
              arquivo: path.relative(raiz, arquivo.fileName).replace(/\\/g, '/'),
              linha: line + 1,
              trecho: no.getText().split('\n')[0].trim().slice(0, 90),
            })
          }
        } catch { /* tipo não resolvível: ignora */ }
      }
    }
    ts.forEachChild(no, visitar)
  }
  visitar(arquivo)
}

if (achados.length === 0) {
  console.log('OK — nenhum builder do PostgREST largado sem consumir.')
} else {
  console.log(`${achados.length} builder(s) nunca disparado(s):\n`)
  for (const a of achados) console.log(`${a.arquivo}:${a.linha}  ${a.trecho}`)
  process.exitCode = 1
}
