import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { AgentsService } from '../agents/agents.service';
import {
  computeTitration,
  retargetMacros,
  type FitnessGoal,
} from './diet-titration';

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

  /**
   * Today's macro adherence vs the active plan — powers the traffic-light card.
   * "Today" is resolved in the user's timezone (the server runs in UTC, so a
   * naive server-midnight window would clip late-night logs for BR users).
   *
   * Status per macro: 'low' (amber — still short), 'on' (green — within band),
   * 'over' (red — past the ceiling). Protein has no ceiling (more is fine), so
   * it only goes low → on.
   */
  async getTodayAdherence(userId: string) {
    const [plan, profile] = await Promise.all([
      this.prisma.nutritionPlan.findFirst({
        where: { userId, isActive: true },
        select: { calories: true, proteinG: true, carbsG: true, fatG: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: { timezone: true },
      }),
    ]);

    if (!plan) {
      return { hasPlan: false };
    }

    const tz = profile?.timezone || 'America/Sao_Paulo';
    const now = new Date();
    const since = new Date(now.getTime() - 2 * 86_400_000);
    const logs = await this.prisma.mealLog.findMany({
      where: { userId, loggedAt: { gte: since } },
      select: { calories: true, proteinG: true, carbsG: true, fatG: true, loggedAt: true },
    });

    const todayKey = this.localDayKey(now, tz);
    const today = logs.filter((l) => this.localDayKey(l.loggedAt, tz) === todayKey);

    const consumed = today.reduce(
      (acc, l) => ({
        calories: acc.calories + (l.calories || 0),
        proteinG: acc.proteinG + (l.proteinG || 0),
        carbsG: acc.carbsG + (l.carbsG || 0),
        fatG: acc.fatG + (l.fatG || 0),
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    // Ceiling macros (calories/carbs/fat): over the top band = red.
    const ceilStatus = (got: number, target: number) => {
      if (!target) return 'on';
      const r = got / target;
      if (r > 1.1) return 'over';
      if (r >= 0.85) return 'on';
      return 'low';
    };
    // Floor macro (protein): hitting the target is the goal, more is fine.
    const floorStatus = (got: number, target: number) => {
      if (!target) return 'on';
      return got / target >= 0.85 ? 'on' : 'low';
    };

    const pct = (got: number, target: number) =>
      target ? Math.round((got / target) * 100) : 0;

    return {
      hasPlan: true,
      mealsLogged: today.length,
      target: {
        calories: plan.calories,
        proteinG: plan.proteinG,
        carbsG: plan.carbsG,
        fatG: plan.fatG,
      },
      consumed: {
        calories: Math.round(consumed.calories),
        proteinG: Math.round(consumed.proteinG),
        carbsG: Math.round(consumed.carbsG),
        fatG: Math.round(consumed.fatG),
      },
      pct: {
        calories: pct(consumed.calories, plan.calories),
        proteinG: pct(consumed.proteinG, plan.proteinG),
        carbsG: pct(consumed.carbsG, plan.carbsG),
        fatG: pct(consumed.fatG, plan.fatG),
      },
      status: {
        calories: ceilStatus(consumed.calories, plan.calories),
        proteinG: floorStatus(consumed.proteinG, plan.proteinG),
        carbsG: ceilStatus(consumed.carbsG, plan.carbsG),
        fatG: ceilStatus(consumed.fatG, plan.fatG),
      },
    };
  }

  /**
   * Diet auto-titration: reads the active plan, the user's goal, and ~21 days
   * of logged body weight, and returns a calorie-adjustment recommendation
   * (drop/raise/hold) based on whether the weight trend matches the goal band.
   * Returns { hasPlan: false } when there's no active plan to adjust.
   */
  async getDietAdjustment(userId: string) {
    const [plan, profile, weights] = await Promise.all([
      this.prisma.nutritionPlan.findFirst({
        where: { userId, isActive: true },
        select: { calories: true, proteinG: true, carbsG: true, fatG: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: { fitnessGoal: true },
      }),
      this.prisma.progressLog.findMany({
        where: {
          userId,
          weightKg: { not: null },
          loggedAt: { gte: new Date(Date.now() - 21 * 86_400_000) },
        },
        select: { weightKg: true, loggedAt: true },
        orderBy: { loggedAt: 'asc' },
      }),
    ]);

    if (!plan) return { hasPlan: false as const };

    const titration = computeTitration({
      goal: (profile?.fitnessGoal as FitnessGoal) ?? 'GENERAL_FITNESS',
      currentCalories: plan.calories,
      weights: weights.map((w) => ({ weightKg: w.weightKg as number, loggedAt: w.loggedAt })),
    });

    return {
      hasPlan: true as const,
      currentCalories: plan.calories,
      goal: (profile?.fitnessGoal as FitnessGoal) ?? 'GENERAL_FITNESS',
      ...titration,
    };
  }

  /**
   * Applies a calorie titration to the active plan. Uses the recommended delta
   * unless an explicit one is passed (clamped to ±300 kcal, never below a safe
   * floor). Keeps protein fixed; carbs + fat absorb the change. Only the plan
   * targets are updated — the meals stay as a reference until regenerated.
   */
  async applyDietAdjustment(userId: string, deltaKcal?: number) {
    const plan = await this.prisma.nutritionPlan.findFirst({
      where: { userId, isActive: true },
      select: { id: true, calories: true, proteinG: true, carbsG: true, fatG: true },
    });
    if (!plan) {
      throw new BadRequestException('Nenhum plano alimentar ativo para ajustar. Gere um plano primeiro.');
    }

    let delta: number;
    if (typeof deltaKcal === 'number' && Number.isFinite(deltaKcal)) {
      delta = Math.max(-300, Math.min(300, Math.round(deltaKcal)));
    } else {
      const rec = await this.getDietAdjustment(userId);
      delta = 'recommendDeltaKcal' in rec ? rec.recommendDeltaKcal : 0;
    }

    if (!delta) {
      throw new BadRequestException('Sem ajuste a aplicar: a tendência de peso está dentro do alvo.');
    }

    const newCalories = Math.max(1200, plan.calories + delta);
    const macros = retargetMacros(plan, newCalories);

    return this.prisma.nutritionPlan.update({
      where: { id: plan.id },
      data: {
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
      },
      include: { meals: { include: { foods: true } } },
    });
  }

  /** YYYY-MM-DD for a moment in the given IANA timezone. */
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
