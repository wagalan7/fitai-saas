import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { resolveExerciseVideo } from './exercise-library';
import { getPeriodization, clampCycleWeeks } from './periodization';
import { buildWarmup } from './warmup';
import { analyzeReadiness } from './readiness';
import {
  suggestProgression,
  normalizeExerciseName,
  type LoggedSet,
  type ProgressionSuggestion,
} from './progression';
import { buildPlanRationale } from './plan-rationale';

// In-memory dedup: userId+hash → in-flight or recently-completed result.
// 60s TTL is enough to catch double-clicks, auto-save races, and network retries.
const saveDedupCache = new Map<string, { result: Promise<any>; ts: number }>();
const DEDUP_TTL_MS = 60_000;

@Injectable()
export class WorkoutsService {
  constructor(
    private prisma: PrismaService,
    private agentsService: AgentsService,
  ) {}

  // Words that cannot appear together — catches hallucinated combos
  private static INVALID_COMBOS = [
    ['supino', 'perna'], ['supino', 'joelho'], ['supino', 'glúteo'],
    ['rosca', 'perna'], ['rosca', 'joelho'], ['rosca', 'quadrícep'],
    ['desenvolvimento', 'perna'], ['leg', 'bícep'], ['leg', 'trícep'],
  ];

  // Abdominal/core moves that the model sometimes drops into a pure-cardio
  // session. Cardio days stay cardio — if the plan wants core it gets its own
  // session — so we strip these when the session is cardio-only.
  private static ABDOMINAL_WORDS = [
    'abdominal', 'abdômen', 'abdomen', 'prancha', 'crunch',
    'russian twist', 'elevação de pernas', 'oblíquo',
  ];

  private sanitizeExerciseName(name: string): string {
    const lower = name.toLowerCase();
    for (const [a, b] of WorkoutsService.INVALID_COMBOS) {
      if (lower.includes(a) && lower.includes(b)) {
        console.warn(`[sanitize] Invalid exercise detected: "${name}" — skipping`);
        return null as any; // mark for removal
      }
    }
    return name;
  }

  /**
   * Single chokepoint that cleans an LLM-produced plan before it hits the DB,
   * regardless of source (two-pass, single-pass, or chat-extracted). The
   * two-pass generator already dedupes, but chat extraction and single-pass
   * did not — centralizing here means every plan the user ever sees is clean.
   *
   * Repairs applied per session:
   *  - drop hallucinated combos (e.g. "Supino de Perna") via sanitize
   *  - drop duplicate exercise names (keeps first), renumber `order`
   *  - on cardio-only sessions, strip abdominal/core moves (issue #4)
   * Issues are logged (structured) so we can later wire them into metrics.
   */
  private cleanSession(session: any): {
    cleaned: any;
    issues: string[];
  } {
    const issues: string[] = [];
    const groups: string[] = (session.muscleGroups || []).map((g: string) =>
      String(g).toLowerCase(),
    );
    const isCardioOnly =
      groups.length > 0 &&
      groups.every((g) => g.includes('cardio') || g.includes('aerób'));

    const seen = new Set<string>();
    const exercises: any[] = [];

    for (const raw of session.exercises || []) {
      const name = this.sanitizeExerciseName(raw.name);
      if (name === null) {
        issues.push(`combo inválido removido: "${raw.name}"`);
        continue;
      }
      const lower = name.trim().toLowerCase();
      if (!lower) continue;

      if (seen.has(lower)) {
        issues.push(`duplicata removida: "${name}"`);
        continue;
      }

      if (
        isCardioOnly &&
        WorkoutsService.ABDOMINAL_WORDS.some((w) => lower.includes(w))
      ) {
        issues.push(`abdômen removido de sessão de cardio: "${name}"`);
        continue;
      }

      seen.add(lower);
      exercises.push({ ...raw, name });
    }

    return {
      cleaned: {
        dayOfWeek: Number(session.dayOfWeek) ?? 1,
        name: session.name,
        muscleGroups: session.muscleGroups || [],
        estimatedTime: Number(session.estimatedTime) || 60,
        exercises: {
          create: exercises.map((ex: any, i: number) => ({
            order: i + 1, // re-number after removals so the UI stays sequential
            name: ex.name,
            sets: Number(ex.sets) || 3,
            reps: String(ex.reps),
            restSeconds: Number(ex.restSeconds) || 60,
            notes: ex.notes || null,
            // Curated demo link, resolved server-side so every client (web,
            // iOS, Watch) shows the same demonstration. Respect any URL the
            // model already provided.
            videoUrl: ex.videoUrl || resolveExerciseVideo(ex.name),
          })),
        },
      },
      issues,
    };
  }

