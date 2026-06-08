import Link from 'next/link'
import { Store, User, Truck } from 'lucide-react'
import AnimatedBackground from './components/AnimatedBackground'

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

        <div className="relative opacity-50 cursor-not-allowed select-none pointer-events-none">
          <div className="w-full bg-green-600 text-white font-semibold py-4 px-6 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shrink-0">
              <User size={20} />
            </div>
            <div>
              <p className="text-lg font-bold">Sou Cliente</p>
              <p className="text-green-200 text-sm">Descobrir comércios locais</p>
            </div>
          </div>
          <span className="absolute top-2 right-3 text-xs font-bold bg-black/40 text-white px-2 py-0.5 rounded-full">
            Em breve
          </span>
        </div>

        <div className="relative opacity-50 cursor-not-allowed select-none pointer-events-none">
          <div className="w-full bg-purple-600 text-white font-semibold py-4 px-6 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center shrink-0">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-lg font-bold">Sou Fornecedor</p>
              <p className="text-purple-200 text-sm">Oferecer produtos e serviços</p>
            </div>
          </div>
          <span className="absolute top-2 right-3 text-xs font-bold bg-black/40 text-white px-2 py-0.5 rounded-full">
            Em breve
          </span>
        </div>
      </div>
    </main>
  )
}
