'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Dumbbell, RefreshCw, Clock, ChevronDown, ChevronUp, Play } from 'lucide-react';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function WorkoutsPage() {
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  useEffect(() => {
    loadPlan();
  }, []);

  async function loadPlan() {
    setLoading(true);
    try {
      const { data } = await api.get('/workouts/plan');
      setPlan(data);
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const { data } = await api.post('/workouts/generate');
      setPlan(data);
    } catch (err: any) {
      setGenerateError(err?.response?.data?.message || 'Erro ao gerar plano. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Treinos</h1>
          <p className="text-gray-500">Plano gerado por IA personalizado para você</p>
        </div>
        <button
          onClick={generatePlan}
          disabled={generating}
          className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
        >
          <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
          {generating ? 'Gerando...' : plan ? 'Regenerar' : 'Gerar Treino'}
        </button>
      </div>

      {generateError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {generateError}
        </div>
      )}

      {!plan && !generating && (
        <div className="card p-12 text-center">
          <Dumbbell size={48} className="text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-600 mb-2">Nenhum plano ainda</h2>
          <p className="text-gray-400 mb-6">Gere seu plano personalizado com IA</p>
          <button
            onClick={generatePlan}
            className="bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-xl font-medium"
          >
            Gerar meu plano agora
          </button>
        </div>
      )}

      {generating && (
        <div className="card p-12 text-center">
          <div className="animate-spin w-12 h-12 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Gerando seu plano personalizado...</p>
          <p className="text-gray-400 text-sm mt-1">Isso pode levar alguns segundos</p>
        </div>
      )}

      {plan && !generating && (
        <>
          <div className="card p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h2>
            {plan.description && <p className="text-gray-500 text-sm">{plan.description}</p>}
            <p className="text-xs text-gray-400 mt-2">
              Criado em {new Date(plan.createdAt).toLocaleDateString('pt-BR')} · {plan.sessions?.length} sessões
            </p>
          </div>

          <div className="space-y-3">
            {plan.sessions?.map((session: any) => (
              <div key={session.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-600 font-bold text-sm">{DAYS[session.dayOfWeek]}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{session.name}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {session.estimatedTime}min
                      </span>
                      <span>{session.muscleGroups?.join(', ')}</span>
                    </div>
                  </div>
                  <span className="text-gray-400">
                    {expandedSession === session.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </button>

                {expandedSession === session.id && (
                  <div className="border-t border-gray-100 p-5">
                    <div className="space-y-3">
                      {session.exercises?.map((ex: any) => (
                        <div
                          key={ex.id}
                          className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl"
                        >
                          <span className="w-7 h-7 bg-primary-500 text-white rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {ex.order}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900">{ex.name}</p>
                              <a
                                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' como fazer execução')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full transition-colors"
                                title={`Ver como fazer: ${ex.name}`}
                              >
                                <Play size={9} fill="currentColor" />
                                Ver como fazer
                              </a>
                            </div>
                            <div className="flex gap-2 mt-1.5 flex-wrap">
                              <span className="text-xs bg-white border border-gray-200 px-2.5 py-1 rounded-full">
                                {ex.sets} séries
                              </span>
                              <span className="text-xs bg-white border border-gray-200 px-2.5 py-1 rounded-full">
                                {ex.reps} reps
                              </span>
                              <span className="text-xs bg-white border border-gray-200 px-2.5 py-1 rounded-full">
                                {ex.restSeconds}s descanso
                              </span>
                            </div>
                            {ex.notes && (
                              <p className="text-xs text-gray-500 mt-2 italic">{ex.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
