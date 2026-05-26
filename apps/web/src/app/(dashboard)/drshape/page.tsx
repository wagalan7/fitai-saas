'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Camera, Plus, ChevronDown, ChevronUp, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function DrShapePage() {
  const router = useRouter();
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  async function regeneratePlans() {
    if (regenerating) return;
    const ok = window.confirm(
      'Isso irá substituir seu plano de treino e dieta atuais por novos planos baseados na avaliação mais recente. Continuar?'
    );
    if (!ok) return;
    setRegenerating(true);
    try {
      const [workout, nutrition] = await Promise.allSettled([
        api.post('/workouts/generate', {}, { timeout: 90000 }),
        api.post('/nutrition/generate', {}, { timeout: 90000 }),
      ]);
      if (workout.status === 'fulfilled' && nutrition.status === 'fulfilled') {
        toast.success('Novo plano de treino e dieta criados!');
      } else if (workout.status === 'fulfilled') {
        toast.info('Treino atualizado. A dieta falhou — tente de novo em alguns minutos.');
      } else if (nutrition.status === 'fulfilled') {
        toast.info('Dieta atualizada. O treino falhou — tente de novo em alguns minutos.');
      } else {
        toast.error('Não foi possível gerar os planos. Tente de novo em alguns minutos.');
      }
      router.push('/dashboard');
    } finally {
      setRegenerating(false);
    }
  }

  useEffect(() => {
    api.get('/chat/evaluations')
      .then(r => {
        setEvaluations(r.data);
        if (r.data.length > 0) setExpanded(r.data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dr. Shape</h1>
          <p className="text-gray-500 text-sm">Avaliação corporal por IA com análise de foto</p>
        </div>
        <Link
          href="/chat?agent=EVALUATOR"
          className="flex items-center gap-2 bg-pink-500 hover:bg-pink-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors text-sm"
        >
          <Plus size={16} /> Nova avaliação
        </Link>
      </div>

      {/* How it works */}
      <div className="card p-5 bg-gradient-to-r from-pink-50 to-purple-50 border-pink-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Camera size={22} className="text-pink-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Como funciona</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Envie uma foto do seu corpo (frente, costas ou lateral) no chat com o Dr. Shape.
              A IA analisa sua composição corporal, identifica pontos de melhoria e gera recomendações
              personalizadas para treino e dieta.
            </p>
            <Link
              href="/chat?agent=EVALUATOR"
              className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-pink-600 hover:underline"
            >
              Fazer avaliação agora <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Regenerate plans CTA — only shown if there's at least one evaluation */}
      {evaluations.length > 0 && (
        <div className="card p-5 border-2 border-primary-200 bg-primary-50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles size={22} className="text-primary-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">Atualizar treino e dieta</h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-3">
                Use sua avaliação mais recente para gerar um novo plano de treino e dieta personalizados ao seu estado atual.
              </p>
              <button
                onClick={regeneratePlans}
                disabled={regenerating}
                className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl font-medium transition-colors text-sm"
              >
                {regenerating ? <><Loader2 size={16} className="animate-spin" /> Gerando…</> : <><Sparkles size={16} /> Regenerar planos com base na avaliação</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Past evaluations */}
      {evaluations.length === 0 ? (
        <div className="card p-12 text-center">
          <Camera size={48} className="text-gray-200 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-500 mb-2">Nenhuma avaliação ainda</h2>
          <p className="text-gray-400 text-sm mb-6">
            Envie uma foto no chat com o Dr. Shape para receber sua primeira análise corporal.
          </p>
          <Link
            href="/chat?agent=EVALUATOR"
            className="inline-flex items-center gap-2 bg-pink-500 hover:bg-pink-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors text-sm"
          >
            <Camera size={16} /> Fazer primeira avaliação
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-700">Histórico de avaliações ({evaluations.length})</h2>
          {evaluations.map((ev, idx) => (
            <div key={ev.id} className="card overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Camera size={18} className="text-pink-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">
                    Avaliação #{evaluations.length - idx}
                    {idx === 0 && <span className="ml-2 text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">Mais recente</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(ev.analysisDate || ev.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'long', year: 'numeric',
                    })}
                  </p>
                </div>
                {expanded === ev.id ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
              </button>

              {expanded === ev.id && ev.lastAnalysis && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {ev.lastAnalysis}
                  </div>
                  <Link
                    href={`/chat?agent=EVALUATOR`}
                    className="inline-flex items-center gap-1.5 mt-4 text-xs text-pink-600 hover:underline font-medium"
                  >
                    Ver conversa completa <ArrowRight size={12} />
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
