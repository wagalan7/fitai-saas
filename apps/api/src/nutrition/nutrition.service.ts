import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { AgentsService } from '../agents/agents.service';

const saveDedupCache = new Map<string, { result: Promise<any>; ts: number }>();
const DEDUP_TTL_MS = 60_000;

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
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const key = `${userId}:${hash}`;
    const now = Date.now();
    const cached = saveDedupCache.get(key);
    if (cached && now - cached.ts < DEDUP_TTL_MS) {
      console.log(`[savePlanFromText:nutrition] dedup hit key=${key}`);
      return cached.result;
    }

    const promise = this._savePlanFromText(userId, text);
    saveDedupCache.set(key, { result: promise, ts: now });
    promise.catch(() => saveDedupCache.delete(key));
    if (saveDedupCache.size > 200) {
      for (const [k, v] of saveDedupCache) {
        if (now - v.ts > DEDUP_TTL_MS) saveDedupCache.delete(k);
      }
    }
    return promise;
  }

  private async _savePlanFromText(userId: string, text: string) {
    let planData: any;
    try {
      planData = await this.agentsService.extractNutritionFromText(text);
    } catch (err: any) {
      throw new BadRequestException(
        'Não foi possível identificar um plano alimentar nessa mensagem. Peça à Nutricionista para criar um plano com refeições e macros detalhados.',
      );
    }

    if (!planData?.meals?.length) {
      throw new BadRequestException(
        'O plano extraído está vazio. Peça à Nutricionista para descrever o plano com refeições específicas.',
      );
    }

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