  private buildPlanSessions(sessions: any[]) {
    const allIssues: string[] = [];
    const built = (sessions || []).map((session: any) => {
      const { cleaned, issues } = this.cleanSession(session);
      if (issues.length) {
        allIssues.push(`[${session.name}] ${issues.join('; ')}`);
      }
      return cleaned;
    });
    if (allIssues.length) {
      console.warn(`[buildPlanSessions] repaired plan: ${allIssues.join(' | ')}`);
    }
    return built;
  }

  private activePlanInclude = {
    sessions: {
      orderBy: { dayOfWeek: 'asc' as const },
      include: { exercises: { orderBy: { order: 'asc' as const } } },
    },
  };

  private async replacePlan(
    userId: string,
    planData: any,
    source: string,
    meta?: { cycleWeeks?: number; currentWeek?: number; rawPrompt?: string | null },
  ) {
    console.log(
      `[replacePlan] userId=${userId} source=${source} sessions=${planData?.sessions?.length} week=${meta?.currentWeek ?? 1}/${meta?.cycleWeeks ?? 4}`,
    );

    // Step 1: deactivate all existing active plans
    const deactivated = await this.prisma.workoutPlan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    console.log(`[replacePlan] deactivated ${deactivated.count} plans`);

    // Step 2: create the new plan explicitly with isActive: true
    const newPlan = await this.prisma.workoutPlan.create({
      data: {
        userId,
        isActive: true,
        name: planData.name || (source === 'chat' ? 'Plano do Chat' : 'Plano Personalizado'),
        description: planData.description,
        cycleWeeks: clampCycleWeeks(meta?.cycleWeeks ?? 4),
        currentWeek: Math.max(1, meta?.currentWeek ?? 1),
        rawPrompt: meta?.rawPrompt ?? null,
        sessions: { create: this.buildPlanSessions(planData.sessions) },
      },
      include: this.activePlanInclude,
    });
    console.log(`[replacePlan] created plan id=${newPlan.id} sessions=${newPlan.sessions?.length}`);
    return this.withPeriodization(newPlan);
  }

  /** Attaches the computed periodization phase plus a per-session warm-up so the
   *  UI can show both without duplicating engine logic on the client. The
   *  warm-up is computed (not persisted) from each session's muscle groups. */
  private withPeriodization<T extends { currentWeek?: number; cycleWeeks?: number } | null>(
    plan: T,
  ): T {
    if (!plan) return plan;
    const sessions = (plan as any).sessions;
    const withWarmups = Array.isArray(sessions)
      ? sessions.map((s: any) => ({ ...s, warmup: buildWarmup(s?.muscleGroups) }))
      : sessions;
    return {
      ...plan,
      ...(withWarmups ? { sessions: withWarmups } : {}),
      periodization: getPeriodization(
        (plan as any).currentWeek ?? 1,
        (plan as any).cycleWeeks ?? 4,
      ),
    } as T;
  }

  /**
   * Shared generation with the two-pass-then-single-pass fallback. `directive`
   * is the periodization phase text injected into the prompts.
   */
  private async generatePlanData(
    userId: string,
    preferences?: string,
    directive?: string,
  ) {
    const useSinglePass = process.env.WORKOUTS_SINGLE_PASS === '1';
    try {
      if (useSinglePass) {
        // Single-pass takes no directive arg — fold it into preferences so the
        // emergency-fallback path still respects the periodization phase.
        const prefs = [preferences, directive].filter(Boolean).join('\n\n');
        return await this.agentsService.generateWorkoutPlan(userId, prefs || undefined);
      }
      return await this.agentsService.generateWorkoutPlanTwoPass(
        userId,
        preferences,
        directive,
      );
    } catch (err: any) {
      console.warn(
        `[generatePlanData] two-pass failed (${err?.message}); falling back to single-pass`,
      );
      const prefs = [preferences, directive].filter(Boolean).join('\n\n');
      return await this.agentsService.generateWorkoutPlan(userId, prefs || undefined);
    }
  }

