'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ClipboardCheck, Sparkles, Dumbbell, Utensils, Scale } from 'lucide-react';

interface WeeklyStats {
  plannedWorkouts: number;
  completedWorkouts: number;
  workoutAdherencePct: number | null;
  hasNutritionTarget: boolean;
  daysLogged: number;
  daysOnTarget: number;
  weightDeltaKg: number | null;
}

/**
 * Weekly check-in card. Shows the latest ANALYST-written summary plus this
 * week's adherence numbers, and lets the user regenerate on demand. The
 * backend also produces this automatically every Sunday evening and pushes it.
 */
export default function WeeklyCheckinCard() {
  const [summary, setSummary] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/checkin/latest').catch(() => ({ data: null })),
      api.get('/checkin/stats').catch(() => ({ data: null })),
    ]).then(([latestRes, statsRes]) => {
      if (latestRes.data?.summary) {
        setSummary(latestRes.data.summary);
        setCreatedAt(latestRes.data.createdAt);
      }
      if (statsRes.data) setStats(statsRes.data);
      setLoading(false);
    });
  }, []);

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      const { data } = await api.post('/checkin/run');
      if (data?.summary) {
        setSummary(data.summary);
        setCreatedAt(new Date().toISOString());
      }
      if (data?.stats) setStats(data.stats);
    } catch (e: any) {
      const status = e?.response?.status;
      setError(
        status === 429
          ? 'Você atingiu o limite de análises por hora. Tente mais tarde.'
          : 'Não foi possível gerar a análise agora. Tente novamente.',
      );
    } finally {
      setRunning(false);
    }
  }

  if (loading) return null;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900">Check-in semanal</h2>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white px-3 py-2 rounded-xl font-medium"
        >
          {running ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Analisando…
            </>
          ) : (
            <>
              <Sparkles size={15} /> Gerar agora
            </>
          )}
        </button>
      </div>

      {/* Adherence numbers */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <Dumbbell size={16} className="text-primary-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900">
              {stats.plannedWorkouts > 0
                ? `${stats.completedWorkouts}/${stats.plannedWorkouts}`
                : stats.completedWorkouts}
            </p>
            <p className="text-[11px] text-gray-400">Treinos (7d)</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <Utensils size={16} className="text-primary-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900">
              {stats.hasNutritionTarget ? `${stats.daysLogged}/7` : '—'}
            </p>
            <p className="text-[11px] text-gray-400">Dias de dieta</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <Scale size={16} className="text-primary-500 mx-auto mb-1" />
            <p
              className={`text-lg font-bold ${
                stats.weightDeltaKg == null
                  ? 'text-gray-900'
                  : stats.weightDeltaKg < 0
                    ? 'text-primary-600'
                    : stats.weightDeltaKg > 0
                      ? 'text-red-500'
                      : 'text-gray-900'
              }`}
            >
              {stats.weightDeltaKg == null
                ? '—'
                : `${stats.weightDeltaKg > 0 ? '+' : ''}${stats.weightDeltaKg}kg`}
            </p>
            <p className="text-[11px] text-gray-400">Peso (7d)</p>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {/* Summary text */}
      {summary ? (
        <div>
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{summary}</p>
          {createdAt && (
            <p className="text-[11px] text-gray-400 mt-3">
              Atualizado em {new Date(createdAt).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Toque em <span className="font-medium text-gray-700">Gerar agora</span> para receber
          uma análise da sua semana — ou receba automaticamente todo domingo à noite.
        </p>
      )}
    </div>
  );
}
