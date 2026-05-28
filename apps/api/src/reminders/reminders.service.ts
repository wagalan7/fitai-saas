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
    if (!this.push.isEnabled()) return;

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
