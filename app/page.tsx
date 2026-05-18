import Link from 'next/link'
import { Store, User, Truck } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="mb-10 text-center">
        <h1 className="text-5xl font-bold text-white mb-2">Commerly</h1>
        <p className="text-gray-400 text-lg">Conectando comércios, clientes e fornecedores</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
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

        <div className="w-full bg-gray-800 text-gray-500 font-semibold py-4 px-6 rounded-2xl flex items-center gap-4 cursor-not-allowed select-none">
          <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center shrink-0">
            <User size={20} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold text-gray-400">Sou Cliente</p>
            <p className="text-gray-600 text-sm">Descobrir comércios locais</p>
          </div>
          <span className="text-xs font-bold bg-gray-700 text-gray-400 px-2 py-1 rounded-lg shrink-0">Em breve</span>
        </div>

        <div className="w-full bg-gray-800 text-gray-500 font-semibold py-4 px-6 rounded-2xl flex items-center gap-4 cursor-not-allowed select-none">
          <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center shrink-0">
            <Truck size={20} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold text-gray-400">Sou Fornecedor</p>
            <p className="text-gray-600 text-sm">Oferecer produtos e serviços</p>
          </div>
          <span className="text-xs font-bold bg-gray-700 text-gray-400 px-2 py-1 rounded-lg shrink-0">Em breve</span>
        </div>
      </div>
    </main>
  )
}
