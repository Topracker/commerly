// ============================================================================
// EXCLUSÃO DE CONTA — domínio (Google Play "Delete account" + LGPD art. 18)
// ----------------------------------------------------------------------------
// O banco manda: sql/2026-09-19-excluir-conta.sql tem as funções
// checar_/solicitar_/reativar_/purgar_conta. Este módulo é o que fica FORA do
// SQL — Stripe, Storage, Auth, e-mail — e o vocabulário compartilhado entre as
// rotas (/api/conta/*) e as telas (/conta/*, /excluir-conta).
//
// Ciclo: solicitar (efeito imediato, reversível) → 30 dias de carência →
// purga pelo cron diário. Quem entra na carência só vê /conta/agendada.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { enviarEmail, escaparHtml } from './email'

export const CARENCIA_DIAS = 30

/** Papéis como o banco os chama (mesma ordem de prioridade de papeis.ts). */
export type PapelExclusao = 'comerciante' | 'cliente' | 'entregador' | 'fornecedor'

/**
 * Contas de teste ficam fora do fluxo (decisão 5, lista fixa). Espelho de
 * `email_protegido_exclusao()` no SQL — mudou aqui, mude lá.
 */
export const CONTAS_PROTEGIDAS = [
  'matheus@teste.com', 'cliente@teste.com', 'entregador@teste.com', 'fornecedor@teste.com',
]
export function contaProtegida(email: string | null | undefined): boolean {
  return CONTAS_PROTEGIDAS.includes((email || '').trim().toLowerCase())
}

/** Para onde mandar cada papel depois de reativar. */
export const DASHBOARD_POR_PAPEL: Record<PapelExclusao, string> = {
  comerciante: '/dashboard',
  cliente: '/cliente/dashboard',
  entregador: '/entregador-delivery/dashboard',
  fornecedor: '/fornecedor/dashboard',
}

export type Bloqueio = { codigo: string; quantidade: number }

/** Resultado de checar_exclusao_conta() como a rota devolve à tela. */
export type Checagem = {
  papel: PapelExclusao | null
  perfil_id: string | null
  nome: string | null
  bloqueios: Bloqueio[]
  avisos: { assinatura_ativa?: boolean; ads_ativo?: boolean; pontos_clube?: number }
  pendente: { id: string; executa_apos: string } | null
}

/** Texto de cada bloqueio — o que a pessoa precisa resolver antes. */
export function textoBloqueio(b: Bloqueio, papel: PapelExclusao | null): string {
  const n = b.quantidade
  switch (b.codigo) {
    case 'pedidos_abertos':
      return papel === 'comerciante'
        ? `Você tem ${n} pedido(s) de delivery em andamento. Conclua ou cancele pelo painel (pedido pago online é estornado no cancelamento).`
        : `Você tem ${n} pedido(s) em andamento. Aguarde a entrega ou o cancelamento.`
    case 'pedidos_b2b_abertos':
      return `Você tem ${n} pedido(s) com fornecedor/loja ainda abertos. Conclua ou recuse antes.`
    case 'corridas_abertas':
      return `Você tem ${n} corrida(s) em andamento. Finalize a entrega antes.`
    default:
      return `Pendência: ${b.codigo} (${n}).`
  }
}

/**
 * As funções SQL falham com `raise exception '<codigo>'`. Traduz para o que a
 * tela mostra e o status HTTP adequado.
 */
export function traduzirErroSql(msg: string | undefined): { status: number; erro: string; bloqueios?: Bloqueio[] } {
  const m = msg || ''
  if (m.includes('conta_protegida')) return { status: 403, erro: 'Esta conta não pode ser excluída por aqui.' }
  if (m.includes('ja_pendente')) return { status: 409, erro: 'A exclusão desta conta já foi solicitada.' }
  if (m.includes('nada_pendente')) return { status: 409, erro: 'Não há exclusão pendente nesta conta.' }
  if (m.startsWith('bloqueado:') || m.includes('bloqueado:')) {
    try {
      const json = m.slice(m.indexOf('bloqueado:') + 'bloqueado:'.length)
      const bloqueios = JSON.parse(json) as Bloqueio[]
      return { status: 409, erro: 'Há pendências que precisam ser resolvidas antes.', bloqueios }
    } catch {
      return { status: 409, erro: 'Há pendências que precisam ser resolvidas antes.' }
    }
  }
  return { status: 500, erro: 'Não foi possível processar o pedido agora. Tente novamente.' }
}

