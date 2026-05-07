'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Dumbbell, Salad, TrendingUp, Target, Flame, Activity, Camera } from 'lucide-react';
import Link from 'next/link';
import ProgressChart from '@/components/dashboard/ProgressChart';

interface DashboardData {
  profile: any;
  weeklyWorkoutCount: number;
  adherencePct: number;
  recentWorkouts: any[];
  progressLogs: any[];
  todayNutrition: { calories: number; target: number; meals: any[] };
  recentChatSessions: any[];
}

const AGENT_LABELS: Record<string, { label: string; color: string }> = {
  TRAINER: { label: 'Personal Trainer', color: 'bg-blue-100 text-blue-700' },
  NUTRITIONIST: { label: 'Nutricionista', color: 'bg-gray-200 text-gray-800' },
  COACH: { label: 'Coach', color: 'bg-purple-100 text-purple-700' },
  ANALYST: { label: 'Analista', color: 'bg-orange-100 text-orange-700' },
  EVALUATOR: { label: 'Dr. Shape', color: 'bg-pink-100 text-pink-700' },
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then((r) => {
      setData(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const caloriesPct = data
    ? Math.min(100, Math.round((data.todayNutrition.calories / data.todayNutrition.target) * 100))
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Olá, {user?.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-gray-500">Veja como você está indo hoje</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity size={20} className="text-blue-500" />}
          label="Treinos esta semana"
          value={`${data?.weeklyWorkoutCount || 0}`}
          sub={`/${data?.profile?.workoutsPerWeek || 3} planejados`}
          color="bg-blue-50"
        />
        <StatCard
          icon={<Target size={20} className="text-primary-500" />}
          label="Aderência"
          value={`${data?.adherencePct || 0}%`}
          sub="dos treinos concluídos"
          color="bg-primary-50"
        />
        <StatCard
          icon={<Flame size={20} className="text-orange-500" />}
          label="Calorias hoje"
          value={`${data?.todayNutrition.calories || 0}`}
          sub={`/ ${data?.todayNutrition.target || 2000} kcal`}
          color="bg-orange-50"
        />
        <StatCard
          icon={<TrendingUp size={20} className="text-purple-500" />}
          label="Peso atual"
          value={data?.profile?.weightKg ? `${data.profile.weightKg}kg` : '—'}
          sub="último registro"
          color="bg-purple-50"
        />
      </div>

      {/* Progress chart */}
      {data && data.progressLogs.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Evolução do Peso</h2>
          <ProgressChart data={data.progressLogs} />
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickAction
          href="/chat?agent=TRAINER"
          icon={<Dumbbell size={24} className="text-blue-500" />}
          title="Falar com Personal"
          desc="Ajuste treinos, tire dúvidas"
          bg="bg-blue-50 hover:bg-blue-100"
        />
        <QuickAction
          href="/chat?agent=NUTRITIONIST"
          icon={<Salad size={24} className="text-primary-500" />}
          title="Falar com Nutricionista"
          desc="Dieta, substituições, dúvidas"
          bg="bg-primary-50 hover:bg-primary-100"
        />
        <QuickAction
          href="/chat?agent=COACH"
          icon={<TrendingUp size={24} className="text-purple-500" />}
          title="Falar com Coach"
          desc="Motivação e consistência"
          bg="bg-purple-50 hover:bg-purple-100"
        />
        <QuickAction
          href="/chat?agent=EVALUATOR"
          icon={<Camera size={24} className="text-pink-500" />}
          title="Dr. Shape"
          desc="Avaliação corporal com foto"
          bg="bg-pink-50 hover:bg-pink-100"
        />
      </div>

      {/* Recent workouts */}
      {data && data.recentWorkouts.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Treinos Recentes</h2>
            <Link href="/workouts" className="text-primary-600 text-sm font-medium hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="space-y-3">
            {data.recentWorkouts.map((w: any) => (
              <div key={w.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Dumbbell size={16} className="text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-sm text-gray-900">{w.workoutSession?.name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(w.completedAt).toLocaleDateString('pt-BR')}
                    {w.durationMinutes && ` · ${w.durationMinutes}min`}
                  </p>
                </div>
                {w.rating && (
                  <div className="ml-auto text-yellow-500 text-sm">{'★'.repeat(w.rating)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: any) {
  return (
    <div className="card p-5">
      <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs font-medium text-gray-600 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function QuickAction({ href, icon, title, desc, bg }: any) {
  return (
    <Link href={href} className={`card p-5 flex items-center gap-4 transition-colors ${bg}`}>
      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
    </Link>
  );
}
