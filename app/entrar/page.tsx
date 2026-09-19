import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { Store, User, Truck, Bike, ArrowRight } from 'lucide-react'
import { papeisDaConta } from '../lib/papeis'
import { situacaoPlano } from '../lib/plano'

// ============================================================================
// /entrar — porta de entrada do app instalado (start_url do manifest / TWA).
//
// Por que não /login: /login é a tela do COMERCIANTE. Quem já está logado
// como cliente, entregador ou fornecedor e abre /login é DESLOGADO com a
// mensagem "esta conta está cadastrada como cliente" (app/login/page.tsx,
// checagem de papel exclusivo). Como start_url isso quebraria 3 dos 4 papéis
// a cada abertura do app. E a landing "/" é marketing.
//
// Aqui, no servidor: com sessão, descobre o papel e manda para a área certa
// (comerciante ainda respeita o paywall: /planos quando vencido); sem sessão,
// mostra só as quatro portas. Fica fora do proxy.ts de propósito — o destino
// já passa por ele (paywall, carência de exclusão).
// ============================================================================

export const metadata: Metadata = { title: 'Entrar — Commerly', robots: { index: false } }
export const dynamic = 'force-dynamic'

const DESTINO = {
  cliente: '/cliente/buscar',
  entregador: '/entregador-delivery/dashboard',
  fornecedor: '/fornecedor/dashboard',
} as const

const PORTAS = [
  { href: '/login', titulo: 'Sou Comerciante', sub: 'Gerenciar minha loja', Icone: Store, classes: 'bg-azul hover:brightness-110', subCor: 'text-white/70' },
  { href: '/cliente/login', titulo: 'Sou Cliente', sub: 'Descobrir comércios locais', Icone: User, classes: 'bg-acento hover:bg-acento-forte', subCor: 'text-black/55' },
  { href: '/fornecedor/login', titulo: 'Sou Fornecedor', sub: 'Oferecer produtos e serviços', Icone: Truck, classes: 'bg-purple-600 hover:bg-purple-700', subCor: 'text-white/70' },
  { href: '/entregador-delivery/login', titulo: 'Sou Entregador', sub: 'Fazer entregas e ganhar por corrida', Icone: Bike, classes: 'bg-elevado hover:bg-borda border border-borda', subCor: 'text-gray-400' },
] as const

export default async function Entrar() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const [papel] = await papeisDaConta(supabase, user.id)
    if (papel === 'comerciante') {
      const { data: loja } = await supabase
        .from('lojas').select('plano, trial_expira_em').eq('user_id', user.id).maybeSingle()
      redirect(situacaoPlano(loja).liberada ? '/dashboard' : '/planos')
    }
    if (papel) redirect(DESTINO[papel])
    // Sessão sem perfil (OAuth recém-criado, cadastro abandonado): /login
    // mostra a tela 'sem-loja' com as opções certas.
    redirect('/login')
  }

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo flex items-center">
      <div className="max-w-md mx-auto px-4 py-10 w-full">
        <h1 className="text-2xl font-bold text-white">Entrar na Commerly</h1>
        <p className="text-gray-400 text-sm mt-1 mb-6">Escolha a sua área.</p>
        <div className="flex flex-col gap-3">
          {PORTAS.map(({ href, titulo, sub, Icone, classes, subCor }) => (
            <Link key={href} href={href} className={`${classes} text-white font-semibold rounded-2xl px-5 py-4 flex items-center gap-4 transition`}>
              <span className="w-10 h-10 rounded-xl bg-black/15 flex items-center justify-center shrink-0">
                <Icone size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-lg font-bold leading-tight">{titulo}</span>
                <span className={`block text-sm ${subCor}`}>{sub}</span>
              </span>
              <ArrowRight size={18} className="shrink-0 opacity-70" />
            </Link>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-6 text-center">
          <Link href="/" className="hover:text-gray-400 transition">Conhecer a Commerly</Link>
        </p>
      </div>
    </main>
  )
}
