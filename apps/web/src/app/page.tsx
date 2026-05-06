import Link from 'next/link';
import { Dumbbell, Salad, Brain, TrendingUp, MessageSquare, Shield } from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Nav */}
      <nav className="container mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <Dumbbell size={18} className="text-white" />
          </div>
          <span className="font-bold text-xl">FitAI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-gray-300 hover:text-white transition-colors">
            Entrar
          </Link>
          <Link
            href="/register"
            className="bg-primary-500 hover:bg-primary-600 text-white px-5 py-2 rounded-lg font-semibold transition-colors"
          >
            Começar Grátis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-6 pt-20 pb-28 text-center">
        <div className="inline-flex items-center gap-2 bg-primary-500/10 border border-primary-500/20 rounded-full px-4 py-2 mb-8">
          <span className="w-2 h-2 bg-primary-400 rounded-full animate-pulse" />
          <span className="text-primary-400 text-sm font-medium">Powered by GPT-4o</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Seu personal trainer,<br />
          <span className="text-primary-400">nutricionista e coach</span><br />
          com IA
        </h1>

        <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-10">
          Treinos personalizados, dieta calculada e acompanhamento diário — tudo adaptado para você,
          com memória contextual e multiagentes de IA.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="bg-primary-500 hover:bg-primary-600 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-colors"
          >
            Começar Grátis →
          </Link>
          <Link
            href="#features"
            className="border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white px-8 py-4 rounded-xl text-lg font-semibold transition-colors"
          >
            Ver Funcionalidades
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-6 pb-28">
        <h2 className="text-4xl font-bold text-center mb-16">Tudo que você precisa</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 hover:border-primary-500/50 transition-colors"
            >
              <div className="w-12 h-12 bg-primary-500/10 rounded-xl flex items-center justify-center mb-4">
                <f.icon size={24} className="text-primary-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
              <p className="text-gray-400">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 pb-20 text-center">
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-3xl p-12">
          <h2 className="text-4xl font-bold mb-4">Pronto para transformar seu corpo?</h2>
          <p className="text-primary-100 text-xl mb-8">
            Comece hoje com um plano 100% personalizado
          </p>
          <Link
            href="/register"
            className="bg-white text-primary-700 hover:bg-gray-100 px-8 py-4 rounded-xl text-lg font-bold transition-colors inline-block"
          >
            Criar minha conta grátis
          </Link>
        </div>
      </section>
    </main>
  );
}

const features = [
  {
    icon: Dumbbell,
    title: 'Treinos Personalizados',
    description: 'Planos semanais gerados por IA com exercícios, séries, repetições e progressão automática.',
  },
  {
    icon: Salad,
    title: 'Dieta Calculada',
    description: 'TMB, macros e cardápio diário calculados com base no seu perfil. Substituições fáceis.',
  },
  {
    icon: Brain,
    title: 'Coach Motivacional',
    description: 'Acompanhamento psicológico, técnicas de hábito e suporte para manter a consistência.',
  },
  {
    icon: TrendingUp,
    title: 'Análise de Progresso',
    description: 'Gráficos de evolução, aderência, medidas e insights automáticos do seu avanço.',
  },
  {
    icon: MessageSquare,
    title: 'Chat com IA em Tempo Real',
    description: 'Tire dúvidas, peça ajustes e receba motivação 24/7 com streaming em tempo real.',
  },
  {
    icon: Shield,
    title: 'Memória Persistente',
    description: 'A IA lembra seu histórico, preferências e evolução para um contexto sempre personalizado.',
  },
];
