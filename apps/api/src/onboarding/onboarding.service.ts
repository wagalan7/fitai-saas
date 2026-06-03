import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AgentType, FitnessGoal, FitnessLevel } from '@prisma/client';
import { AgentsService } from '../agents/agents.service';
import { ChatService } from '../chat/chat.service';
import { MemoryService } from '../memory/memory.service';

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
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private prisma: PrismaService,
    private agentsService: AgentsService,
    private chatService: ChatService,
    private memoryService: MemoryService,
  ) {}

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

  /**
   * Initial Dr Shape evaluation, run during onboarding. Creates an EVALUATOR
   * chat session with the photo(s) + AI analysis so it shows up in the
   * regular history later. Sets `firstEvaluationAt` so any future "user
   * needs evaluation" guard can short-circuit. Fires memory extraction in
   * the background — TRAINER and NUTRITIONIST prompts pull EVALUATOR
   * memories via `buildContext`, so future plan generations get the
   * physical-assessment signal automatically.
   */
  async runInitialEvaluation(
    userId: string,
    images: Array<{ data: string; mimeType?: string }>,
    notes?: string,
  ): Promise<{ evaluation: string; sessionId: string }> {
    if (!images?.length) {
      throw new BadRequestException('Pelo menos uma foto é necessária para a avaliação.');
    }
    // Defensive cap so a malicious client can't burn quota with 50 images.
    const capped = images.slice(0, 6);

    const session = await this.chatService.createSession(
      userId,
      AgentType.EVALUATOR,
      'Avaliação inicial',
    );

    const userText = `[${capped.length} foto${capped.length > 1 ? 's' : ''} enviada${capped.length > 1 ? 's' : ''}] ${
      notes?.trim() ? notes.trim() : 'Avaliação inicial durante onboarding.'
    }`;
    await this.chatService.saveMessage(session.id, 'USER', userText);

    let evaluation: string;
    try {
      evaluation = await this.agentsService.evaluateOnce(userId, capped, notes);
    } catch (err: any) {
      this.logger.warn(`Initial evaluation failed for user=${userId}: ${err?.message}`);
      // Persist a fallback assistant message so the session isn't half-broken.
      const fallback =
        'Não consegui analisar as fotos agora — a IA está sobrecarregada. Você pode refazer a avaliação no Dr Shape mais tarde.';
      await this.chatService.saveMessage(session.id, 'ASSISTANT', fallback, AgentType.EVALUATOR);
      throw new BadRequestException(
        'A avaliação falhou. Você pode pular esta etapa e fazer depois pelo Dr Shape.',
      );
    }

    await this.chatService.saveMessage(session.id, 'ASSISTANT', evaluation, AgentType.EVALUATOR);

    // Mark on the profile so the dashboard / future guards know this user
    // has at least one evaluation. Update is no-op if profile doesn't exist
    // yet (shouldn't happen — onboarding/complete runs first).
    await this.prisma.userProfile
      .update({
        where: { userId },
        data: { firstEvaluationAt: new Date() },
      })
      .catch((err) => this.logger.warn(`firstEvaluationAt update skipped: ${err?.message}`));

    // Background memory extraction so TRAINER/NUTRITIONIST can pull this on
    // their next context build. Intentionally not awaited — adds ~3s otherwise.
    this.memoryService
      .extractMemoriesFromConversation(userId, AgentType.EVALUATOR, userText, evaluation)
      .catch((err) => this.logger.warn(`memory extraction failed: ${err?.message}`));

    return { evaluation, sessionId: session.id };
  }

  /**
   * Mark "evaluation skipped" without actually running the agent. Lets the
   * user move on, but the dashboard remains free to nudge them later.
   * We do NOT set firstEvaluationAt — null still means "never evaluated".
   */
  async skipInitialEvaluation(userId: string): Promise<{ skipped: true }> {
    this.logger.log(`User ${userId} skipped the initial Dr Shape evaluation.`);
    return { skipped: true };
  }
}
