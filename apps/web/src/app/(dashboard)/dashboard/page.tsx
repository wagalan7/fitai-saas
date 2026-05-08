'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Dumbbell, Salad, TrendingUp, Target, Flame, Activity, Camera, Zap, ChevronRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import ProgressChart from '@/components/dashboard/ProgressChart';

interface DashboardData {
  profile: any;
  weeklyWorkoutCount: number;
  adherencePct: number;
  weeklyWorkouts: any[];
  recentWorkouts: any[];
  progressLogs: any[];
  todayNutrition: { calories: number; target: number; meals: any[] };
  calsBurnedToday: number;
  recentChatSessions: any[];
}

const AGENT_LABELS: Record<string, { label: string; color: string }> = {
  TRAINER: { label: 'Personal Trainer', color: 'bg-blue-100 text-blue-700' },
  NUTRITIONIST: { label: 'Nutricionista', color: 'bg-gray-200 text-gray-800' },
  COACH: { label: 'Coach', color: 'bg-purple-100 text-purple-700' },
  ANALYST: { label: 'Analista', color: 'bg-orange-100 text-orange-700' },
  EVALUATOR: { label: 'Dr. Shape', color: 'bg-pink-100 text-pink-700' },
};

const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

  // Build "this week" session list: plan sessions + which ones have logs
  const planSessions: any[] = data?.weeklyWorkouts ?? [];
  // Map of workoutSessionId → log for quick lookup
  const logsBySessionId = Object.fromEntries(
    planSessions.map((w: any) => [w.workoutSessionId ?? w.id, w])
  );

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
          href="/workouts"
        />
        <StatCard
          icon={<Target size={20} className="text-primary-500" />}
          label="Aderência"
          value={`${data?.adherencePct || 0}%`}
          sub="dos treinos concluídos"
          color="bg-primary-50"
        />
        <StatCard
          icon={<Zap size={20} className="text-orange-500" />}
          label="Cal. queimadas hoje"
          value={`${data?.calsBurnedToday || 0}`}
          sub="kcal estimadas"
          color="bg-orange-50"
        />
        <StatCard
          icon={<TrendingUp size={20} className="text-purple-500" />}
          label="Peso atual"
          value={data?.profile?.weightKg ? `${data.profile.weightKg}kg` : '—'}
          sub="último registro"
          color="bg-purple-50"
          href="/progress"
        />
      </div>

      {/* This week's workouts */}
      {data && data.weeklyWorkouts.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Treinos desta semana</h2>
            <Link href="/workouts" className="flex items-center gap-1 text-sm text-primary-600 hover:underline font-medium">
              Ver plano <ChevronRight size={14} />
            </Link>
          </div>
          <div className="space-y-2">
            {data.weeklyWorkouts.map((w: any) => (
              <div key={w.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{w.workoutSession?.name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(w.completedAt).toLocaleDateString('pt-BR')}
                    {w.durationMinutes ? ` · ${w.durationMinutes}min` : ''}
                    {w.workoutSession?.muscleGroups?.length > 0 ? ` · ${w.workoutSession.muscleGroups.slice(0,2).join(', ')}` : ''}
                  </p>
                </div>
                {w.rating > 0 && (
                  <span className="text-yellow-500 text-xs flex-shrink-0">{'★'.repeat(w.rating)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress chart */}
      {data && data.progressLogs.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Evolução do Peso</h2>
            <Link href="/progress" className="flex items-center gap-1 text-sm text-primary-600 hover:underline font-medium">
              Ver tudo <ChevronRight size={14} />
            </Link>
          </div>
          <ProgressChart data={data.progressLogs} />
        </div>
      )}

      {/* Nutrition today */}
      {data && data.todayNutrition.calories > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Nutrição hoje</h2>
            <Link href="/nutrition" className="flex items-center gap-1 text-sm text-primary-600 hover:underline font-medium">
              Ver plano <ChevronRight size={14} />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{data.todayNutrition.calories} kcal consumidas</span>
                <span>meta: {data.todayNutrition.target} kcal</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-400 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.round((data.todayNutrition.calories / data.todayNutrition.target) * 100))}%` }}
                />
              </div>
            </div>
            <Flame size={20} className="text-orange-400 flex-shrink-0" />
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickAction href="/chat?agent=TRAINER" icon={<Dumbbell size={24} className="text-blue-500" />} title="Personal Trainer" desc="Treinos e técnica" bg="bg-blue-50 hover:bg-blue-100" />
        <QuickAction href="/chat?agent=NUTRITIONIST" icon={<Salad size={24} className="text-primary-500" />} title="Nutricionista" desc="Dieta e macros" bg="bg-primary-50 hover:bg-primary-100" />
        <QuickAction href="/chat?agent=COACH" icon={<TrendingUp size={24} className="text-purple-500" />} title="Coach" desc="Motivação" bg="bg-purple-50 hover:bg-purple-100" />
        <QuickAction href="/chat?agent=EVALUATOR" icon={<Camera size={24} className="text-pink-500" />} title="Dr. Shape" desc="Avaliação corporal" bg="bg-pink-50 hover:bg-pink-100" />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color, href }: any) {
  const content = (
    <div className="card p-5 h-full">
      <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs font-medium text-gray-600 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90 transition-opacity">{content}</Link> : content;
}

function QuickAction({ href, icon, title, desc, bg }: any) {
  return (
    <Link href={href} className={`card p-4 flex items-center gap-3 transition-colors ${bg}`}>
      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{title}</p>
        <p className="text-xs text-gray-500 truncate">{desc}</p>
      </div>
    </Link>
  );
}
