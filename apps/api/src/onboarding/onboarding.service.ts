import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { FitnessGoal, FitnessLevel } from '@prisma/client';

export interface OnboardingAnswers {
  age?: number;
  weightKg?: number;
  heightCm?: number;
  genderIdentity?: string;
  fitnessGoal?: FitnessGoal;
  fitnessLevel?: FitnessLevel;
  workoutsPerWeek?: number;
  workoutDuration?: number;
  injuries?: string[];
  dietaryRestrictions?: string[];
  foodPreferences?: string[];
  availableEquipment?: string[];
  dailyRoutine?: object;
}

@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}

  async getStatus(userId: string) {
    return this.prisma.onboarding.findUnique({ where: { userId } });
  }

  async saveAnswers(userId: string, step: number, answers: OnboardingAnswers) {
    const existing = await this.prisma.onboarding.findUnique({ where: { userId } });
    const mergedAnswers = { ...(existing?.answers as object || {}), ...answers };

    return this.prisma.onboarding.update({
      where: { userId },
      data: { currentStep: step, answers: mergedAnswers },
    });
  }

  async complete(userId: string, finalAnswers: OnboardingAnswers) {
    const {
      age,
      weightKg,
      heightCm,
      genderIdentity,
      fitnessGoal = FitnessGoal.GENERAL_FITNESS,
      fitnessLevel = FitnessLevel.BEGINNER,
      workoutsPerWeek = 3,
      workoutDuration = 60,
      injuries = [],
      dietaryRestrictions = [],
      foodPreferences = [],
      availableEquipment = [],
      dailyRoutine,
    } = finalAnswers;

    await this.prisma.$transaction([
      this.prisma.onboarding.update({
        where: { userId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          answers: finalAnswers as any,
        },
      }),
      this.prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          age: age!,
          weightKg: weightKg!,
          heightCm: heightCm!,
          genderIdentity,
          fitnessGoal,
          fitnessLevel,
          workoutsPerWeek,
          workoutDuration,
          injuries,
          dietaryRestrictions,
          foodPreferences,
          availableEquipment,
          dailyRoutine,
        },
        update: {
          age: age!,
          weightKg: weightKg!,
          heightCm: heightCm!,
          genderIdentity,
          fitnessGoal,
          fitnessLevel,
          workoutsPerWeek,
          workoutDuration,
          injuries,
          dietaryRestrictions,
          foodPreferences,
          availableEquipment,
          dailyRoutine,
        },
      }),
    ]);

    return { success: true };
  }
}
