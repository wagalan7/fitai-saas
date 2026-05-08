import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

// MET value for general gym/weight training
const WORKOUT_MET = 6;

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(userId: string) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Sunday of this week
    weekStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      profile,
      workoutPlan,
      weeklyWorkouts,
      progressLogs,
      todayMeals,
      nutritionPlan,
      recentChatSessions,
      todayWorkoutLogs,
    ] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.workoutPlan.findFirst({
        where: { userId, isActive: true },
        include: { sessions: { select: { id: true, name: true, dayOfWeek: true, muscleGroups: true, estimatedTime: true } } },
      }),
      this.prisma.workoutLog.findMany({
        where: { userId, completedAt: { gte: weekStart } },
        orderBy: { completedAt: 'desc' },
        include: { workoutSession: { select: { name: true, muscleGroups: true } } },
      }),
      this.prisma.progressLog.findMany({
        where: { userId, loggedAt: { gte: monthAgo } },
        orderBy: { loggedAt: 'asc' },
      }),
      this.prisma.mealLog.findMany({
        where: { userId, loggedAt: { gte: todayStart } },
      }),
      this.prisma.nutritionPlan.findUnique({ where: { userId } }),
      this.prisma.chatSession.findMany({
        where: { userId, isActive: true },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: { id: true, agentType: true, title: true, updatedAt: true },
      }),
      this.prisma.workoutLog.findMany({
        where: { userId, completedAt: { gte: todayStart } },
        select: { durationMinutes: true },
      }),
    ]);

    const todayCalories = todayMeals.reduce((acc, m) => acc + m.calories, 0);
    const weeklyTarget = profile?.workoutsPerWeek || 3;
    const weeklyWorkoutCount = weeklyWorkouts.length;
    const adherencePct = Math.min(100, Math.round((weeklyWorkoutCount / weeklyTarget) * 100));

    // Estimate calories burned today: MET × weight(kg) × hours
    const weightKg = profile?.weightKg || 75;
    const calsBurnedToday = todayWorkoutLogs.reduce((sum, w) => {
      const mins = w.durationMinutes || 0;
      return sum + Math.round(WORKOUT_MET * weightKg * (mins / 60));
    }, 0);

    return {
      profile,
      workoutPlan,
      weeklyWorkoutCount,
      adherencePct,
      weeklyWorkouts, // full list for the dashboard "this week" panel
      recentWorkouts: weeklyWorkouts.slice(0, 5),
      progressLogs,
      todayNutrition: {
        calories: todayCalories,
        target: nutritionPlan?.calories || 2000,
        meals: todayMeals,
      },
      calsBurnedToday,
      recentChatSessions,
    };
  }
}
