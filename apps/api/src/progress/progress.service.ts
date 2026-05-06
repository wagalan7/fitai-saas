import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async logProgress(
    userId: string,
    data: {
      weightKg?: number;
      bodyFatPct?: number;
      muscleMassKg?: number;
      chestCm?: number;
      waistCm?: number;
      hipCm?: number;
      armCm?: number;
      legCm?: number;
      notes?: string;
    },
  ) {
    return this.prisma.progressLog.create({ data: { userId, ...data } });
  }

  async getHistory(userId: string, days = 90) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.progressLog.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: { loggedAt: 'asc' },
    });
  }

  async getSummary(userId: string) {
    const [profile, latest, oldest, workoutCount, mealCount] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.progressLog.findFirst({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
      }),
      this.prisma.progressLog.findFirst({
        where: { userId },
        orderBy: { loggedAt: 'asc' },
      }),
      this.prisma.workoutLog.count({ where: { userId } }),
      this.prisma.mealLog.count({ where: { userId } }),
    ]);

    const weightChange =
      latest?.weightKg && oldest?.weightKg
        ? +(latest.weightKg - oldest.weightKg).toFixed(1)
        : null;

    return {
      currentWeight: latest?.weightKg || profile?.weightKg,
      startWeight: oldest?.weightKg || profile?.weightKg,
      weightChange,
      totalWorkouts: workoutCount,
      totalMealsLogged: mealCount,
      latestMeasurements: latest,
    };
  }
}
