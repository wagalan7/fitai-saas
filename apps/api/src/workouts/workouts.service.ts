import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AgentsService } from '../agents/agents.service';

@Injectable()
export class WorkoutsService {
  constructor(
    private prisma: PrismaService,
    private agentsService: AgentsService,
  ) {}

  async generatePlan(userId: string) {
    const planData = await this.agentsService.generateWorkoutPlan(userId);

    // Deactivate existing plans
    await this.prisma.workoutPlan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    return this.prisma.workoutPlan.create({
      data: {
        userId,
        name: planData.name || 'Plano Personalizado',
        description: planData.description,
        sessions: {
          create: (planData.sessions || []).map((session: any) => ({
            dayOfWeek: session.dayOfWeek,
            name: session.name,
            muscleGroups: session.muscleGroups || [],
            estimatedTime: session.estimatedTime || 60,
            exercises: {
              create: (session.exercises || []).map((ex: any) => ({
                order: ex.order,
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                restSeconds: ex.restSeconds,
                notes: ex.notes,
              })),
            },
          })),
        },
      },
      include: { sessions: { include: { exercises: true } } },
    });
  }

  async getActivePlan(userId: string) {
    return this.prisma.workoutPlan.findFirst({
      where: { userId, isActive: true },
      include: { sessions: { include: { exercises: { orderBy: { order: 'asc' } } } } },
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
}
