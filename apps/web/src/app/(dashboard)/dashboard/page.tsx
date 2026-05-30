'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Dumbbell, Salad, TrendingUp, Target, Flame, Activity, Camera, Zap, ChevronRight, CheckCircle2, Clock, Bell } from 'lucide-react';
import Link from 'next/link';
import ProgressChart from '@/components/dashboard/ProgressChart';
import ShareProgressCard from '@/components/dashboard/ShareProgressCard';
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

      {/* Streak hero — shown when user has a real streak going (>=2 days).
          This is the single highest-retention surface in a fitness app:
          users protect a streak even when they wouldn't otherwise train. */}
      {(data?.streak ?? 0) >= 2 && (
        <StreakHero streak={data!.streak} hasLoggedToday={hasLoggedToday} hasSessionToday={!!data?.todaySession} />
      )}

      {/* Empty state — first-time user with no data yet.
          Dr Shape is now step 1 because finishing the evaluation auto-regenerates
          both the workout plan AND the nutrition plan via the multi-agent
          orchestration — so a new user can be fully set up in a single step.
          Trainer/Nutricionista become refinement options. */}
      {isEmpty && (
        <div className="card p-6 bg-gradient-to-br from-primary-50 to-blue-50 border-2 border-primary-100">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Bem-vindo! Vamos começar 🚀</h2>
          <p className="text-sm text-gray-600 mb-5">
            O jeito mais rápido: faça a avaliação com Dr. Shape — ele já monta seu treino e dieta automaticamente.
          </p>
          <div className="space-y-3">
            <Link href="/drshape" className="flex items-center gap-3 p-3 rounded-xl bg-white hover:shadow-md ring-2 ring-pink-200 transition-all">
              <div className="w-9 h-9 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Camera size={18} className="text-pink-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">1. Avaliação com Dr. Shape <span className="text-pink-600">(recomendado)</span></p>
                <p className="text-xs text-gray-500">3 fotos + seus objetivos → treino + dieta personalizados em 1 passo</p>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
            <p className="text-xs text-gray-400 px-1 pt-1">Ou monte separadamente:</p>
            <Link href="/chat?agent=TRAINER" className="flex items-center gap-3 p-3 rounded-xl bg-white hover:shadow-sm transition-all">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Dumbbell size={18} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Treino com Personal Trainer</p>
                <p className="text-xs text-gray-500">Plano semanal personalizado via chat</p>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
            <Link href="/chat?agent=NUTRITIONIST" className="flex items-center gap-3 p-3 rounded-xl bg-white hover:shadow-sm transition-all">
              <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Salad size={18} className="text-primary-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Dieta com a Nutricionista</p>
                <p className="text-xs text-gray-500">Refeições e macros calculados pra você</p>
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

      {/* Share progress */}
      {!isEmpty && (
        <ShareProgressCard
          userName={user?.name || 'Atleta'}
          streak={data?.streak || 0}
          weeklyWorkouts={data?.weeklyWorkoutCount || 0}
          weeklyTarget={data?.profile?.workoutsPerWeek || 3}
          adherencePct={data?.adherencePct || 0}
        />
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

/**
 * StreakHero — emphasizes the user's training streak.
 * Three modes based on context:
 *  - At-risk (has streak, has session today, hasn't logged yet) → urgent warning
 *  - Safe (logged today OR no session today) → celebration
 *  - Milestone reached (3/7/14/30/60/100) → extra emphasis in copy
 */
function StreakHero({ streak, hasLoggedToday, hasSessionToday }: { streak: number; hasLoggedToday: boolean; hasSessionToday: boolean }) {
  const atRisk = hasSessionToday && !hasLoggedToday;
  const milestone = [3, 7, 14, 30, 60, 100, 365].includes(streak);

  const bg = atRisk
    ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'
    : 'bg-gradient-to-br from-orange-50 to-pink-50 border-orange-200';

  const title = atRisk
    ? `${streak} dias em chamas — não pare hoje!`
    : milestone
      ? `${streak} dias seguidos! 🎉`
      : `${streak} dias seguidos 🔥`;

  const sub = atRisk
    ? 'Você tem treino marcado pra hoje. Bate o registro e mantém a sequência.'
    : hasLoggedToday
      ? 'Hoje você manteve a sequência. Continua assim amanhã.'
      : milestone
        ? 'Marca histórica desbloqueada. Cada dia daqui pra frente conta o dobro.'
        : 'Continue treinando para crescer essa sequência.';

  return (
    <Link href={atRisk ? '/workouts' : '/progress'} className={`block card p-5 border-2 ${bg} hover:shadow-md transition-all`}>
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-3xl">🔥</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-gray-900">{title}</p>
          <p className="text-sm text-gray-600 mt-0.5">{sub}</p>
        </div>
        {atRisk && (
          <div className="hidden sm:flex items-center gap-1 text-amber-700 text-xs font-semibold bg-amber-100 px-2.5 py-1 rounded-full flex-shrink-0">
            Em risco
          </div>
        )}
      </div>
    </Link>
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