// ----------------------------------------------------------------------------
// Stripe: assinatura cancela NA HORA, sem pro-rata (decisão 4). Roda ANTES do
// SQL: se a Stripe falhar, a conta não entra em carência com cobrança viva.
// ----------------------------------------------------------------------------
export async function cancelarAssinaturasDaLoja(
  stripe: Stripe | null,
  loja: { stripe_subscription_id?: string | null; stripe_ads_subscription_id?: string | null },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const ids = [loja.stripe_subscription_id, loja.stripe_ads_subscription_id].filter(Boolean) as string[]
  if (ids.length === 0) return { ok: true }
  if (!stripe) return { ok: false, erro: 'Stripe não configurada' }
  for (const id of ids) {
    try {
      await stripe.subscriptions.cancel(id)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      // Já cancelada/inexistente na Stripe: não é motivo para travar a exclusão.
      if (err?.code === 'resource_missing') continue
      if (typeof err?.message === 'string' && /canceled subscription/i.test(err.message)) continue
      return { ok: false, erro: err?.message || 'falha na Stripe' }
    }
  }
  return { ok: true }
}

// ----------------------------------------------------------------------------
// Storage: pasta do dono em cada bucket. Os caminhos são planos
// (`{id}/arquivo`), então um list() no prefixo basta.
// ----------------------------------------------------------------------------
function pastasDoTitular(papel: PapelExclusao | null, perfilId: string | null, userId: string): { bucket: string; prefixo: string }[] {
  if (!papel || !perfilId) return []
  switch (papel) {
    case 'comerciante':
      return [
        { bucket: 'lojas', prefixo: perfilId },     // fachada (lib/fachada.ts)
        { bucket: 'feed', prefixo: perfilId },      // posts/stories (lib/feed.ts)
        { bucket: 'produtos', prefixo: perfilId },  // fotos de produto (produtos/page.tsx)
      ]
    case 'cliente':
      return [{ bucket: 'avaliacoes', prefixo: `loja/${perfilId}` }] // fotos de avaliação
    case 'entregador':
      // Rosto, RG/CNH e bolsa — pasta é por USER id (lib/entregadores.ts).
      // Comprovantes de entrega (avaliacoes/comprovante/{id}) FICAM: são prova
      // da transação para loja e cliente.
      return [{ bucket: 'entregadores', prefixo: userId }]
    case 'fornecedor':
      return []
  }
}

export async function apagarStorageDoTitular(
  admin: SupabaseClient, papel: PapelExclusao | null, perfilId: string | null, userId: string,
): Promise<{ removidos: number; erros: string[] }> {
  let removidos = 0
  const erros: string[] = []
  for (const { bucket, prefixo } of pastasDoTitular(papel, perfilId, userId)) {
    const { data: arquivos, error } = await admin.storage.from(bucket).list(prefixo, { limit: 1000 })
    if (error) { erros.push(`${bucket}/${prefixo}: ${error.message}`); continue }
    const caminhos = (arquivos || []).filter(a => a.name && a.id).map(a => `${prefixo}/${a.name}`)
    if (caminhos.length === 0) continue
    const { error: errRemove } = await admin.storage.from(bucket).remove(caminhos)
    if (errRemove) { erros.push(`${bucket}/${prefixo}: ${errRemove.message}`); continue }
    removidos += caminhos.length
  }
  return { removidos, erros }
}

// ----------------------------------------------------------------------------
// Purga completa de UM pedido: Storage → SQL (purgar_conta) → Auth → e-mail.
// Idempotente: cada etapa marca a coluna correspondente em exclusoes_conta e
// o cron só repete o que faltou.
// ----------------------------------------------------------------------------
export type LinhaExclusao = {
  id: string
  user_id: string
  papel: PapelExclusao | null
  perfil_id: string | null
  email: string | null
  executa_apos: string
  executado_em: string | null
  auth_apagado_em: string | null
}

export async function purgarExclusao(
  admin: SupabaseClient, ex: LinhaExclusao,
): Promise<{ ok: boolean; etapas: string[]; erro?: string }> {
  const etapas: string[] = []
  try {
    if (!ex.executado_em) {
      const st = await apagarStorageDoTitular(admin, ex.papel, ex.perfil_id, ex.user_id)
      etapas.push(`storage:${st.removidos}`)
      // Storage com erro NÃO aborta: o dado pessoal que importa está no banco.
      // Fica no log/erro para conferir à mão.
      if (st.erros.length) etapas.push(`storage_erros:${st.erros.join(' | ')}`)

      const { error } = await admin.rpc('purgar_conta', { p_exclusao_id: ex.id })
      if (error) throw new Error(`purgar_conta: ${error.message}`)
      etapas.push('banco')
    }

    if (!ex.auth_apagado_em) {
      const { error } = await admin.auth.admin.deleteUser(ex.user_id)
      // Usuário já não existe (apagado à mão, ou reexecução): segue.
      if (error && !/not found/i.test(error.message)) throw new Error(`deleteUser: ${error.message}`)
      const { data: marcado, error: errMarca } = await admin
        .from('exclusoes_conta').update({ auth_apagado_em: new Date().toISOString(), erro: null })
        .eq('id', ex.id).select('id')
      if (errMarca || !marcado?.length) throw new Error(`marcar auth_apagado_em: ${errMarca?.message || 'zero linhas'}`)
      etapas.push('auth')

      if (ex.email) {
        const { html, texto } = templateExclusaoConcluida()
        const envio = await enviarEmail({ para: ex.email, assunto: 'Sua conta foi excluída — Commerly', html, texto })
        etapas.push(envio.ok ? 'email' : `email_falhou:${envio.erro}`)
      }
    }
    return { ok: true, etapas }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin.from('exclusoes_conta').update({ erro: msg.slice(0, 500) }).eq('id', ex.id)
    return { ok: false, etapas, erro: msg }
  }
}

