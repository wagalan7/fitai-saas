import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { AgentsService } from '../agents/agents.service';

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

  private async replacePlan(userId: string, planData: any, source: string) {
    console.log(`[replacePlan] userId=${userId} source=${source} sessions=${planData?.sessions?.length}`);

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
        sessions: { create: this.buildPlanSessions(planData.sessions) },
      },
      include: this.activePlanInclude,
    });
    console.log(`[replacePlan] created plan id=${newPlan.id} sessions=${newPlan.sessions?.length}`);
    return newPlan;
  }

  async generatePlan(userId: string, preferences?: string) {
    // Two-pass is the default — single round-trip generation kept truncating
    // long splits, even after raising max_tokens. Skeleton+expand fans the
    // work out into ~session-sized JSON chunks that fit comfortably.
    // WORKOUTS_SINGLE_PASS=1 forces the legacy path for emergency rollback.
    const useSinglePass = process.env.WORKOUTS_SINGLE_PASS === '1';
    let planData: any;
    try {
      planData = useSinglePass
        ? await this.agentsService.generateWorkoutPlan(userId, preferences)
        : await this.agentsService.generateWorkoutPlanTwoPass(userId, preferences);
    } catch (err: any) {
      if (!useSinglePass) {
        console.warn(
          `[generatePlan] two-pass failed (${err?.message}); falling back to single-pass`,
        );
        planData = await this.agentsService.generateWorkoutPlan(userId, preferences);
      } else {
        throw err;
      }
    }
    return this.replacePlan(userId, planData, 'generate');
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
    const plans = await this.prisma.workoutPlan.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: this.activePlanInclude,
    });
    console.log(`[getActivePlan] userId=${userId} found=${plans.length} plan="${plans[0]?.name}"`);
    return plans[0] ?? null;
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
