'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Dumbbell, RefreshCw, Clock, ChevronDown, ChevronUp, Play, CheckCircle, Star, Trash2 } from 'lucide-react';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function WorkoutsPage() {
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [loggingSessionId, setLoggingSessionId] = useState<string | null>(null);
  const [logForm, setLogForm] = useState<{ duration: string; rating: number; notes: string }>({ duration: '', rating: 0, notes: '' });
  // maps sessionId → logId (so we can delete)
  const [logSuccess, setLogSuccess] = useState<Record<string, string>>({});

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

  async function logWorkout(sessionId: string) {
    try {
      const { data } = await api.post('/workouts/log', {
        workoutSessionId: sessionId,
        durationMinutes: parseInt(logForm.duration) || undefined,
        rating: logForm.rating || undefined,
        notes: logForm.notes || undefined,
      });
      setLogSuccess((prev) => ({ ...prev, [sessionId]: data.id }));
      setLoggingSessionId(null);
      setLogForm({ duration: '', rating: 0, notes: '' });
    } catch {
      // silently fail — user can retry
    }
  }

  async function deleteLog(sessionId: string) {
    const logId = logSuccess[sessionId];
    if (!logId) return;
    try {
      await api.delete(`/workouts/log/${logId}`);
      setLogSuccess((prev) => {
        const updated = { ...prev };
        delete updated[sessionId];
        return updated;
      });
    } catch {
      // silently fail
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
                    {/* Log workout trigger button */}
                    <div className="mb-4">
                      {logSuccess[session.id] ? (
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1.5 text-sm text-green-700 font-medium">
                            <CheckCircle size={16} className="text-green-600" /> Treino registrado!
                          </span>
                          <button
                            onClick={() => deleteLog(session.id)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                            title="Excluir registro"
                          >
                            <Trash2 size={13} /> Excluir
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setLoggingSessionId(loggingSessionId === session.id ? null : session.id);
                            setLogForm({ duration: '', rating: 0, notes: '' });
                          }}
                          className="inline-flex items-center gap-1.5 text-sm bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <CheckCircle size={14} /> Registrar treino
                        </button>
                      )}
                    </div>

                    {/* Log form */}
                    {loggingSessionId === session.id && (
                      <div className="mt-2 mb-4 p-4 bg-green-50 rounded-xl border border-green-200 space-y-3">
                        <p className="text-sm font-semibold text-green-800">Registrar conclusão</p>
                        <div>
                          <label className="text-xs text-green-700 font-medium block mb-1">Duração (minutos)</label>
                          <input
                            type="number"
                            value={logForm.duration}
                            onChange={(e) => setLogForm((f) => ({ ...f, duration: e.target.value }))}
                            placeholder="Ex: 60"
                            className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-green-700 font-medium block mb-1">Avaliação</label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => setLogForm((f) => ({ ...f, rating: star }))}
                                className="text-yellow-400 hover:scale-110 transition-transform"
                              >
                                <Star size={20} fill={logForm.rating >= star ? 'currentColor' : 'none'} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-green-700 font-medium block mb-1">Observações</label>
                          <textarea
                            value={logForm.notes}
                            onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))}
                            placeholder="Como foi o treino?"
                            rows={2}
                            className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setLoggingSessionId(null)}
                            className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => logWorkout(session.id)}
                            className="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            Confirmar treino
                          </button>
                        </div>
                      </div>
                    )}

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
