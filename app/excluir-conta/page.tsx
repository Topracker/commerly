import type { Metadata } from 'next'
import Link from 'next/link'
import { PaginaLegal, Secao, Lista } from '../components/PaginaLegal'
import { CONTATO, PRODUTO } from '../lib/legal'
import { FormularioExclusao } from './FormularioExclusao'

// ============================================================================
// /excluir-conta — a URL PÚBLICA que a Google Play exige para pedir a exclusão
// da conta fora do app ("web link resource"). Precisa: carregar sem login,
// citar o nome do app como está na loja, ter o pedido em destaque e dizer o
// que é apagado e o que fica. Esta URL vai no formulário Data safety.
// ============================================================================

export const metadata: Metadata = {
  title: `Excluir conta — ${PRODUTO.nome}`,
  description: `Como excluir sua conta e seus dados do aplicativo ${PRODUTO.nome}, com ou sem acesso ao app.`,
}

export default function ExcluirContaPublica() {
  return (
    <PaginaLegal
      titulo={`Excluir sua conta ${PRODUTO.nome}`}
      subtitulo={`Esta página serve para pedir a exclusão da sua conta e dos dados associados no aplicativo ${PRODUTO.nome}, com ou sem acesso ao app.`}
    >
      <Secao titulo="Pedir a exclusão">
        <p>Há dois caminhos. Os dois levam à mesma confirmação.</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-1">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 flex flex-col gap-2">
            <p className="text-white font-semibold text-sm">1. Pelo app (logado)</p>
            <p className="text-xs">Entre na sua conta e vá em <strong className="text-gray-300">Configurações → Excluir minha conta</strong>, ou abra direto:</p>
            <Link href="/conta/excluir" className="mt-auto inline-flex justify-center rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 transition">
              Entrar e excluir
            </Link>
          </div>
          <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-4 flex flex-col gap-2">
            <p className="text-white font-semibold text-sm">2. Sem entrar no app</p>
            <p className="text-xs">Informe o e-mail da conta. Enviamos um link seguro para você confirmar.</p>
            <FormularioExclusao />
          </div>
        </div>
        <p className="text-xs mt-1">
          Sem acesso ao e-mail? Escreva para{' '}
          <a href={`mailto:${CONTATO.encarregado}`} className="text-blue-400 hover:text-blue-300 underline">{CONTATO.encarregado}</a>{' '}
          com o e-mail cadastrado e o CPF/CNPJ da conta. Respondemos em até 15 dias.
        </p>
      </Secao>

      <Secao titulo="O que acontece depois do pedido">
        <Lista itens={[
          <><strong className="text-gray-300">Na hora:</strong> a conta é desativada — some das buscas, do delivery e das notificações; assinaturas são canceladas sem cobrança futura.</>,
          <><strong className="text-gray-300">Por 30 dias:</strong> você pode desistir. Basta entrar de novo e tocar em <em>Reativar conta</em>.</>,
          <><strong className="text-gray-300">Depois de 30 dias:</strong> apagamos definitivamente login, nome, CPF/CNPJ, telefone, endereço, fotos, documentos, localização, notificações, conquistas, e, no caso de lojas, produtos, vendas, gastos, fiado, agenda e funcionários.</>,
          <>Antes de confirmar, o app oferece <strong className="text-gray-300">baixar uma cópia dos seus dados</strong>.</>,
        ]} />
      </Secao>

      <Secao titulo="O que é mantido, e por quê">
        <p>Por obrigação legal e para defesa em eventual processo, guardamos por 5 anos, <strong className="text-gray-300">sem seu nome, telefone, endereço ou localização</strong>:</p>
        <Lista itens={[
          'Registros de pedidos, corridas e pagamentos feitos pela plataforma (valores, datas, situação).',
          'Avaliações que você publicou (nota e comentário), atribuídas a "Cliente removido".',
          'Mensagens trocadas com lojas ou fornecedores, visíveis apenas para a outra parte, com o seu nome removido.',
          'Um código irreversível derivado do CPF/CNPJ, por 2 anos, para impedir fraude no período de teste e nas indicações.',
        ]} />
        <p>
          Os detalhes estão na{' '}
          <Link href="/privacidade" className="text-blue-400 hover:text-blue-300 underline">Política de Privacidade</Link>, seções 6 e 7.
        </p>
      </Secao>
    </PaginaLegal>
  )
}
