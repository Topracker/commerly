import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="mb-10 text-center">
        <h1 className="text-5xl font-bold text-white mb-2">Commerly</h1>
        <p className="text-gray-400 text-lg">Gerencie seu comércio com simplicidade</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <Link href="/login">
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl text-lg transition">
            Sou Comerciante
          </button>
        </Link>

        <button disabled className="w-full bg-gray-800 text-gray-500 font-semibold py-4 rounded-2xl text-lg cursor-not-allowed">
          Sou Cliente (em breve)
        </button>

        <button disabled className="w-full bg-gray-800 text-gray-500 font-semibold py-4 rounded-2xl text-lg cursor-not-allowed">
          Sou Fornecedor (em breve)
        </button>
      </div>
    </main>
  )
}
