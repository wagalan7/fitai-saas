import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AgentType } from '@prisma/client';
import { TRAINER_SYSTEM_PROMPT } from './prompts/trainer.prompt';
import { NUTRITIONIST_SYSTEM_PROMPT } from './prompts/nutritionist.prompt';
import { WORKOUT_GENERATION_PROMPT, NUTRITION_GENERATION_PROMPT } from './prompts/generation.prompt';
import { COACH_SYSTEM_PROMPT } from './prompts/coach.prompt';
import { ANALYST_SYSTEM_PROMPT } from './prompts/analyst.prompt';
import { EVALUATOR_SYSTEM_PROMPT } from './prompts/evaluator.prompt';
import { MemoryService } from '../memory/memory.service';
import { PrismaService } from '../common/prisma.service';

const SYSTEM_PROMPTS: Record<AgentType, string> = {
  TRAINER: TRAINER_SYSTEM_PROMPT,
  NUTRITIONIST: NUTRITIONIST_SYSTEM_PROMPT,
  COACH: COACH_SYSTEM_PROMPT,
  ANALYST: ANALYST_SYSTEM_PROMPT,
  EVALUATOR: EVALUATOR_SYSTEM_PROMPT,
  SYSTEM: '',
};

const MODEL = 'claude-sonnet-4-6';

@Injectable()
export class AgentsService {
  private anthropic: Anthropic;

  constructor(
    private prisma: PrismaService,
    private memoryService: MemoryService,
  ) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async buildContext(userId: string, agentType: AgentType): Promise<string> {
    const [profile, memories, recentProgress] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.memoryService.getRelevantMemories(userId, agentType, 10),
      this.prisma.progressLog.findMany({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
        take: 3,
      }),
    ]);

    const parts: string[] = [];

    if (profile) {
      parts.push(`
=== PERFIL DO USUÁRIO ===
- Idade: ${profile.age} anos
- Peso atual: ${profile.weightKg}kg | Altura: ${profile.heightCm}cm
- IMC: ${(profile.weightKg / Math.pow(profile.heightCm / 100, 2)).toFixed(1)}
- Objetivo: ${profile.fitnessGoal}
- Nível de treino: ${profile.fitnessLevel}
- Treinos/semana: ${profile.workoutsPerWeek}x de ~${profile.workoutDuration}min
- Lesões/restrições: ${profile.injuries.join(', ') || 'nenhuma'}
- Restrições alimentares: ${profile.dietaryRestrictions.join(', ') || 'nenhuma'}
- Preferências alimentares: ${profile.foodPreferences.join(', ') || 'não informado'}
- Equipamentos disponíveis: ${profile.availableEquipment.join(', ') || 'não informado'}
`);
    }

    if (memories.length > 0) {
      parts.push(`
=== MEMÓRIAS RELEVANTES ===
${memories.map((m) => `[${m.type}] ${m.content}`).join('\n')}
`);
    }

    if (recentProgress.length > 0) {
      parts.push(`
=== PROGRESSO RECENTE ===
${recentProgress
  .map(
    (p) =>
      `${p.loggedAt.toLocaleDateString('pt-BR')}: ${p.weightKg ? `${p.weightKg}kg` : ''} ${p.notes || ''}`,
  )
  .join('\n')}
`);
    }

    return parts.join('\n');
  }

  async streamChat(
    userId: string,
    agentType: AgentType,
    messages: Array<{ role: 'user' | 'assistant'; content: string | Array<any> }>,
  ) {
    const context = await this.buildContext(userId, agentType);
    const systemPrompt = SYSTEM_PROMPTS[agentType];

    return this.anthropic.messages.stream({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt + (context ? `\n\n${context}` : ''),
      messages,
    });
  }

  async generateWorkoutPlan(userId: string) {
    const context = await this.buildContext(userId, AgentType.TRAINER);

    const response = await this.anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: WORKOUT_GENERATION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${context}\n\nCrie um plano de treino semanal completo e personalizado para este usuário.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  }

  async generateNutritionPlan(userId: string) {
    const context = await this.buildContext(userId, AgentType.NUTRITIONIST);

    const response = await this.anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: NUTRITION_GENERATION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${context}\n\nCrie um plano alimentar diário completo e personalizado para este usuário.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  }
}
