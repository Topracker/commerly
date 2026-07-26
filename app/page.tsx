import Link from 'next/link'
import {
  Store, User, Truck, Bike, ArrowRight,
  Rss, Gauge, Bot, Wallet, MapPin, GraduationCap,
} from 'lucide-react'
import AnimatedBackground from './components/AnimatedBackground'
import HomeCrescimento from './components/HomeCrescimento'
import AvisoCobertura from './components/AvisoCobertura'

const PORTAS = [
  {
    href: '/login', titulo: 'Sou Comerciante', sub: 'Gerenciar minha loja', Icone: Store,
    classes: 'bg-azul hover:brightness-110', subCor: 'text-white/70',
  },
  {
    // Verde aqui é cor de PAPEL, não de CTA — por isso não virou azul.
    href: '/cliente/login', titulo: 'Sou Cliente', sub: 'Descobrir comércios locais', Icone: User,
    classes: 'bg-acento hover:bg-acento-forte', subCor: 'text-black/55',
  },
  {
    href: '/fornecedor/login', titulo: 'Sou Fornecedor', sub: 'Oferecer produtos e serviços', Icone: Truck,
    classes: 'bg-purple-600 hover:bg-purple-700', subCor: 'text-white/70',
  },
  {
    href: '/entregador-delivery/login', titulo: 'Sou Entregador', sub: 'Fazer entregas e ganhar por corrida', Icone: Bike,
    classes: 'bg-elevado hover:bg-borda border border-borda', subCor: 'text-gray-400',
  },
] as const

const FEATURES = [
  { Icone: Gauge, titulo: 'Commerly Score', texto: 'A saúde do seu negócio em 4 pilares, com a próxima ação sugerida.' },
  { Icone: Bot, titulo: 'Copilot de IA', texto: 'Insights semanais sobre o que vender, quando e para quem.' },
  { Icone: Rss, titulo: 'Feed Social', texto: 'Posts e stories da sua loja no feed dos clientes por perto.' },
  { Icone: Wallet, titulo: 'Financeiro real', texto: 'Fluxo de caixa, lucro de verdade e o DAS do MEI calculado.' },
  { Icone: MapPin, titulo: 'Delivery próprio', texto: 'Entregadores parceiros, GPS ao vivo e taxa por distância.' },
  { Icone: GraduationCap, titulo: 'Academy', texto: 'Aulas curtas para vender mais, escritas para quem tem o dia cheio.' },
] as const

export default function Home() {
  return (
    <main data-theme="dark" className="relative min-h-screen bg-fundo overflow-hidden">
      <AnimatedBackground />

      {/* HERO */}
      <section className="relative z-10 flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center">
        <span
          className="anima-surgir inline-flex items-center gap-2 rounded-full border border-borda bg-card/70 backdrop-blur px-3.5 py-1.5 text-xs text-gray-300"
          style={{ '--atraso': '0ms' } as React.CSSProperties}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-acento animate-pulse" />
          Estamos construindo a maior comunidade de pequenos comércios do Brasil
        </span>

        <h1
          className="anima-subir font-display text-5xl sm:text-7xl font-bold tracking-tight mt-6 bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent"
          style={{ '--atraso': '80ms' } as React.CSSProperties}
        >
          Commerly
        </h1>

        <p
          className="anima-subir font-display text-white text-xl sm:text-2xl font-semibold mt-4 max-w-2xl leading-snug"
          style={{ '--atraso': '140ms' } as React.CSSProperties}
        >
          O Sistema Operacional do Pequeno Comércio
        </p>

        <p
          className="anima-subir font-body text-gray-400 text-base sm:text-lg mt-3 max-w-xl leading-relaxed"
          style={{ '--atraso': '200ms' } as React.CSSProperties}
        >
          A plataforma que conecta comerciantes, clientes e entregadores em um único
          ecossistema. O delivery é só uma das peças.
        </p>

        {/* Onde o delivery já roda. Fica abaixo do texto do herói e acima das
            portas de entrada: informa antes da escolha, sem interromper.
            Some sozinho quando o delivery estiver liberado em todo lugar. */}
        <div className="w-full max-w-md mt-6">
          <AvisoCobertura />
        </div>

        {/* Portas de entrada por papel */}
        <div className="w-full max-w-sm flex flex-col gap-3 mt-10">
          {PORTAS.map(({ href, titulo, sub, Icone, classes, subCor }, i) => (
            <Link
              key={href}
              href={href}
              className={`anima-subir grupo ${classes} text-white font-semibold py-4 px-5 rounded-2xl transition flex items-center gap-4 text-left`}
              style={{ '--atraso': `${240 + i * 70}ms` } as React.CSSProperties}
            >
              <span className="w-10 h-10 rounded-xl bg-black/15 flex items-center justify-center shrink-0">
                <Icone size={20} className="grupo-icone" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-tight">{titulo}</span>
                <span className={`block text-sm ${subCor}`}>{sub}</span>
              </span>
              <ArrowRight size={17} className="ml-auto shrink-0 opacity-60" />
            </Link>
          ))}
        </div>
      </section>

      {/* CRESCIMENTO — contadores ao vivo, feed de conquistas, marcos, cidades */}
      <HomeCrescimento />

      {/* FEATURES */}
      <section className="relative z-10 px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <h2
            className="anima-subir font-display text-center text-2xl font-bold text-white mb-2"
            style={{ '--atraso': '0ms' } as React.CSSProperties}
          >
            Gerencie seu comércio, receba pedidos e cresça
          </h2>
          <p className="text-center text-gray-500 text-sm mb-10">
            Tudo em um só lugar, sem comissão sobre cada venda.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map(({ Icone, titulo, texto }, i) => (
              <div
                key={titulo}
                className="anima-subir grupo bg-card border border-borda rounded-2xl p-5 hover:border-acento/40 transition"
                style={{ '--atraso': `${i * 70}ms` } as React.CSSProperties}
              >
                <span className="w-10 h-10 rounded-xl bg-acento/12 flex items-center justify-center mb-3">
                  <Icone size={19} className="text-acento grupo-icone" />
                </span>
                <p className="font-display text-white font-semibold">{titulo}</p>
                <p className="text-gray-400 text-sm mt-1 leading-relaxed">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NAVEGAÇÃO — páginas do ecossistema */}
      <section className="relative z-10 px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { href: '/para-comerciantes', t: 'Para comerciantes' },
              { href: '/para-entregadores', t: 'Para entregadores' },
              { href: '/para-clientes', t: 'Para clientes' },
              { href: '/expansao', t: '🗺️ Expansão por cidades' },
              { href: '/fundadores', t: '🏅 Programa Fundadores' },
              { href: '/embaixadores', t: '🎖️ Embaixadores' },
              { href: '/hall-da-fama', t: '🏆 Hall da Fama' },
              { href: '/ranking', t: '📊 Rankings' },
              { href: '/medalhas', t: '🏅 Medalhas' },
              { href: '/timeline', t: '📜 Nossa história' },
              { href: '/parceiros', t: 'Parceiros' },
              { href: '/blog', t: '📰 Blog' },
              { href: '/investidores', t: 'Investidores' },
              { href: '/sobre', t: 'Sobre a Commerly' },
              { href: '/loja', t: '🛍️ Loja oficial' },
            ].map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="grupo rounded-xl border border-borda bg-card hover:border-acento/40 px-4 py-3 text-sm text-gray-300 hover:text-white transition flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate">{l.t}</span>
                <ArrowRight size={14} className="text-gray-600 shrink-0 grupo-icone" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
