import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AgentType, MemoryType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PushService } from '../push/push.service';
import { AgentsService } from '../agents/agents.service';
import { MemoryService } from '../memory/memory.service';

/**
 * WEEKLY CHECK-IN
 *
 * Once a week (Sunday evening, local time) the ANALYST agent reviews the
 * user's last 7 days of training + nutrition adherence and produces a short
 * coaching summary. The numbers are computed deterministically here (so the
 * model never invents them); the agent only interprets and advises.
 *
 * The summary is:
 *  - persisted as an ANALYST/SUMMARY memory (so it shows up as context the
 *    next time the user opens the Analyst chat), and
 *  - pushed to the user with a one-line headline.
 *
 * Mirrors RemindersService: hour-granular cron, timezone via Intl, per-user
 * dedup via `lastWeeklyCheckinAt`.
 */
export interface WeeklyStats {
  // workouts
  plannedWorkouts: number;
  completedWorkouts: number;
  workoutAdherencePct: number | null; // null when there's no active plan
  // nutrition
  hasNutritionTarget: boolean;
  targetCalories: number | null;
  targetProteinG: number | null;
  daysLogged: number; // distinct days with at least one meal log
  daysOnTarget: number; // days whose calories landed within ±15% of target
  avgCalories: number | null;
  avgProteinG: number | null;
  // body weight
  weightStartKg: number | null;
  weightEndKg: number | null;
  weightDeltaKg: number | null;
}

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);
  private static readonly CHECKIN_DAY = 0; // Sunday
  private static readonly CHECKIN_HOUR = 18; // 18h local
  private static readonly WINDOW_DAYS = 7;

  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private agents: AgentsService,
    private memory: MemoryService,
  ) {}

  // ─── CRON ────────────────────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_HOUR)
  async runWeeklyCheckins() {
    const now = new Date();
    const profiles = await this.prisma.userProfile.findMany({
      where: { weeklyCheckinEnabled: true },
      select: { userId: true, timezone: true, lastWeeklyCheckinAt: true },
    });
    if (!profiles.length) return;

    let ran = 0;
    for (const p of profiles) {
      try {
        const local = this.getLocalDateParts(now, p.timezone);
        if (local.dayOfWeek !== CheckinService.CHECKIN_DAY) continue;
        if (local.hour !== CheckinService.CHECKIN_HOUR) continue;

        // Dedup: only once per week. 48h guard survives restarts / double-cron.
        if (p.lastWeeklyCheckinAt) {
          const ageHours =
            (now.getTime() - p.lastWeeklyCheckinAt.getTime()) / 3_600_000;
          if (ageHours < 48) continue;
        }

        const result = await this.runForUser(p.userId);
        // Only mark (and thus consume the weekly slot) when we had something
        // worth saying — a brand-new user with zero activity gets skipped so
        // their first real check-in isn't wasted on an empty week.
        if (result.meaningful) {
          await this.prisma.userProfile.update({
            where: { userId: p.userId },
            data: { lastWeeklyCheckinAt: now },
          });
          ran++;
        }
      } catch (err: any) {
        this.logger.warn(`Weekly check-in failed for user=${p.userId}: ${err?.message}`);
      }
    }
    if (ran > 0) this.logger.log(`Weekly check-ins dispatched: ${ran}`);
  }

  // ─── CORE ────────────────────────────────────────────────────────────────
  /**
   * Compute stats → ask the ANALYST → persist memory → push. Returns the
   * summary + stats so the manual endpoint can render them immediately.
   * `meaningful` is false when the user has no activity AND no plan, so the
   * cron can decline to burn the weekly slot.
   */
  async runForUser(
    userId: string,
    opts: { push?: boolean } = { push: true },
  ): Promise<{ stats: WeeklyStats; summary: string; meaningful: boolean; pushed: number }> {
    const stats = await this.computeWeeklyStats(userId);
    const meaningful =
      stats.completedWorkouts > 0 ||
      stats.daysLogged > 0 ||
      stats.plannedWorkouts > 0 ||
      stats.hasNutritionTarget;

    const statsBlock = this.buildStatsBlock(stats);
    const summary = await this.agents.generateWeeklyCheckin(userId, statsBlock);

    if (summary?.trim()) {
      await this.memory.saveMemory(
        userId,
        AgentType.ANALYST,
        MemoryType.SUMMARY,
        `[Check-in semanal ${new Date().toLocaleDateString('pt-BR')}]\n${summary.trim()}`,
        1.6,
      );
    }

    let pushed = 0;
    if (opts.push !== false && this.push.isEnabled()) {
      const headline = this.buildPushBody(stats);
      const result: any = await this.push.sendToUser(userId, {
        title: 'Seu check-in semanal 📊',
        body: headline,
        url: '/progress',
      });
      pushed = result?.sent ?? 0;
    }

    return { stats, summary, meaningful, pushed };
  }

  /** Most recent persisted weekly check-in summary (for the UI card). */
  async getLatestCheckin(
    userId: string,
  ): Promise<{ summary: string; createdAt: Date } | null> {
    const mem = await this.prisma.memory.findFirst({
      where: {
        userId,
        agentType: AgentType.ANALYST,
        type: MemoryType.SUMMARY,
        content: { startsWith: '[Check-in semanal' },
      },
      orderBy: { createdAt: 'desc' },
      select: { content: true, createdAt: true },
    });
    if (!mem) return null;
    // Strip the "[Check-in semanal DD/MM/YYYY]\n" prefix for display.
    const summary = mem.content.replace(/^\[Check-in semanal[^\]]*\]\n?/, '').trim();
    return { summary, createdAt: mem.createdAt };
  }

  // ─── STATS ───────────────────────────────────────────────────────────────
  async computeWeeklyStats(userId: string): Promise<WeeklyStats> {
    const now = new Date();
    const since = new Date(now.getTime() - CheckinService.WINDOW_DAYS * 86_400_000);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    const tz = profile?.timezone || 'America/Sao_Paulo';

    const [plan, completedWorkouts, nutrition, mealLogs, progressLogs] =
      await Promise.all([
        this.prisma.workoutPlan.findFirst({
          where: { userId, isActive: true },
          select: { sessions: { select: { id: true } } },
        }),
        this.prisma.workoutLog.count({
          where: { userId, completedAt: { gte: since } },
        }),
        this.prisma.nutritionPlan.findFirst({
          where: { userId, isActive: true },
          select: { calories: true, proteinG: true },
        }),
        this.prisma.mealLog.findMany({
          where: { userId, loggedAt: { gte: since } },
          select: { calories: true, proteinG: true, loggedAt: true },
        }),
        this.prisma.progressLog.findMany({
          where: { userId, weightKg: { not: null }, loggedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
          select: { weightKg: true, loggedAt: true },
          orderBy: { loggedAt: 'asc' },
        }),
      ]);

    const plannedWorkouts = plan?.sessions.length ?? 0;
    const workoutAdherencePct =
      plannedWorkouts > 0
        ? Math.min(100, Math.round((completedWorkouts / plannedWorkouts) * 100))
        : null;

    // Group meal logs by local day, sum macros per day.
    const byDay = new Map<string, { kcal: number; protein: number }>();
    for (const m of mealLogs) {
      const key = this.localDayKey(m.loggedAt, tz);
      const acc = byDay.get(key) || { kcal: 0, protein: 0 };
      acc.kcal += m.calories || 0;
      acc.protein += m.proteinG || 0;
      byDay.set(key, acc);
    }
    const daysLogged = byDay.size;
    const targetCalories = nutrition?.calories ?? null;
    const targetProteinG = nutrition?.proteinG ?? null;
    let daysOnTarget = 0;
    let totalKcal = 0;
    let totalProtein = 0;
    for (const { kcal, protein } of byDay.values()) {
      totalKcal += kcal;
      totalProtein += protein;
      if (targetCalories && Math.abs(kcal - targetCalories) <= targetCalories * 0.15) {
        daysOnTarget++;
      }
    }
    const avgCalories = daysLogged > 0 ? Math.round(totalKcal / daysLogged) : null;
    const avgProteinG = daysLogged > 0 ? Math.round(totalProtein / daysLogged) : null;

    const weightStartKg = progressLogs[0]?.weightKg ?? null;
    const weightEndKg = progressLogs[progressLogs.length - 1]?.weightKg ?? null;
    const weightDeltaKg =
      weightStartKg != null && weightEndKg != null && progressLogs.length >= 2
        ? Math.round((weightEndKg - weightStartKg) * 10) / 10
        : null;

    return {
      plannedWorkouts,
      completedWorkouts,
      workoutAdherencePct,
      hasNutritionTarget: !!nutrition,
      targetCalories,
      targetProteinG,
      daysLogged,
      daysOnTarget,
      avgCalories,
      avgProteinG,
      weightStartKg,
      weightEndKg,
      weightDeltaKg,
    };
  }

  /** Deterministic block fed to the ANALYST — the only source of numbers. */
  private buildStatsBlock(s: WeeklyStats): string {
    const lines: string[] = ['=== DADOS DA SEMANA (últimos 7 dias) ==='];

    if (s.plannedWorkouts > 0) {
      lines.push(
        `TREINOS: ${s.completedWorkouts} de ${s.plannedWorkouts} planejados concluídos (${s.workoutAdherencePct}% de aderência)`,
      );
    } else {
      lines.push(
        `TREINOS: ${s.completedWorkouts} registrados (sem plano ativo para comparar)`,
      );
    }

    if (s.hasNutritionTarget) {
      lines.push(
        `NUTRIÇÃO: meta ${s.targetCalories} kcal / ${s.targetProteinG}g proteína`,
      );
      lines.push(`  - Dias com registro alimentar: ${s.daysLogged} de 7`);
      lines.push(`  - Dias dentro da meta calórica (±15%): ${s.daysOnTarget}`);
      if (s.daysLogged > 0) {
        lines.push(
          `  - Média diária registrada: ${s.avgCalories} kcal, ${s.avgProteinG}g proteína`,
        );
      }
    } else {
      lines.push('NUTRIÇÃO: sem plano alimentar ativo.');
    }

    if (s.weightDeltaKg != null) {
      const dir = s.weightDeltaKg === 0 ? 'estável' : s.weightDeltaKg > 0 ? `+${s.weightDeltaKg}kg` : `${s.weightDeltaKg}kg`;
      lines.push(`PESO: ${s.weightStartKg}kg → ${s.weightEndKg}kg (${dir} no período)`);
    } else {
      lines.push('PESO: sem registros suficientes para tendência.');
    }

    return lines.join('\n');
  }

  /** One-line push body summarizing the week. */
  private buildPushBody(s: WeeklyStats): string {
    const parts: string[] = [];
    if (s.plannedWorkouts > 0) {
      parts.push(`Treinos ${s.completedWorkouts}/${s.plannedWorkouts}`);
    } else if (s.completedWorkouts > 0) {
      parts.push(`${s.completedWorkouts} treinos`);
    }
    if (s.hasNutritionTarget) parts.push(`dieta ${s.daysLogged}/7 dias`);
    const head = parts.length ? `${parts.join(' · ')}. ` : '';
    return `${head}Toque para ver sua análise da semana.`;
  }

  // ─── TIMEZONE HELPERS (mirror RemindersService) ─────────────────────────
  private localDayKey(d: Date, timeZone: string): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  private getLocalDateParts(d: Date, timeZone: string): { hour: number; dayOfWeek: number } {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        hour12: false,
        weekday: 'short',
      });
      const parts = fmt.formatToParts(d);
      const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
      const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
      const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const hour = parseInt(hourStr, 10) % 24;
      return { hour, dayOfWeek: map[weekdayStr] ?? 0 };
    } catch {
      return { hour: d.getUTCHours(), dayOfWeek: d.getUTCDay() };
    }
  }
}
