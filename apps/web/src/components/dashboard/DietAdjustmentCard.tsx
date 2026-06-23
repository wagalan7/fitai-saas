'use client';

import { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { swrConfig } from '@/lib/swr';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { TrendingUp, TrendingDown, CheckCircle2, Scale } from 'lucide-react';

type Status = 'on_track' | 'adjust_down' | 'adjust_up' | 'insufficient_data';

interface Adjustment {
  hasPlan: boolean;
  status?: Status;
  hasEnoughData?: boolean;
  currentCalories?: number;
  currentWeightKg?: number | null;
  weeklyChangeKg?: number | null;
  weeklyChangePct?: number | null;
  recommendDeltaKcal?: number;
  newCalories?: number | null;
  reason?: string;
}

/**
 * Diet auto-titration card. Reads /nutrition/diet-adjustment and, when the
 * weight trend has drifted from the goal band, offers a one-tap calorie
 * adjustment (drop/raise). Shows a positive confirmation when on track.
 */
export default function DietAdjustmentCard() {
  const { data } = useSWR<Adjustment>('/nutrition/diet-adjustment', swrConfig);
  const [applying, setApplying] = useState(false);

  if (!data || !data.hasPlan || !data.hasEnoughData) return null;

  const isAdjust = data.status === 'adjust_down' || data.status === 'adjust_up';
  const isUp = data.status === 'adjust_up';

  async function apply() {
    setApplying(true);
    try {
      await api.post('/nutrition/adjust', {});
      // Refresh plan (macro cards), today's target, and this recommendation.
      globalMutate('/nutrition/plan');
      globalMutate('/nutrition/today-adherence');
      globalMutate('/nutrition/diet-adjustment');
      toast.success('Dieta ajustada! Nova meta calórica aplicada.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao ajustar a dieta. Tente novamente.');
    } finally {
      setApplying(false);
    }
  }

  const trendLabel =
    data.weeklyChangeKg == null
      ? '—'
      : data.weeklyChangeKg === 0
        ? 'estável'
        : `${data.weeklyChangeKg > 0 ? '+' : ''}${data.weeklyChangeKg} kg/sem`;

  if (!isAdjust) {
    // on_track — positive confirmation.
    return (
      <div className="card p-5 border border-green-100 bg-green-50/40">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-gray-900 flex items-center gap-2">
              Dieta no rumo certo
              <span className="text-xs font-normal text-gray-500 inline-flex items-center gap-1">
                <Scale size={12} /> {trendLabel}
              </span>
            </p>
            <p className="text-sm text-gray-600 mt-0.5">{data.reason}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card p-5 border ${
        isUp ? 'border-blue-200 bg-blue-50/50' : 'border-amber-200 bg-amber-50/50'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1">
          {isUp ? (
            <TrendingUp size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          ) : (
            <TrendingDown size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
              {isUp ? 'Hora de adicionar calorias' : 'Hora de reduzir calorias'}
              <span className="text-xs font-normal text-gray-500 inline-flex items-center gap-1">
                <Scale size={12} /> {trendLabel}
              </span>
            </p>
            <p className="text-sm text-gray-600 mt-0.5">{data.reason}</p>
            {data.currentCalories != null && data.newCalories != null && (
              <p className="text-xs text-gray-500 mt-1">
                {data.currentCalories} kcal →{' '}
                <span className="font-semibold text-gray-800">{data.newCalories} kcal</span>
                <span className="text-gray-400">
                  {' '}
                  ({data.recommendDeltaKcal! > 0 ? '+' : ''}
                  {data.recommendDeltaKcal} kcal)
                </span>
              </p>
            )}
          </div>
        </div>
        <button
          onClick={apply}
          disabled={applying}
          className={`flex-shrink-0 inline-flex items-center justify-center gap-2 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            isUp ? 'bg-blue-500 hover:bg-blue-600' : 'bg-amber-500 hover:bg-amber-600'
          }`}
        >
          {applying
            ? 'Ajustando...'
            : `${data.recommendDeltaKcal! > 0 ? '+' : ''}${data.recommendDeltaKcal} kcal`}
        </button>
      </div>
    </div>
  );
}
