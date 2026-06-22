'use client';

import useSWR from 'swr';
import { swrConfig } from '@/lib/swr';

type Status = 'low' | 'on' | 'over';

interface Adherence {
  hasPlan: boolean;
  mealsLogged?: number;
  target?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  consumed?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  pct?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  status?: { calories: Status; proteinG: Status; carbsG: Status; fatG: Status };
}

const BAR: Record<Status, string> = {
  low: 'bg-amber-400',
  on: 'bg-green-500',
  over: 'bg-red-500',
};
const TEXT: Record<Status, string> = {
  low: 'text-amber-600',
  on: 'text-green-600',
  over: 'text-red-500',
};

/**
 * Daily macro traffic-light. Reads /nutrition/today-adherence and shows, for
 * each macro, consumed vs target with a colored progress bar:
 *  amber = still short, green = on target, red = over the ceiling.
 */
export default function DailyAdherenceCard() {
  const { data } = useSWR<Adherence>('/nutrition/today-adherence', swrConfig);

  if (!data || !data.hasPlan || !data.target) return null;

  const rows: Array<{ key: keyof NonNullable<Adherence['target']>; label: string; unit: string }> = [
    { key: 'calories', label: 'Calorias', unit: 'kcal' },
    { key: 'proteinG', label: 'Proteína', unit: 'g' },
    { key: 'carbsG', label: 'Carboidrato', unit: 'g' },
    { key: 'fatG', label: 'Gordura', unit: 'g' },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Hoje</h2>
        <span className="text-xs text-gray-400">
          {data.mealsLogged ?? 0} {(data.mealsLogged ?? 0) === 1 ? 'refeição registrada' : 'refeições registradas'}
        </span>
      </div>

      <div className="space-y-3">
        {rows.map(({ key, label, unit }) => {
          const consumed = data.consumed?.[key] ?? 0;
          const target = data.target?.[key] ?? 0;
          const pct = data.pct?.[key] ?? 0;
          const status = (data.status?.[key] ?? 'low') as Status;
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">{label}</span>
                <span className="text-gray-500">
                  <span className={`font-semibold ${TEXT[status]}`}>{consumed}</span>
                  <span className="text-gray-400"> / {target}{unit}</span>
                  <span className={`ml-2 ${TEXT[status]}`}>{pct}%</span>
                </span>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${BAR[status]}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-400 mt-3">
        Registre suas refeições abaixo para acompanhar a meta do dia.
      </p>
    </div>
  );
}
