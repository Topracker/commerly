import Link from 'next/link'
import { createAdminClient } from '../../lib/supabase-admin'
import { Store, User, Bike, Truck, Gift } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  return {
    title: `Convite ${codigo.toUpperCase()} — Commerly`,
    description: 'Você foi convidado para a Commerly, o sistema operacional do pequeno comércio.',
    robots: { index: false },
  }
}

const PORTAS = [
  { href: '/cliente/login', Icone: User, t: 'Sou Cliente', d: 'Peça do comércio local com desconto' },
  { href: '/login', Icone: Store, t: 'Sou Comerciante', d: 'Gerencie sua loja' },
  { href: '/entregador-delivery/login', Icone: Bike, t: 'Sou Entregador', d: 'Ganhe por corrida' },
  { href: '/fornecedor/login', Icone: Truck, t: 'Sou Fornecedor', d: 'Ofereça produtos' },
]

export default async function Convite({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const cod = codigo.toUpperCase()
  const admin = createAdminClient()
  const { data } = await admin.from('codigos_indicacao').select('papel').eq('codigo', cod).maybeSingle()
  const valido = !!data

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body flex items-center justify-center px-6 py-16">
      {/* Guarda o código para atribuir a indicação no cadastro. */}
      <script dangerouslySetInnerHTML={{ __html: `try{localStorage.setItem('commerly:indicacao','${cod.replace(/[^A-Z0-9]/g, '')}')}catch(e){}` }} />
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-acento/15 flex items-center justify-center mx-auto mb-4">
          <Gift size={30} className="text-acento" />
        </div>
        <h1 className="font-display text-3xl font-bold text-white">Você foi convidado! 🎉</h1>
        <p className="text-gray-400 mt-2">
          {valido
            ? <>Alguém te convidou para a Commerly com o código <span className="text-white font-mono font-semibold">{cod}</span>.</>
            : <>Bem-vindo à Commerly, o sistema operacional do pequeno comércio.</>}
        </p>

        <div className="flex flex-col gap-2.5 mt-8 text-left">
          {PORTAS.map(p => (
            <Link key={p.href} href={p.href} className="grupo bg-card border border-borda hover:border-acento/40 rounded-2xl p-4 transition flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-elevado flex items-center justify-center shrink-0"><p.Icone size={19} className="text-acento grupo-icone" /></span>
              <span className="min-w-0">
                <span className="block text-white font-semibold">{p.t}</span>
                <span className="block text-gray-500 text-sm">{p.d}</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-6">Ao se cadastrar, o convite é creditado a quem te trouxe.</p>
      </div>
    </main>
  )
}
