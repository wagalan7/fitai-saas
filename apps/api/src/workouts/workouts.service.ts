import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AgentsService } from '../agents/agents.service';

@Injectable()
export class WorkoutsService {
  constructor(
    private prisma: PrismaService,
    private agentsService: AgentsService,
  ) {}

  private buildPlanSessions(sessions: any[]) {
    return (sessions || []).map((session: any) => ({
      dayOfWeek: Number(session.dayOfWeek) ?? 1,
      name: session.name,
      muscleGroups: session.muscleGroups || [],
      estimatedTime: Number(session.estimatedTime) || 60,
      exercises: {
        create: (session.exercises || []).map((ex: any) => ({
          order: Number(ex.order) || 1,
          name: ex.name,
          sets: Number(ex.sets) || 3,
          reps: String(ex.reps),
          restSeconds: Number(ex.restSeconds) || 60,
          notes: ex.notes || null,
        })),
      },
    }));
  }

  private activePlanInclude = {
    sessions: {
      orderBy: { dayOfWeek: 'asc' as const },
      include: { exercises: { orderBy: { order: 'asc' as const } } },
    },
  };

  async generatePlan(userId: string) {
    const planData = await this.agentsService.generateWorkoutPlan(userId);

    return this.prisma.$transaction(async (tx) => {
      await tx.workoutPlan.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
      return tx.workoutPlan.create({
        data: {
          userId,
          name: planData.name || 'Plano Personalizado',
          description: planData.description,
          sessions: { create: this.buildPlanSessions(planData.sessions) },
        },
        include: this.activePlanInclude,
      });
    });
  }

  async savePlanFromText(userId: string, text: string) {
    const planData = await this.agentsService.extractWorkoutFromText(text);

    return this.prisma.$transaction(async (tx) => {
      await tx.workoutPlan.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
      return tx.workoutPlan.create({
        data: {
          userId,
          name: planData.name || 'Plano do Chat',
          description: planData.description,
          sessions: { create: this.buildPlanSessions(planData.sessions) },
        },
        include: this.activePlanInclude,
      });
    });
  }

  async getActivePlan(userId: string) {
    return this.prisma.workoutPlan.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: this.activePlanInclude,
    });
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