  async generatePlan(userId: string, preferences?: string, cycleWeeks?: number) {
    // A fresh generation starts a NEW mesocycle at week 1 (Acumulação). The
    // last week of the cycle is a programmed deload; advanceWeek() walks the
    // weeks forward. Two-pass is the default; generatePlanData handles the
    // single-pass fallback. WORKOUTS_SINGLE_PASS=1 forces the legacy path.
    const cycle = clampCycleWeeks(cycleWeeks ?? 4);
    const period = getPeriodization(1, cycle);
    const planData = await this.generatePlanData(userId, preferences, period.directive);
    return this.replacePlan(userId, planData, 'generate', {
      cycleWeeks: cycle,
      currentWeek: 1,
      rawPrompt: preferences ?? null,
    });
  }

  /**
   * Advances the active plan to the next week of its mesocycle, regenerating
   * with that week's periodization phase. Rolls into a fresh cycle (week 1)
   * after the deload. Reuses the preferences the cycle was created with so the
   * split stays consistent across the block; the load progression comes from
   * the user's logged sets (see AgentsService.buildTrainingHistory).
   */
  async advanceWeek(userId: string) {
    const active = await this.prisma.workoutPlan.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) {
      throw new NotFoundException('Nenhum plano ativo para avançar. Gere um treino primeiro.');
    }

    const cycle = clampCycleWeeks(active.cycleWeeks ?? 4);
    let next = (active.currentWeek ?? 1) + 1;
    if (next > cycle) next = 1; // completed the block → start a new mesocycle

    const period = getPeriodization(next, cycle);
    const preferences = active.rawPrompt ?? undefined;
    console.log(
      `[advanceWeek] userId=${userId} ${active.currentWeek}/${cycle} -> ${next}/${cycle} phase=${period.phase}`,
    );

