import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AgentsService } from '../agents/agents.service';

@Injectable()
export class NutritionService {
  constructor(
    private prisma: PrismaService,
    private agentsService: AgentsService,
  ) {}

  async generatePlan(userId: string) {
    const planData = await this.agentsService.generateNutritionPlan(userId);

    // Upsert nutrition plan
    const existing = await this.prisma.nutritionPlan.findUnique({ where: { userId } });
    if (existing) {
      await this.prisma.nutritionPlan.delete({ where: { userId } });
    }

    return this.prisma.nutritionPlan.create({
      data: {
        userId,
        calories: planData.calories || 2000,
        proteinG: planData.proteinG || 150,
        carbsG: planData.carbsG || 200,
        fatG: planData.fatG || 70,
        meals: {
          create: (planData.meals || []).map((meal: any) => ({
            name: meal.name,
            timeOfDay: meal.timeOfDay,
            calories: meal.calories,
            proteinG: meal.proteinG || 0,
            carbsG: meal.carbsG || 0,
            fatG: meal.fatG || 0,
            foods: {
              create: (meal.foods || []).map((food: any) => ({
                name: food.name,
                quantityG: food.quantityG,
                calories: food.calories,
                proteinG: food.proteinG || 0,
                carbsG: food.carbsG || 0,
                fatG: food.fatG || 0,
                alternatives: food.alternatives || [],
              })),
            },
          })),
        },
      },
      include: { meals: { include: { foods: true } } },
    });
  }

  async savePlanFromText(userId: string, text: string) {
    const planData = await this.agentsService.extractNutritionFromText(text);

    const existing = await this.prisma.nutritionPlan.findUnique({ where: { userId } });
    if (existing) {
      await this.prisma.nutritionPlan.delete({ where: { userId } });
    }

    return this.prisma.nutritionPlan.create({
      data: {
        userId,
        calories: planData.calories || 2000,
        proteinG: planData.proteinG || 150,
        carbsG: planData.carbsG || 200,
        fatG: planData.fatG || 70,
        meals: {
          create: (planData.meals || []).map((meal: any) => ({
            name: meal.name,
            timeOfDay: meal.timeOfDay,
            calories: meal.calories,
            proteinG: meal.proteinG || 0,
            carbsG: meal.carbsG || 0,
            fatG: meal.fatG || 0,
            foods: {
              create: (meal.foods || []).map((food: any) => ({
                name: food.name,
                quantityG: food.quantityG,
                calories: food.calories,
                proteinG: food.proteinG || 0,
                carbsG: food.carbsG || 0,
                fatG: food.fatG || 0,
                alternatives: food.alternatives || [],
              })),
            },
          })),
        },
      },
      include: { meals: { include: { foods: true } } },
    });
  }

  async getPlan(userId: string) {
    return this.prisma.nutritionPlan.findUnique({
      where: { userId },
      include: { meals: { include: { foods: true } } },
    });
  }

  async logMeal(
    userId: string,
    data: {
      mealName: string;
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      notes?: string;
    },
  ) {
    return this.prisma.mealLog.create({ data: { userId, ...data } });
  }

  async getDailyLog(userId: string, date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return this.prisma.mealLog.findMany({
      where: { userId, loggedAt: { gte: start, lte: end } },
      orderBy: { loggedAt: 'asc' },
    });
  }
}
