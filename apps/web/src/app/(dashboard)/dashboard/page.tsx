'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Dumbbell, Salad, TrendingUp, Target, Flame, Activity, Camera, Zap, ChevronRight, CheckCircle2, Clock, Bell } from 'lucide-react';
import Link from 'next/link';
import ProgressChart from '@/components/dashboard/ProgressChart';
import { useWorkoutReminder } from '@/hooks/useWorkoutReminder';

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
  streak: number;
  todaySession: any | null;
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
  const [dismissedReminder, setDismissedReminder] = useState(false);

  useEffect(() => {
    api.get('/dashboard').then((r) => {
      setData(r.data);
      setLoading(false);
    });
  }, []);

  // Check if today's session was already logged this week
  const hasLoggedToday = !!(data?.todaySession &&
    data.weeklyWorkouts.some((w: any) => w.workoutSessionId === data.todaySession?.id));

  useWorkoutReminder(data?.todaySession ?? null, hasLoggedToday);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div>
          <div className="h-7 w-48 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-64 bg-gray-100 rounded" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="card p-5 h-[120px]">
              <div className="w-10 h-10 bg-gray-200 rounded-lg mb-3" />
              <div className="h-6 w-12 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
        <div className="card p-5 h-[180px] bg-gray-50" />
        <div className="card p-5 h-[200px] bg-gray-50" />
      </div>
    );
  }

  // Detect "empty" state — no plan, no logs, no progress
  const isEmpty = !data?.todaySession
    && (data?.weeklyWorkouts?.length ?? 0) === 0
    && (data?.progressLogs?.length ?? 0) === 0
    && (data?.todayNutrition?.calories ?? 0) === 0;

  // Build "this week" session list: plan sessions + which ones have logs
  const planSessions: any[] = data?.weeklyWorkouts ?? [];
  // Map of workoutSessionId → log for quick lookup
  const logsBySessionId = Object.fromEntries(
    planSessions.map((w: any) => [w.workoutSessionId ?? w.id, w])
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Workout reminder banner */}
      {data?.todaySession && !hasLoggedToday && !dismissedReminder && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Bell size={16} className="text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700 flex-1">
            <span className="font-semibold">Lembrete:</span> você tem{' '}
            <span className="font-semibold">{data.todaySession.name}</span> no plano de hoje!
          </p>
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link href="/workouts" className="text-xs font-semibold text-blue-600 hover:underline">Ver treino</Link>
            <button onClick={() => setDismissedReminder(true)} className="text-blue-400 hover:text-blue-600">
              <span className="text-xs">✕</span>
            </button>
          </div>
        </div>
      )}

      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Olá, {user?.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-gray-500">Veja como você está indo hoje</p>
      </div>

      {/* Empty state — first-time user with no data yet */}
      {isEmpty && (
        <div className="card p-6 bg-gradient-to-br from-primary-50 to-blue-50 border-2 border-primary-100">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Bem-vindo! Vamos começar 🚀</h2>
          <p className="text-sm text-gray-600 mb-5">
            Em 3 passos rápidos você já está treinando com tudo personalizado.
          </p>
          <div className="space-y-3">
            <Link href="/chat?agent=TRAINER" className="flex items-center gap-3 p-3 rounded-xl bg-white hover:shadow-sm transition-all">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Dumbbell size={18} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">1. Peça seu treino ao Personal Trainer</p>
                <p className="text-xs text-gray-500">Ele monta um plano semanal automaticamente</p>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
            <Link href="/chat?agent=NUTRITIONIST" className="flex items-center gap-3 p-3 rounded-xl bg-white hover:shadow-sm transition-all">
              <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Salad size={18} className="text-primary-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">2. Crie sua dieta com a Nutricionista</p>
                <p className="text-xs text-gray-500">Refeições e macros calculados pra você</p>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
            <Link href="/drshape" className="flex items-center gap-3 p-3 rounded-xl bg-white hover:shadow-sm transition-all">
              <div className="w-9 h-9 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Camera size={18} className="text-pink-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">3. Faça sua avaliação com Dr. Shape</p>
                <p className="text-xs text-gray-500">Análise corporal por foto pra acompanhar evolução</p>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
          </div>
        </div>
      )}

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
          icon={<Flame size={20} className="text-orange-500" />}
          label="Sequência"
          value={`${data?.streak || 0}`}
          sub={data?.streak === 1 ? '1 dia seguido' : `${data?.streak || 0} dias seguidos`}
          color="bg-orange-50"
          href="/progress"
        />
      </div>

      {/* Today's session */}
      {data?.todaySession ? (
        <div className="card p-5 border-l-4 border-primary-500 bg-primary-50">
          <p className="text-xs font-semibold text-primary-600 uppercase tracking-wide mb-1">Treino de hoje</p>
          <h3 className="text-lg font-bold text-gray-900">{data.todaySession.name}</h3>
          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
            <span className="flex items-center gap-1"><Clock size={13} /> {data.todaySession.estimatedTime}min</span>
            <span>{data.todaySession.muscleGroups?.join(', ')}</span>
          </div>
          <Link href="/workouts" className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-primary-600 hover:underline">
            Ver exercícios <ChevronRight size={14} />
          </Link>
        </div>
      ) : null}

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
