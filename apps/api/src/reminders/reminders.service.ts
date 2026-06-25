import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { PushService } from '../push/push.service';

/**
 * Sends workout-reminder push notifications even when the app is closed.
 *
 * Strategy:
 *  - Cron runs once per hour at minute 0.
 *  - For each user that has push subscriptions AND an active workout plan
 *    AND reminders enabled, we compute the current hour in *their* timezone
 *    and check whether it matches `workoutReminderHour`.
 *  - We then look up today's session in the plan (by `dayOfWeek`) and only
 *    fire the push if a session actually exists for today.
 *  - `lastWorkoutReminderAt` is used as a per-user dedup so a backend restart
 *    inside the same hour does not double-notify.
 *
 * This intentionally keeps the math simple: hour-granularity (no minutes),
 * and timezone resolution via `Intl.DateTimeFormat`. No date library needed.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runWorkoutReminders() {
    if (!this.push.isEnabled()) {
      this.logger.warn('Cron tick skipped: push not enabled (missing VAPID keys)');
      return;
    }
    this.logger.log('Cron tick: scanning workout reminder candidates');

    // Candidates: users with reminders ON + at least one push subscription.
    // We filter by active plan and timezone-hour inside the loop because
    // Prisma can't easily evaluate "now in TZ".
    const profiles = await this.prisma.userProfile.findMany({
      where: {
        workoutRemindersEnabled: true,
        user: { pushSubscriptions: { some: {} } },
      },
      select: {
        userId: true,
        workoutReminderHour: true,
        timezone: true,
        lastWorkoutReminderAt: true,
      },
    });

    this.logger.log(`Cron candidates: ${profiles.length}`);
    if (profiles.length === 0) return;

    const now = new Date();
    let sent = 0;

    for (const p of profiles) {
      try {
        const local = this.getLocalDateParts(now, p.timezone);
        if (local.hour !== p.workoutReminderHour) continue;

        // Skip if we already sent a reminder in the last 6h (cheap dedup
        // that survives restarts and protects against accidental double-cron).
        if (p.lastWorkoutReminderAt) {
          const ageHours = (now.getTime() - p.lastWorkoutReminderAt.getTime()) / 3_600_000;
          if (ageHours < 6) continue;
        }

        const plan = await this.prisma.workoutPlan.findFirst({
          where: { userId: p.userId, isActive: true },
          select: {
            sessions: {
              where: { dayOfWeek: local.dayOfWeek },
              select: { name: true, estimatedTime: true, muscleGroups: true },
              take: 1,
            },
          },
        });

        const session = plan?.sessions?.[0];
        if (!session) continue; // no workout today — no nag

        const muscles = session.muscleGroups?.length
          ? session.muscleGroups.slice(0, 3).join(', ')
          : session.name;

        const result = await this.push.sendToUser(p.userId, {
          title: 'Hora do treino 💪',
          body: `Hoje: ${muscles} · ~${session.estimatedTime || 60}min`,
          url: '/workouts',
        });

        if ((result as any)?.sent > 0) {
          sent++;
          await this.prisma.userProfile.update({
            where: { userId: p.userId },
            data: { lastWorkoutReminderAt: now },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Reminder failed for user=${p.userId}: ${err?.message}`);
      }
    }

    if (sent > 0) this.logger.log(`Workout reminders dispatched: ${sent}`);

    // Piggyback streak-saver pass on the same tick — same TZ math, same
    // push infrastructure, no extra cron registration noise.
    await this.runStreakSavers(now).catch((err) =>
      this.logger.warn(`Streak saver pass failed: ${err?.message}`),
    );

    // Accountability nudges share the same hourly tick + TZ math.
    await this.runComebackNudges(now).catch((err) =>
      this.logger.warn(`Comeback nudge pass failed: ${err?.message}`),
    );
    await this.runWeighInNudges(now).catch((err) =>
      this.logger.warn(`Weigh-in nudge pass failed: ${err?.message}`),
    );
  }

  /**
   * COMEBACK NUDGE — at 17h local, gently re-engages users who have a plan but
   * have gone quiet for 4+ days. Distinct from the streak saver (which only
   * fires for an ACTIVE streak): this is for people who already fell off, so we
   * cap the gap at 21 days to avoid nagging long-churned accounts forever.
   * Dedup of 72h means at most every ~3 days.
   */
  private async runComebackNudges(now: Date) {
    const NUDGE_HOUR = 17;
    const MIN_GAP_DAYS = 4;
    const MAX_GAP_DAYS = 21;

    const profiles = await this.prisma.userProfile.findMany({
      where: {
        workoutRemindersEnabled: true,
        user: { pushSubscriptions: { some: {} } },
      },
      select: { userId: true, timezone: true, lastComebackNudgeAt: true },
    });

    let sent = 0;
    for (const p of profiles) {
      try {
        const local = this.getLocalDateParts(now, p.timezone);
        if (local.hour !== NUDGE_HOUR) continue;

        if (p.lastComebackNudgeAt) {
          const ageHours = (now.getTime() - p.lastComebackNudgeAt.getTime()) / 3_600_000;
          if (ageHours < 72) continue;
        }

        // Needs an active plan to "come back" to.
        const plan = await this.prisma.workoutPlan.findFirst({
          where: { userId: p.userId, isActive: true },
          select: { id: true },
        });
        if (!plan) continue;

        // Most recent workout log. A genuine comeback requires a prior log.
        const lastLog = await this.prisma.workoutLog.findFirst({
          where: { userId: p.userId },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true },
        });
        if (!lastLog) continue; // never trained → onboarding handles that, not us

        const gapDays = Math.floor(
          (now.getTime() - lastLog.completedAt.getTime()) / 86_400_000,
        );
        if (gapDays < MIN_GAP_DAYS || gapDays > MAX_GAP_DAYS) continue;

        const result: any = await this.push.sendToUser(p.userId, {
          title: 'Senti sua falta 👀',
          body: `Faz ${gapDays} dias sem treino. Bora retomar hoje — 1 sessão já reacende o ritmo.`,
          url: '/workouts',
        });
        if (result?.sent > 0) {
          sent++;
          await this.prisma.userProfile.update({
            where: { userId: p.userId },
            data: { lastComebackNudgeAt: now },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Comeback nudge failed for user=${p.userId}: ${err?.message}`);
      }
    }
    if (sent > 0) this.logger.log(`Comeback nudges dispatched: ${sent}`);
  }

  /**
   * WEIGH-IN NUDGE — at 9h local (best time to weigh in), nags users who have
   * not logged a body weight in 7+ days. Closes the diet auto-titration loop:
   * the titration engine can only adjust calories when fresh weights exist.
   * Dedup of ~6 days keeps it roughly weekly.
   */
  private async runWeighInNudges(now: Date) {
    const NUDGE_HOUR = 9;
    const STALE_DAYS = 7;

    const profiles = await this.prisma.userProfile.findMany({
      where: {
        workoutRemindersEnabled: true,
        user: { pushSubscriptions: { some: {} } },
      },
      select: { userId: true, timezone: true, lastWeighInNudgeAt: true },
    });

    let sent = 0;
    for (const p of profiles) {
      try {
        const local = this.getLocalDateParts(now, p.timezone);
        if (local.hour !== NUDGE_HOUR) continue;

        if (p.lastWeighInNudgeAt) {
          const ageHours = (now.getTime() - p.lastWeighInNudgeAt.getTime()) / 3_600_000;
          if (ageHours < 6 * 24) continue;
        }

        // Last weight entry (a ProgressLog can be measurements-only, so require
        // weightKg to be present).
        const lastWeight = await this.prisma.progressLog.findFirst({
          where: { userId: p.userId, weightKg: { not: null } },
          orderBy: { loggedAt: 'desc' },
          select: { loggedAt: true },
        });

        const gapDays = lastWeight
          ? Math.floor((now.getTime() - lastWeight.loggedAt.getTime()) / 86_400_000)
          : null;
        // Nudge when stale (7+ days) or never logged a weight at all.
        if (gapDays != null && gapDays < STALE_DAYS) continue;

        const body =
          gapDays == null
            ? 'Registre seu peso pra ativar os ajustes automáticos da dieta. Leva 30s ⚖️'
            : `Faz ${gapDays} dias sem pesar. 30s no registro mantêm sua dieta calibrada ⚖️`;

        const result: any = await this.push.sendToUser(p.userId, {
          title: 'Hora de pesar ⚖️',
          body,
          url: '/progress',
        });
        if (result?.sent > 0) {
          sent++;
          await this.prisma.userProfile.update({
            where: { userId: p.userId },
            data: { lastWeighInNudgeAt: now },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Weigh-in nudge failed for user=${p.userId}: ${err?.message}`);
      }
    }
    if (sent > 0) this.logger.log(`Weigh-in nudges dispatched: ${sent}`);
  }

  /**
   * STREAK SAVER — at 20h local time, nags users with a 2+ day workout
   * streak who haven't logged today yet. Streak math here mirrors what
   * the dashboard shows: consecutive days of workout logs, ending today
   * or yesterday.
   *
   * Cheap: profiles already filtered to "has push subscriptions", then we
   * skip per-user when local hour != 20 BEFORE any heavier work.
   */
  private async runStreakSavers(now: Date) {
    const STREAK_HOUR = 20;
    const profiles = await this.prisma.userProfile.findMany({
      where: { user: { pushSubscriptions: { some: {} } } },
      select: {
        userId: true,
        timezone: true,
        lastStreakSaverAt: true,
      },
    });

    let sent = 0;
    for (const p of profiles) {
      try {
        const local = this.getLocalDateParts(now, p.timezone);
        if (local.hour !== STREAK_HOUR) continue;

        // 18h dedup so we only fire once per evening even if the cron
        // double-runs across a restart.
        if (p.lastStreakSaverAt) {
          const ageHours = (now.getTime() - p.lastStreakSaverAt.getTime()) / 3_600_000;
          if (ageHours < 18) continue;
        }

        // Pull recent logs in user's TZ. We grab the last 60 days of logs
        // (more than enough for any realistic streak) and group by local
        // YYYY-MM-DD.
        const since = new Date(now.getTime() - 60 * 86_400_000);
        const logs = await this.prisma.workoutLog.findMany({
          where: { userId: p.userId, completedAt: { gte: since } },
          select: { completedAt: true },
          orderBy: { completedAt: 'desc' },
        });

        const dayKeys = new Set<string>(
          logs.map((l) => this.localDayKey(l.completedAt, p.timezone)),
        );
        const todayKey = this.localDayKey(now, p.timezone);
        if (dayKeys.has(todayKey)) continue; // already logged today — no nag

        // Compute streak ending at yesterday.
        let streak = 0;
        let cursor = new Date(now.getTime() - 86_400_000); // yesterday
        while (dayKeys.has(this.localDayKey(cursor, p.timezone))) {
          streak++;
          cursor = new Date(cursor.getTime() - 86_400_000);
        }
        if (streak < 2) continue; // not worth nagging for a 1-day "streak"

        const result: any = await this.push.sendToUser(p.userId, {
          title: `🔥 ${streak} dias em chamas`,
          body: `Sua sequência de ${streak} dias está em risco — bate só o registro de hoje pra manter.`,
          url: '/workouts',
        });
        if (result?.sent > 0) {
          sent++;
          await this.prisma.userProfile.update({
            where: { userId: p.userId },
            data: { lastStreakSaverAt: now },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Streak saver failed for user=${p.userId}: ${err?.message}`);
      }
    }

    if (sent > 0) this.logger.log(`Streak savers dispatched: ${sent}`);
  }

  /** YYYY-MM-DD for the given moment in the user's timezone. */
  private localDayKey(d: Date, timeZone: string): string {
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return fmt.format(d); // en-CA = ISO-like "YYYY-MM-DD"
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  /**
   * Manually fire a reminder for one user right now — used by the "Test"
   * button in the profile UI to verify end-to-end push delivery without
   * waiting for the cron and without caring about the configured hour.
   *
   * Returns a diagnostic object explaining what happened so the UI can
   * surface useful errors (no subscription, no plan, no session today, etc).
   */
  async triggerForUserNow(userId: string): Promise<{
    ok: boolean;
    reason?: string;
    sent?: number;
  }> {
    if (!this.push.isEnabled()) {
      return { ok: false, reason: 'push_disabled' };
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { timezone: true, user: { select: { pushSubscriptions: { select: { id: true }, take: 1 } } } },
    });
    if (!profile) return { ok: false, reason: 'no_profile' };
    if (!profile.user?.pushSubscriptions?.length) {
      return { ok: false, reason: 'no_subscription' };
    }

    const now = new Date();
    const local = this.getLocalDateParts(now, profile.timezone);

    const plan = await this.prisma.workoutPlan.findFirst({
      where: { userId, isActive: true },
      select: {
        sessions: {
          where: { dayOfWeek: local.dayOfWeek },
          select: { name: true, estimatedTime: true, muscleGroups: true },
          take: 1,
        },
      },
    });

    const session = plan?.sessions?.[0];
    const title = 'Hora do treino 💪';
    const body = session
      ? `Hoje: ${(session.muscleGroups?.length ? session.muscleGroups.slice(0, 3).join(', ') : session.name)} · ~${session.estimatedTime || 60}min`
      : 'Teste de lembrete: você ainda não tem treino marcado para hoje, mas o push está chegando 👍';

    const result: any = await this.push.sendToUser(userId, {
      title,
      body,
      url: '/workouts',
    });
    const sent = result?.sent ?? 0;
    if (sent > 0) {
      this.logger.log(`Manual reminder sent to user=${userId} (sessionToday=${!!session})`);
      return { ok: true, sent };
    }
    return { ok: false, reason: 'push_send_returned_zero', sent };
  }

  /** Returns { hour: 0-23, dayOfWeek: 0-6 } in the given IANA timezone. */
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
      // "24" is sometimes returned by Intl for midnight; normalize to 0.
      const hour = parseInt(hourStr, 10) % 24;
      return { hour, dayOfWeek: map[weekdayStr] ?? 0 };
    } catch {
      // Bad TZ name — fall back to UTC.
      return { hour: d.getUTCHours(), dayOfWeek: d.getUTCDay() };
    }
  }
}
