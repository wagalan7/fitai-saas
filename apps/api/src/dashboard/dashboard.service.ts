import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(userId: string) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      profile,
      workoutPlan,
      recentWorkouts,
      weeklyWorkoutCount,
      progressLogs,
      todayMeals,
      nutritionPlan,
      recentChatSessions,
    ] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.workoutPlan.findFirst({
        where: { userId, isActive: true },
        include: { sessions: { select: { id: true, name: true, dayOfWeek: true, muscleGroups: true } } },
      }),
      this.prisma.workoutLog.findMany({
        where: { userId, completedAt: { gte: weekAgo } },
        orderBy: { completedAt: 'desc' },
        include: { workoutSession: { select: { name: true } } },
      }),
      this.prisma.workoutLog.count({ where: { userId, completedAt: { gte: weekAgo } } }),
      this.prisma.progressLog.findMany({
        where: { userId, loggedAt: { gte: monthAgo } },
        orderBy: { loggedAt: 'asc' },
      }),
      this.prisma.mealLog.findMany({
        where: {
          userId,
          loggedAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          },
        },
      }),
      this.prisma.nutritionPlan.findUnique({ where: { userId } }),
      this.prisma.chatSession.findMany({
        where: { userId, isActive: true },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: { id: true, agentType: true, title: true, updatedAt: true },
      }),
    ]);

    const todayCalories = todayMeals.reduce((acc, m) => acc + m.calories, 0);
    const weeklyTarget = profile?.workoutsPerWeek || 3;
    const adherencePct = Math.min(100, Math.round((weeklyWorkoutCount / weeklyTarget) * 100));

    return {
      profile,
      workoutPlan,
      weeklyWorkoutCount,
      adherencePct,
      recentWorkouts: recentWorkouts.slice(0, 5),
      progressLogs,
      todayNutrition: {
        calories: todayCalories,
        target: nutritionPlan?.calories || 2000,
        meals: todayMeals,
      },
      recentChatSessions,
    };
  }
}