// ----------------------------------------------------------------------------
// E-mails (mesmo visual do reset de senha: estilos inline, sem <style>).
// ----------------------------------------------------------------------------
function casca(titulo: string, corpoHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 4px;color:#2563eb;font-size:13px;font-weight:600;">Commerly</p>
          <h1 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">${titulo}</h1>
          ${corpoHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

const P = (t: string) => `<p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">${t}</p>`
const RODAPE = (t: string) =>
  `<p style="margin:0;padding-top:20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;line-height:1.6;">${t}</p>`

export function formatarDataBr(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}

/** Pedido recebido: diz a data da exclusão definitiva e como desistir. */
export function templateExclusaoSolicitada(executaApos: string, linkEntrar: string): { html: string; texto: string } {
  const data = formatarDataBr(executaApos)
  const html = casca('Recebemos seu pedido de exclusão',
    P(`Sua conta na Commerly foi desativada e será <strong>excluída definitivamente em ${data}</strong>. Até lá ela fica invisível para outras pessoas e você não recebe mais notificações.`) +
    P(`Mudou de ideia? Basta <a href="${escaparHtml(linkEntrar)}" style="color:#2563eb;">entrar de novo</a> antes dessa data e tocar em <strong>Reativar conta</strong>.`) +
    P(`Assinaturas foram canceladas na hora, sem cobrança futura. O que fica guardado depois da exclusão (registros de pedidos e pagamentos, por obrigação legal) está descrito na nossa <a href="https://commerly.com.br/privacidade" style="color:#2563eb;">Política de Privacidade</a>.`) +
    RODAPE('Se você não pediu isso, entre na sua conta agora e reative — e troque a senha.'))
  const texto = [
    'Recebemos seu pedido de exclusão — Commerly', '',
    `Sua conta foi desativada e será excluída definitivamente em ${data}.`,
    'Mudou de ideia? Entre de novo antes dessa data e toque em "Reativar conta":', linkEntrar, '',
    'Assinaturas foram canceladas na hora. O que fica guardado por obrigação legal está em https://commerly.com.br/privacidade', '',
    'Se você não pediu isso, entre na sua conta agora, reative e troque a senha.',
  ].join('\n')
  return { html, texto }
}

/** Purga concluída: prova de atendimento ao pedido (art. 18). */
export function templateExclusaoConcluida(): { html: string; texto: string } {
  const html = casca('Sua conta foi excluída',
    P('Concluímos a exclusão da sua conta na Commerly. Seus dados pessoais foram apagados ou anonimizados.') +
    P('Ficaram apenas os registros que a lei nos obriga a manter (histórico de pedidos e pagamentos, sem o seu nome, telefone ou endereço), conforme a <a href="https://commerly.com.br/privacidade" style="color:#2563eb;">Política de Privacidade</a>.') +
    RODAPE('Obrigado por ter usado a Commerly. Se quiser voltar um dia, é só criar uma conta nova.'))
  const texto = [
    'Sua conta foi excluída — Commerly', '',
    'Concluímos a exclusão da sua conta. Seus dados pessoais foram apagados ou anonimizados.',
    'Ficaram apenas os registros que a lei nos obriga a manter, sem seu nome, telefone ou endereço: https://commerly.com.br/privacidade',
  ].join('\n')
  return { html, texto }
}

/** Link da página pública: leva direto ao passo de confirmação, já logado. */
export function templateLinkExclusao(link: string): { html: string; texto: string } {
  const html = casca('Excluir sua conta',
    P('Recebemos um pedido para excluir a conta associada a este e-mail. Se foi você, toque no botão para confirmar. O link vale por 1 hora.') +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#dc2626;border-radius:12px;">
        <a href="${escaparHtml(link)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Continuar com a exclusão</a>
      </td></tr>
    </table>` +
    P(`Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="color:#2563eb;word-break:break-all;">${escaparHtml(link)}</span>`) +
    RODAPE('Se você não pediu isso, ignore este e-mail — nada acontece com a sua conta.'))
  const texto = [
    'Excluir sua conta — Commerly', '',
    'Recebemos um pedido para excluir a conta associada a este e-mail.',
    'Se foi você, abra o endereço abaixo para confirmar (válido por 1 hora):', '', link, '',
    'Se você não pediu isso, ignore este e-mail.',
  ].join('\n')
  return { html, texto }
}
