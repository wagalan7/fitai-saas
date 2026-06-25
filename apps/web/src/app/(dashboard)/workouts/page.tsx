'use client';

import { useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { swrConfig } from '@/lib/swr';
import axios from 'axios';
import { api, apiDirectBase, getStoredToken } from '@/lib/api';
import { toast } from '@/lib/toast';
import { onPlanUpdated } from '@/lib/events';
import { Dumbbell, RefreshCw, Clock, ChevronDown, ChevronUp, Play, CheckCircle, Star, Trash2, Flame, TrendingUp } from 'lucide-react';

interface ProgressionSuggestion {
  hasHistory: boolean;
  kind: string;
  targetWeightKg?: number | null;
  targetReps?: number | null;
  targetDurationSecs?: number | null;
  cue: string;
  reason: string;
}

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

const PLAN_CACHE_KEY = 'fitai-workout-plan-cache';

function savePlanToCache(plan: any) {
  try { localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify({ plan, ts: Date.now() })); } catch {}
}

function loadPlanFromCache(): any | null {
  try {
    const raw = localStorage.getItem(PLAN_CACHE_KEY);
    if (!raw) return null;
    const { plan, ts } = JSON.parse(raw);
    // Cache válido por 7 dias para fallback offline.
    if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return null;
    return plan;
  } catch { return null; }
}

