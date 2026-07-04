import Link from 'next/link'
import { Store, User, Truck, Bike, Globe, ArrowRight } from 'lucide-react'
import AnimatedBackground from './components/AnimatedBackground'

// Link do parceiro que cria sites profissionais para as lojas.
// TODO: trocar pelo endereço final do parceiro.
const SITE_PARCEIRO = 'https://exemplo-parceiro.com'

export default function Home() {
  return (
    <main className="relative min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mb-10 text-center">
        <h1 className="text-5xl font-bold text-white mb-2">Commerly</h1>
        <p className="text-gray-400 text-lg">Gestão completa para o seu comércio</p>
      </div>

      <div className="relative z-10 flex flex-col gap-4 w-full max-w-sm">
        <Link href="/login">
          <div className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-2xl transition flex items-center gap-4 cursor-pointer">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shrink-0">
              <Store size={20} />
            </div>
            <div>
              <p className="text-lg font-bold">Sou Comerciante</p>
              <p className="text-blue-200 text-sm">Gerenciar minha loja</p>
            </div>
          </div>
        </Link>

        <Link href="/cliente/login">
          <div className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-2xl transition flex items-center gap-4 cursor-pointer">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shrink-0">
              <User size={20} />
            </div>
            <div>
              <p className="text-lg font-bold">Sou Cliente</p>
              <p className="text-green-200 text-sm">Descobrir comércios locais</p>
            </div>
          </div>
        </Link>

        <Link href="/fornecedor/login">
          <div className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 px-6 rounded-2xl transition flex items-center gap-4 cursor-pointer">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center shrink-0">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-lg font-bold">Sou Fornecedor</p>
              <p className="text-purple-200 text-sm">Oferecer produtos e serviços</p>
            </div>
          </div>
        </Link>

        <Link href="/entregador-delivery/login">
          <div className="w-full bg-[#C1441E] hover:bg-[#a83a19] text-white font-semibold py-4 px-6 rounded-2xl transition flex items-center gap-4 cursor-pointer">
            <div className="w-10 h-10 bg-[#E0632C] rounded-xl flex items-center justify-center shrink-0">
              <Bike size={20} />
            </div>
            <div>
              <p className="text-lg font-bold">Sou Entregador</p>
              <p className="text-orange-200 text-sm">Fazer entregas e ganhar por corrida</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Parceiros — criação de site profissional para a loja. Discreto, não intrusivo. */}
      <a
        href={SITE_PARCEIRO}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative z-10 mt-8 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.07] backdrop-blur-sm px-5 py-4 transition flex items-center gap-4"
      >
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <Globe size={18} className="text-gray-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-semibold">Quer um site profissional para sua loja?</p>
          <p className="text-gray-400 text-xs mt-0.5">Conheça nosso parceiro de criação de sites.</p>
        </div>
        <ArrowRight size={16} className="text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition shrink-0" />
      </a>
    </main>
  )
}
