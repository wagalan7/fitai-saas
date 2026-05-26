'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Dumbbell, RefreshCw, Clock, ChevronDown, ChevronUp, Play, CheckCircle, Star, Trash2 } from 'lucide-react';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getDayLabel(session: any): string {
  const n = (session.name || '').toLowerCase();
  if (n.includes('segunda')) return 'Seg';
  if (n.includes('ter')) return 'Ter';
  if (n.includes('quarta')) return 'Qua';
  if (n.includes('quinta')) return 'Qui';
  if (n.includes('sexta')) return 'Sex';
  if (n.includes('sáb') || n.includes('sab')) return 'Sáb';
  if (n.includes('dom')) return 'Dom';
  return DAYS[session.dayOfWeek % 7] ?? '?';
}

export default function WorkoutsPage() {
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [loggingSessionId, setLoggingSessionId] = useState<string | null>(null);
  const [logForm, setLogForm] = useState<{ duration: string; rating: number; notes: string }>({ duration: '', rating: 0, notes: '' });
  const [exerciseLogs, setExerciseLogs] = useState<Array<{ exerciseName: string; sets: Array<{ reps: string; weightKg: string }> }>>([]);
  // maps sessionId → logId (so we can delete)
  const [logSuccess, setLogSuccess] = useState<Record<string, string>>({});
  const [isOffline, setIsOffline] = useState(false);

  const PLAN_CACHE_KEY = 'fitai-workout-plan-cache';

  function savePlanToCache(plan: any) {
    try { localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify({ plan, ts: Date.now() })); } catch {}
  }

  function loadPlanFromCache(): any | null {
    try {
      const raw = localStorage.getItem(PLAN_CACHE_KEY);
      if (!raw) return null;
      const { plan, ts } = JSON.parse(raw);
      // Cache válido por 7 dias
      if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return null;
      return plan;
    } catch { return null; }
  }

  useEffect(() => {
    loadPlan();
  }, []);

  async function loadPlan() {
    setLoading(true);
    try {
      const [planRes, logsRes] = await Promise.all([
        api.get('/workouts/plan'),
        api.get('/workouts/today-logs'),
      ]);
      const fetchedPlan = planRes.data;
      setPlan(fetchedPlan);
      if (fetchedPlan) savePlanToCache(fetchedPlan);  // salva no cache
      if (logsRes.data && typeof logsRes.data === 'object') {
        setLogSuccess(logsRes.data);
      }
    } catch {
      // Tenta carregar do cache quando offline
      const cached = loadPlanFromCache();
      if (cached) {
        setPlan(cached);
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }

  function openLogForm(session: any) {
    setLoggingSessionId(loggingSessionId === session.id ? null : session.id);
    setLogForm({ duration: '', rating: 0, notes: '' });
    // Pre-fill exercise logs from session plan
    setExerciseLogs(
      (session.exercises || []).map((ex: any) => ({
        exerciseName: ex.name,
        sets: Array.from({ length: Number(ex.sets) || 3 }, () => ({
          reps: String(ex.reps).split('-')[0], // use lower bound as default
          weightKg: '',
        })),
      }))
    );
  }

  function updateSet(exIdx: number, setIdx: number, field: 'reps' | 'weightKg', value: string) {
    setExerciseLogs((prev) => {
      const updated = prev.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, [field]: value } : s)) }
          : ex
      );
      return updated;
    });
  }

  async function logWorkout(sessionId: string) {
    try {
      const payload = {
        workoutSessionId: sessionId,
        durationMinutes: parseInt(logForm.duration) || undefined,
        rating: logForm.rating || undefined,
        notes: logForm.notes || undefined,
        exerciseLogs: exerciseLogs
          .filter((el) => el.sets.some((s) => s.reps || s.weightKg))
          .map((el) => ({
            exerciseName: el.exerciseName,
            sets: el.sets
              .filter((s) => s.reps || s.weightKg)
              .map((s) => ({
                reps: s.reps ? parseInt(s.reps) : undefined,
                weightKg: s.weightKg ? parseFloat(s.weightKg) : undefined,
              })),
          })),
      };
      const { data } = await api.post('/workouts/log', payload);
      setLogSuccess((prev) => ({ ...prev, [sessionId]: data.id }));
      setLoggingSessionId(null);
      setLogForm({ duration: '', rating: 0, notes: '' });
      setExerciseLogs([]);
      toast.success('Treino registrado com sucesso!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao registrar treino. Tente novamente.');
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
      toast.success('Registro excluído.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao excluir registro.');
    }
  }

  async function generatePlan() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const { data } = await api.post('/workouts/generate');
      setPlan(data);
      savePlanToCache(data);  // salva no cache
      setIsOffline(false);    // limpa modo offline
      toast.success('Plano de treino gerado com sucesso!');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Erro ao gerar plano. Tente novamente.';
      setGenerateError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-40 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-56 bg-gray-100 rounded" />
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded-xl" />
        </div>
        {[0,1,2].map(i => (
          <div key={i} className="card p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-48 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        ))}
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

      {isOffline && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <span>📡</span>
          <span>Você está offline — exibindo plano salvo anteriormente. Conecte-se para atualizar.</span>
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
            {[...(plan.sessions || [])].sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek).map((session: any) => (
              <div key={session.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-600 font-bold text-sm">{getDayLabel(session)}</span>
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
                          onClick={() => openLogForm(session)}
                          className="inline-flex items-center gap-1.5 text-sm bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <CheckCircle size={14} /> Registrar treino
                        </button>
                      )}
                    </div>

                    {/* Log form */}
                    {loggingSessionId === session.id && (
                      <div className="mt-2 mb-4 p-4 bg-green-50 rounded-xl border border-green-200 space-y-4">
                        <p className="text-sm font-semibold text-green-800">Registrar treino</p>

                        {/* General info */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-green-700 font-medium block mb-1">Duração (min)</label>
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
                            <div className="flex gap-1 pt-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button key={star} onClick={() => setLogForm((f) => ({ ...f, rating: star }))} className="text-yellow-400 hover:scale-110 transition-transform">
                                  <Star size={18} fill={logForm.rating >= star ? 'currentColor' : 'none'} />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Per-exercise tracking */}
                        {exerciseLogs.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-xs text-green-700 font-medium">Cargas utilizadas (opcional)</p>
                            {exerciseLogs.map((el, exIdx) => (
                              <div key={exIdx} className="bg-white rounded-lg border border-green-100 p-3">
                                <p className="text-xs font-semibold text-gray-700 mb-2 truncate">{el.exerciseName}</p>
                                <div className="space-y-1.5">
                                  {el.sets.map((s, setIdx) => (
                                    <div key={setIdx} className="flex items-center gap-2">
                                      <span className="text-xs text-gray-400 w-12 flex-shrink-0">Série {setIdx + 1}</span>
                                      <input
                                        type="number"
                                        value={s.reps}
                                        onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                                        placeholder="Reps"
                                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-400"
                                      />
                                      <span className="text-xs text-gray-300">×</span>
                                      <input
                                        type="number"
                                        step="0.5"
                                        value={s.weightKg}
                                        onChange={(e) => updateSet(exIdx, setIdx, 'weightKg', e.target.value)}
                                        placeholder="kg"
                                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-400"
                                      />
                                      <span className="text-xs text-gray-400">kg</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

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