export default function WorkoutsPage() {
  // SWR replaces the manual useEffect/loadPlan flow:
  //   - First visit: shows skeleton until fetch completes.
  //   - Subsequent visits in the same session: shows cached plan instantly,
  //     revalidates in background → near-zero perceived latency.
  //   - `fallbackData` from localStorage means even cold reloads on flaky
  //     networks render the last-known plan immediately.
  const cachedFallback = typeof window !== 'undefined' ? loadPlanFromCache() : null;
  const {
    data: plan,
    error: planError,
    isLoading: planLoading,
    mutate: mutatePlan,
  } = useSWR<any>('/workouts/plan', {
    ...swrConfig,
    fallbackData: cachedFallback ?? undefined,
    onSuccess: (data) => { if (data) savePlanToCache(data); },
  });

  const { data: todayLogs } = useSWR<Record<string, string>>('/workouts/today-logs', swrConfig);
  const { data: readiness, mutate: mutateReadiness } = useSWR<any>('/workouts/readiness', swrConfig);
  const { data: progression } = useSWR<{ hasPlan: boolean; suggestions: Record<string, ProgressionSuggestion> }>(
    '/workouts/progression',
    swrConfig,
  );
  const suggestions = progression?.suggestions || {};

  const [generating, setGenerating] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [deloading, setDeloading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Free-form prefs threaded into the backend prompt at generation time.
  // The trainer prompt has a "PRIORIDADE MÁXIMA" rule for this block.
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [preferences, setPreferences] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [loggingSessionId, setLoggingSessionId] = useState<string | null>(null);
  const [logForm, setLogForm] = useState<{ duration: string; rating: number; notes: string }>({ duration: '', rating: 0, notes: '' });
  const [exerciseLogs, setExerciseLogs] = useState<Array<{ exerciseName: string; sets: Array<{ reps: string; weightKg: string }> }>>([]);
  // Optimistic overlay on top of SWR data: maps sessionId → logId.
  // We seed from SWR's today-logs and apply local mutations on top.
  const [logOverrides, setLogOverrides] = useState<Record<string, string | null>>({});
  const logSuccess: Record<string, string> = (() => {
    const merged: Record<string, string> = { ...(todayLogs || {}) };
    for (const [k, v] of Object.entries(logOverrides)) {
      if (v === null) delete merged[k]; else merged[k] = v;
    }
    return merged;
  })();
  // Offline = we have no SWR data AND the request errored, but localStorage had a plan.
  const isOffline = !!(planError && cachedFallback && !plan);
  const loading = planLoading && !plan;

  useEffect(() => {
    // Refetch when the chat auto-regen (post Dr Shape) emits a workout update.
    const off = onPlanUpdated('workout', () => {
      mutatePlan();
      mutate('/workouts/today-logs');
      toast.success('Plano de treino atualizado a partir da nova avaliação!');
    });
    return off;
  }, [mutatePlan]);

  function openLogForm(session: any) {
    setLoggingSessionId(loggingSessionId === session.id ? null : session.id);
    setLogForm({ duration: '', rating: 0, notes: '' });
    // Pre-fill exercise logs from the session plan. When we have a progressive-
    // overload target for the exercise, seed reps/weight with it so the user
    // opens the form already pointed at the next step (they can still edit).
    setExerciseLogs(
      (session.exercises || []).map((ex: any) => {
        const sug = suggestions[ex.name];
        const defaultReps =
          sug?.hasHistory && sug.targetReps != null
            ? String(sug.targetReps)
            : String(ex.reps).split('-')[0]; // fall back to the prescribed lower bound
        const defaultWeight =
          sug?.hasHistory && sug.targetWeightKg != null ? String(sug.targetWeightKg) : '';
        return {
          exerciseName: ex.name,
          sets: Array.from({ length: Number(ex.sets) || 3 }, () => ({
            reps: defaultReps,
            weightKg: defaultWeight,
          })),
        };
      })
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

    // Optimistic update: close form + mark as done immediately.
    // `logOverrides` overlays SWR data; sync to server happens below.
    const optimisticId = `optimistic-${Date.now()}`;
    setLogOverrides((prev) => ({ ...prev, [sessionId]: optimisticId }));
    setLoggingSessionId(null);
    setLogForm({ duration: '', rating: 0, notes: '' });
    setExerciseLogs([]);
    toast.success('Treino registrado!');

    try {
      const { data } = await api.post('/workouts/log', payload);
      setLogOverrides((prev) => ({ ...prev, [sessionId]: data.id }));
      // Revalidate today-logs so the next session navigation matches server truth.
      mutate('/workouts/today-logs');
      // New RPE/rating may shift the autoregulated-deload signal.
      mutate('/workouts/readiness');
      // Fresh loads recompute the next progressive-overload target.
      mutate('/workouts/progression');
    } catch (err: any) {
      // Revert optimistic state.
      setLogOverrides((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      setLoggingSessionId(sessionId);
      toast.error(err?.response?.data?.message || 'Erro ao registrar treino. Tente novamente.');
    }
  }

  async function deleteLog(sessionId: string) {
    const logId = logSuccess[sessionId];
    if (!logId) return;
    if (logId.startsWith('optimistic-')) return;

    // Optimistic remove (null sentinel hides it on top of SWR data).
    setLogOverrides((prev) => ({ ...prev, [sessionId]: null }));
    toast.success('Registro excluído.');

    try {
      await api.delete(`/workouts/log/${logId}`);
      mutate('/workouts/today-logs');
    } catch (err: any) {
      setLogOverrides((prev) => ({ ...prev, [sessionId]: logId }));
      toast.error(err?.response?.data?.message || 'Erro ao excluir registro.');
    }
  }

  async function generatePlan() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const body = preferences.trim() ? { preferences: preferences.trim() } : {};
      // Bypass the Next.js /api rewrite for this one endpoint: Next's
      // internal proxy uses undici with a fixed timeout and drops the
      // socket with "hang up" around 30s, while 2-pass generation can
      // take 30-60s. Hitting the API host directly skips that proxy
      // entirely. CORS on the API is configured to allow this origin.
      const token = getStoredToken();
      const { data } = await axios.post(`${apiDirectBase}/workouts/generate`, body, {
        timeout: 180_000,
        withCredentials: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // Push the freshly-generated plan into SWR cache so the UI updates
      // without an extra network round-trip.
      mutatePlan(data, { revalidate: false });
      savePlanToCache(data);
      toast.success('Plano de treino gerado com sucesso!');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Erro ao gerar plano. Tente novamente.';
      setGenerateError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  // Advances the active plan to the next week of its mesocycle (deload at the
  // end of the block). Same long-running cost as generate, so it bypasses the
  // Next.js proxy via the direct API host just like generatePlan does.
  async function advanceWeek() {
    setAdvancing(true);
    setGenerateError(null);
    try {
      const token = getStoredToken();
      const { data } = await axios.post(`${apiDirectBase}/workouts/advance-week`, {}, {
        timeout: 180_000,
        withCredentials: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      mutatePlan(data, { revalidate: false });
      savePlanToCache(data);
      const phase = data?.periodization?.phase;
      toast.success(phase ? `Semana avançada — fase de ${phase}!` : 'Semana avançada!');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Erro ao avançar a semana. Tente novamente.';
      setGenerateError(msg);
      toast.error(msg);
    } finally {
      setAdvancing(false);
    }
  }

  // Applies an autoregulated deload now — regenerates at the deload week.
  // Long-running like generate, so it bypasses the Next.js proxy.
  async function applyDeload() {
    setDeloading(true);
    setGenerateError(null);
    try {
      const token = getStoredToken();
      const { data } = await axios.post(`${apiDirectBase}/workouts/deload`, {}, {
        timeout: 180_000,
        withCredentials: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      mutatePlan(data, { revalidate: false });
      savePlanToCache(data);
      mutateReadiness();
      toast.success('Deload aplicado — semana de recuperação gerada!');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Erro ao aplicar deload. Tente novamente.';
      setGenerateError(msg);
      toast.error(msg);
    } finally {
      setDeloading(false);
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

      {/* Preferences for generation — collapsed by default so it doesn't
          add noise for users who just want the default plan. Open it to
          push concrete instructions ("peito 5 + tríceps 3", "treino curto") */}
      <div className="card p-4">
        <button
          type="button"
          onClick={() => setPrefsOpen((v) => !v)}
          className="w-full flex items-center justify-between text-sm font-medium text-gray-700"
        >
          <span className="flex items-center gap-2">
            ⚙️ Preferências para gerar (opcional)
            {preferences.trim() && (
              <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                {preferences.trim().length} chars
              </span>
            )}
          </span>
          {prefsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {prefsOpen && (
          <div className="mt-3">
            <textarea
              value={preferences}
              onChange={(e) => setPreferences(e.target.value.slice(0, 600))}
              placeholder='Ex: "treino longo, peito com 5 exercícios e tríceps com 3" ou "foco em panturrilha, evitar agachamento livre"'
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[88px] resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">
              Esse texto vai pro Trainer com prioridade máxima. Pode pedir contagens
              exatas por grupo, exercícios a evitar, duração-alvo, etc.
            </p>
          </div>
        )}
      </div>

      {generateError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {generateError}
        </div>
      )}

      {/* Autoregulated-deload banner — only when fatigue signals warrant it. */}
      {plan && readiness && (readiness.status === 'deload' || readiness.status === 'caution') && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border flex flex-col sm:flex-row sm:items-center gap-3 ${
            readiness.status === 'deload'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex-1">
            <p className="font-semibold flex items-center gap-1.5">
              {readiness.status === 'deload' ? '🔴 Deload recomendado' : '🟡 Atenção à fadiga'}
              {readiness.avgRpe != null && (
                <span className="text-xs font-normal opacity-70">RPE médio {readiness.avgRpe}</span>
              )}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{readiness.reason}</p>
          </div>
          {readiness.recommendDeload && (
            <button
              onClick={applyDeload}
              disabled={deloading || generating || advancing}
              className="flex-shrink-0 inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              <RefreshCw size={14} className={deloading ? 'animate-spin' : ''} />
              {deloading ? 'Aplicando...' : 'Aplicar deload agora'}
            </button>
          )}
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
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h2>
                {plan.description && <p className="text-gray-500 text-sm">{plan.description}</p>}
              </div>
              {plan.periodization && (
                <span
                  className={`flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    plan.periodization.isDeload
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-primary-50 text-primary-700 border border-primary-200'
                  }`}
                  title={`RPE alvo ${plan.periodization.rpeTarget}`}
                >
                  Semana {plan.periodization.currentWeek}/{plan.periodization.cycleWeeks} · {plan.periodization.phase}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Criado em {new Date(plan.createdAt).toLocaleDateString('pt-BR')} · {plan.sessions?.length} sessões
            </p>
            {plan.periodization && (
              <button
                onClick={advanceWeek}
                disabled={advancing || generating}
                className="mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                title="Gera a próxima semana do ciclo, ajustando volume e intensidade (deload no fim do bloco)"
              >
                <RefreshCw size={14} className={advancing ? 'animate-spin' : ''} />
                {advancing
                  ? 'Avançando...'
                  : plan.periodization.currentWeek >= plan.periodization.cycleWeeks
                    ? 'Iniciar novo ciclo'
                    : 'Avançar para próxima semana'}
              </button>
            )}
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

                    {/* Aquecimento & mobilidade — computado por grupo muscular */}
                    {session.warmup && (session.warmup.specific?.length > 0 || session.warmup.general?.length > 0) && (
                      <div className="mb-4 p-4 bg-orange-50 border border-orange-100 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <Flame size={16} className="text-orange-500" />
                          <p className="text-sm font-semibold text-orange-800">
                            Aquecimento & mobilidade
                          </p>
                          <span className="text-xs text-orange-600">~{session.warmup.durationMinutes} min</span>
                        </div>
                        {session.warmup.general?.length > 0 && (
                          <div className="mb-2">
                            <p className="text-[11px] uppercase tracking-wide text-orange-400 font-semibold mb-1">Geral</p>
                            <ul className="space-y-0.5">
                              {session.warmup.general.map((d: any, i: number) => (
                                <li key={`g${i}`} className="text-xs text-gray-700 flex justify-between gap-3">
                                  <span>{d.name}</span>
                                  <span className="text-gray-400 flex-shrink-0">{d.prescription}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {session.warmup.specific?.length > 0 && (
                          <div className="mb-2">
                            <p className="text-[11px] uppercase tracking-wide text-orange-400 font-semibold mb-1">Específico</p>
                            <ul className="space-y-0.5">
                              {session.warmup.specific.map((d: any, i: number) => (
                                <li key={`s${i}`} className="text-xs text-gray-700 flex justify-between gap-3">
                                  <span>{d.name}</span>
                                  <span className="text-gray-400 flex-shrink-0">{d.prescription}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {session.warmup.rampNote && (
                          <p className="text-[11px] text-orange-700/80 mt-1 italic">{session.warmup.rampNote}</p>
                        )}
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
                                href={ex.videoUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' como fazer execução')}`}
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
                            {/* Sobrecarga progressiva: meta de hoje a partir do último registro */}
                            {suggestions[ex.name]?.hasHistory && (
                              <div
                                className="inline-flex items-center gap-1.5 mt-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg"
                                title={suggestions[ex.name].reason}
                              >
                                <TrendingUp size={12} className="flex-shrink-0" />
                                <span className="font-medium">{suggestions[ex.name].cue}</span>
                              </div>
                            )}
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
