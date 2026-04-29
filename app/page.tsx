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
      </div>
    </main>
  )
}