    const planData = await this.generatePlanData(userId, preferences, period.directive);
    return this.replacePlan(userId, planData, 'advance-week', {
      cycleWeeks: cycle,
      currentWeek: next,
      rawPrompt: active.rawPrompt,
    });
  }

  /**
   * Autoregulated-deload readiness: reads the user's logged RPE + session
   * ratings over the last ~10 days and turns them into a recommendation. Used
   * to surface an "antecipe um deload" banner when fatigue has outrun the plan.
   */
  async getReadiness(userId: string) {
    const since = new Date(Date.now() - 10 * 86_400_000);
    const [active, logs] = await Promise.all([
      this.prisma.workoutPlan.findFirst({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { currentWeek: true, cycleWeeks: true },
      }),
      this.prisma.workoutLog.findMany({
        where: { userId, completedAt: { gte: since } },
        select: {
          rating: true,
          exerciseLogs: { select: { sets: { select: { rpe: true } } } },
        },
      }),
    ]);

    const rpes: number[] = [];
    const ratings: number[] = [];
    for (const log of logs) {
      if (typeof log.rating === 'number') ratings.push(log.rating);
      for (const el of log.exerciseLogs) {
        for (const s of el.sets) {
          if (typeof s.rpe === 'number') rpes.push(s.rpe);
        }
      }
    }

    const period = active
      ? getPeriodization(active.currentWeek ?? 1, active.cycleWeeks ?? 4)
      : null;

    return analyzeReadiness({
      rpes,
      ratings,
      sessionsAnalyzed: logs.length,
      alreadyDeloading: period?.isDeload ?? false,
    });
  }

  /**
   * Applies an autoregulated deload NOW: regenerates the active plan with the
   * deload directive and moves the cycle position to its deload week, so the
   * UI reflects the deload and a later advanceWeek() rolls into a fresh cycle.
   */
  async applyDeload(userId: string) {
    const active = await this.prisma.workoutPlan.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) {
      throw new NotFoundException('Nenhum plano ativo para aplicar o deload. Gere um treino primeiro.');
    }

    const cycle = clampCycleWeeks(active.cycleWeeks ?? 4);
    // The last week of any cycle is the programmed deload; jump there.
    const deloadWeek = cycle > 1 ? cycle : 1;
    const period = getPeriodization(deloadWeek, cycle);
    const preferences = active.rawPrompt ?? undefined;
    console.log(`[applyDeload] userId=${userId} -> week ${deloadWeek}/${cycle} (autorregulado)`);

    const planData = await this.generatePlanData(userId, preferences, period.directive);
    return this.replacePlan(userId, planData, 'deload-autoregulated', {
      cycleWeeks: cycle,
      currentWeek: deloadWeek,
      rawPrompt: active.rawPrompt,
    });
  }

  /**
   * Progressive-overload targets for the active plan. For every exercise we
   * find the most recent time it was logged (matched by normalized name across
   * any session) and run the double-progression engine, returning a map keyed
   * by the plan's exercise name so the UI can show "última vez × meta de hoje"
   * and pre-fill the log form with the next target.
   */
  async getProgression(
    userId: string,
  ): Promise<{ hasPlan: boolean; suggestions: Record<string, ProgressionSuggestion> }> {
    const active = await this.prisma.workoutPlan.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: this.activePlanInclude,
    });
    if (!active) return { hasPlan: false, suggestions: {} };

    // 120 days is plenty to catch the last performance even on infrequent lifts.
    const since = new Date(Date.now() - 120 * 86_400_000);
    const logs = await this.prisma.workoutLog.findMany({
      where: { userId, completedAt: { gte: since } },
      orderBy: { completedAt: 'desc' },
      include: { exerciseLogs: { include: { sets: { orderBy: { setNumber: 'asc' } } } } },
    });

    // First hit wins in descending order → most-recent logged sets per exercise.
    const lastByExercise = new Map<string, LoggedSet[]>();
    for (const log of logs) {
      for (const el of log.exerciseLogs) {
        const key = normalizeExerciseName(el.exerciseName);
        if (!lastByExercise.has(key) && el.sets.length) {
          lastByExercise.set(
            key,
            el.sets.map((s) => ({
              reps: s.reps,
              weightKg: s.weightKg,
              durationSecs: s.durationSecs,
              rpe: s.rpe,
            })),
          );
        }
      }
    }

    const suggestions: Record<string, ProgressionSuggestion> = {};
    for (const session of active.sessions ?? []) {
      for (const ex of (session as any).exercises ?? []) {
        const lastSets = lastByExercise.get(normalizeExerciseName(ex.name)) ?? [];
        suggestions[ex.name] = suggestProgression(ex.reps, lastSets);
      }
    }
    return { hasPlan: true, suggestions };
  }

  async savePlanFromText(userId: string, text: string) {
    console.log(`[savePlanFromText] userId=${userId} textLength=${text?.length}`);

    // Idempotency: dedup identical (userId, text) calls within 60s
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const key = `${userId}:${hash}`;
    const now = Date.now();
    const cached = saveDedupCache.get(key);
    if (cached && now - cached.ts < DEDUP_TTL_MS) {
      console.log(`[savePlanFromText] dedup hit key=${key}`);
      return cached.result;
    }

    const promise = (async () => {
      let planData: any;
      try {
        planData = await this.agentsService.extractWorkoutFromText(text);
      } catch (err: any) {
        console.warn(`[savePlanFromText] extraction failed: ${err?.message}`);
        throw new BadRequestException(
          'Não foi possível identificar um plano de treino nessa mensagem. Peça ao Trainer para criar um plano com dias e exercícios detalhados.',
        );
      }
      if (!planData?.sessions?.length) {
        throw new BadRequestException(
          'O plano extraído está vazio. Peça ao Trainer para descrever o plano com sessões e exercícios específicos.',
        );
      }
      console.log(`[savePlanFromText] extracted name="${planData?.name}" sessions=${planData?.sessions?.length}`);
      return this.replacePlan(userId, planData, 'chat');
    })();

    saveDedupCache.set(key, { result: promise, ts: now });
    // Clean up failures so retry is possible
    promise.catch(() => saveDedupCache.delete(key));
    // GC stale entries opportunistically
    if (saveDedupCache.size > 200) {
      for (const [k, v] of saveDedupCache) {
        if (now - v.ts > DEDUP_TTL_MS) saveDedupCache.delete(k);
      }
    }
    return promise;
  }

  async getActivePlan(userId: string) {
    const [plans, profile] = await Promise.all([
      this.prisma.workoutPlan.findMany({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: this.activePlanInclude,
      }),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);
    console.log(`[getActivePlan] userId=${userId} found=${plans.length} plan="${plans[0]?.name}"`);
    const plan = this.withPeriodization(plans[0] ?? null);
    return this.withRationale(plan, profile);
  }

  /** Attaches a human "por que esse treino?" rationale derived from the user's
   *  profile + the plan's structure + the live periodization phase. Computed
   *  (not persisted) so it always reflects the current mesocycle week. */
  private withRationale(plan: any, profile: any): any {
    if (!plan) return plan;
    const sessions: any[] = Array.isArray(plan.sessions) ? plan.sessions : [];
    const muscleGroups = Array.from(
      new Set(sessions.flatMap((s) => (Array.isArray(s?.muscleGroups) ? s.muscleGroups : []))),
    );
    const rationale = buildPlanRationale({
      fitnessGoal: profile?.fitnessGoal,
      fitnessLevel: profile?.fitnessLevel,
      workoutsPerWeek: profile?.workoutsPerWeek,
      workoutDuration: profile?.workoutDuration,
      injuries: profile?.injuries,
      sessionCount: sessions.length,
      muscleGroups,
      periodization: plan.periodization,
    });
    return { ...plan, rationale };
  }

  async logWorkout(
    userId: string,
    workoutSessionId: string,
    data: {
      durationMinutes?: number;
      rating?: number;
      notes?: string;
      exerciseLogs?: Array<{
        exerciseName: string;
        sets: Array<{ reps?: number; weightKg?: number; durationSecs?: number; rpe?: number }>;
      }>;
    },
  ) {
    // Prevent duplicate: upsert by session + today's date
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const existing = await this.prisma.workoutLog.findFirst({
      where: { userId, workoutSessionId, completedAt: { gte: todayStart } },
    });
    if (existing) {
      return this.prisma.workoutLog.update({
        where: { id: existing.id },
        data: {
          durationMinutes: data.durationMinutes ?? existing.durationMinutes,
          rating: data.rating ?? existing.rating,
          notes: data.notes ?? existing.notes,
        },
        include: { exerciseLogs: { include: { sets: true } } },
      });
    }

    return this.prisma.workoutLog.create({
      data: {
        userId,
        workoutSessionId,
        durationMinutes: data.durationMinutes,
        rating: data.rating,
        notes: data.notes,
        exerciseLogs: {
          create: (data.exerciseLogs || []).map((el) => ({
            exerciseName: el.exerciseName,
            sets: {
              create: el.sets.map((s, i) => ({
                setNumber: i + 1,
                reps: s.reps,
                weightKg: s.weightKg,
                durationSecs: s.durationSecs,
                rpe: s.rpe,
              })),
            },
          })),
        },
      },
      include: { exerciseLogs: { include: { sets: true } } },
    });
  }

  // Returns { sessionId -> logId } for today's logs — used by frontend to show delete button
  async getTodayLogs(userId: string): Promise<Record<string, string>> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const logs = await this.prisma.workoutLog.findMany({
      where: { userId, completedAt: { gte: todayStart } },
      select: { id: true, workoutSessionId: true },
    });
    return Object.fromEntries(logs.map((l) => [l.workoutSessionId, l.id]));
  }

  async getWorkoutHistory(userId: string, limit = 20) {
    return this.prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: limit,
      include: {
        workoutSession: { select: { name: true, muscleGroups: true } },
        exerciseLogs: { include: { sets: true } },
      },
    });
  }

  async deleteWorkoutLog(userId: string, logId: string) {
    const log = await this.prisma.workoutLog.findUnique({ where: { id: logId } });
    if (!log || log.userId !== userId) {
      throw new NotFoundException('Registro não encontrado');
    }
    await this.prisma.workoutLog.delete({ where: { id: logId } });
    return { deleted: true };
  }
}
