import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
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

const MODEL = 'gemini-2.5-flash';

@Injectable()
export class AgentsService {
  private genAI: GoogleGenerativeAI;

  constructor(
    private prisma: PrismaService,
    private memoryService: MemoryService,
  ) {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  }

  private getModel(params: Parameters<GoogleGenerativeAI['getGenerativeModel']>[0]) {
    return this.genAI.getGenerativeModel(params);
  }

  async buildContext(userId: string, agentType: AgentType): Promise<string> {
    const needsEvaluatorMemories = agentType === AgentType.TRAINER || agentType === AgentType.NUTRITIONIST;

    const [profile, memories, recentProgress, evaluatorMemories] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.memoryService.getRelevantMemories(userId, agentType, needsEvaluatorMemories ? 8 : 10),
      this.prisma.progressLog.findMany({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
        take: 3,
      }),
      needsEvaluatorMemories
        ? this.memoryService.getRelevantMemories(userId, AgentType.EVALUATOR, 3)
        : Promise.resolve([]),
    ]);

    const parts: string[] = [];

    if (profile) {
      const genderLabel = profile.genderIdentity === 'MALE' ? 'Masculino'
        : profile.genderIdentity === 'FEMALE' ? 'Feminino'
        : profile.genderIdentity === 'OTHER' ? 'Outro'
        : 'Não informado';

      parts.push(`
=== PERFIL DO USUÁRIO ===
- Sexo: ${genderLabel}
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

    if (needsEvaluatorMemories && evaluatorMemories.length > 0) {
      parts.push(`
=== AVALIAÇÃO CORPORAL (Dr. Shape) ===
${evaluatorMemories.map((m) => `[${m.type}] ${m.content}`).join('\n')}
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

  async *streamChat(
    userId: string,
    agentType: AgentType,
    messages: Array<{ role: 'user' | 'assistant'; content: string | Array<any> }>,
  ): AsyncGenerator<string> {
    const context = await this.buildContext(userId, agentType);
    const systemPrompt = SYSTEM_PROMPTS[agentType];

    const model = this.getModel({
      model: MODEL,
      systemInstruction: systemPrompt + (context ? `\n\n${context}` : ''),
    });

    // Convert history (all messages except the last one) to Gemini format
    const historyMessages = messages.slice(0, -1);
    const history = historyMessages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: this.convertContentToParts(m.content),
    }));

    const chat = model.startChat({ history });

    // Build parts for the last (current) message
    const lastMsg = messages[messages.length - 1];
    const lastParts = this.convertContentToParts(lastMsg.content);

    const result = await chat.sendMessageStream(lastParts);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }

  private convertContentToParts(content: string | Array<any>): Part[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }
    return content.map((c: any) => {
      if (c.type === 'text') {
        return { text: c.text } as Part;
      }
      if (c.type === 'image') {
        // Anthropic format: source.media_type, source.data
        return {
          inlineData: {
            mimeType: c.source?.media_type || c.mimeType || 'image/jpeg',
            data: c.source?.data || c.data || '',
          },
        } as Part;
      }
      return { text: '' } as Part;
    });
  }

  async extractWorkoutFromText(text: string): Promise<any> {
    const model = this.getModel({
      model: MODEL,
      systemInstruction: `Você recebe a descrição de um plano de treino em texto e deve convertê-la para JSON estruturado.
Responda APENAS com JSON válido neste formato exato:
{
  "name": "Nome do plano",
  "description": "Descrição curta",
  "sessions": [{
    "name": "Treino A — Peito e Tríceps",
    "dayOfWeek": 1,
    "muscleGroups": ["peito","tríceps"],
    "estimatedTime": 60,
    "exercises": [{
      "order": 1,
      "name": "Supino Reto",
      "sets": 4,
      "reps": "8-12",
      "restSeconds": 90,
      "notes": "dica opcional"
    }]
  }]
}
Inferir valores faltantes com base em boas práticas. Sem markdown, apenas JSON puro.`,
    });

    const result = await model.generateContent(`Converta este plano de treino para JSON:\n\n${text}`);
    const raw = this.safeResponseText(result.response);
    return this.extractJson(raw);
  }

  async extractNutritionFromText(text: string): Promise<any> {
    const model = this.getModel({
      model: MODEL,
      systemInstruction: `Você recebe a descrição de um plano alimentar em texto e deve convertê-la para JSON estruturado.
Responda APENAS com JSON válido neste formato exato:
{
  "calories": 2200,
  "proteinG": 160,
  "carbsG": 220,
  "fatG": 73,
  "meals": [{
    "name": "Café da Manhã",
    "timeOfDay": "breakfast",
    "calories": 450,
    "proteinG": 30,
    "carbsG": 55,
    "fatG": 10,
    "foods": [{
      "name": "Aveia",
      "quantityG": 80,
      "calories": 300,
      "proteinG": 10,
      "carbsG": 54,
      "fatG": 6,
      "alternatives": ["granola"]
    }]
  }]
}
Inferir valores nutricionais com base em boas práticas. Sem markdown, apenas JSON puro.`,
    });

    const result = await model.generateContent(`Converta este plano alimentar para JSON:\n\n${text}`);
    const raw = this.safeResponseText(result.response);
    return this.extractJson(raw);
  }

  private extractJson(text: string): any {
    // Strip markdown code fences
    let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    // Try direct parse first
    try {
      return JSON.parse(clean);
    } catch {
      // Find the first { or [ and last } or ]
      const start = clean.search(/[\[{]/);
      const end = Math.max(clean.lastIndexOf('}'), clean.lastIndexOf(']'));
      if (start !== -1 && end !== -1 && end > start) {
        try {
          return JSON.parse(clean.slice(start, end + 1));
        } catch {
          // nothing
        }
      }
      throw new Error(`Invalid JSON from model: ${clean.slice(0, 200)}`);
    }
  }

  async generateWorkoutPlan(userId: string) {
    console.log(`[generateWorkoutPlan] start userId=${userId} model=${MODEL}`);
    const context = await this.buildContext(userId, AgentType.TRAINER);

    const model = this.getModel({
      model: MODEL,
      systemInstruction: WORKOUT_GENERATION_PROMPT,
    });

    const result = await model.generateContent(
      `${context}\n\nCrie um plano de treino semanal completo e personalizado para este usuário. Responda APENAS com o JSON.`,
    );

    const text = this.safeResponseText(result.response);
    console.log(`[generateWorkoutPlan] response length=${text.length} preview=${text.slice(0, 100)}`);
    return this.extractJson(text);
  }

  async generateNutritionPlan(userId: string) {
    console.log(`[generateNutritionPlan] start userId=${userId} model=${MODEL}`);
    const context = await this.buildContext(userId, AgentType.NUTRITIONIST);

    const model = this.getModel({
      model: MODEL,
      systemInstruction: NUTRITION_GENERATION_PROMPT,
    });

    const result = await model.generateContent(
      `${context}\n\nCrie um plano alimentar diário completo e personalizado para este usuário. Responda APENAS com o JSON.`,
    );

    const text = this.safeResponseText(result.response);
    console.log(`[generateNutritionPlan] response length=${text.length} preview=${text.slice(0, 100)}`);
    return this.extractJson(text);
  }

  private safeResponseText(response: any): string {
    try {
      return response.text();
    } catch (e) {
      const candidate = response?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const parts = candidate?.content?.parts;
      if (parts?.length > 0) return parts.map((p: any) => p.text || '').join('');
      throw new Error(`Gemini blocked response (finishReason: ${finishReason}): ${JSON.stringify(candidate?.safetyRatings)}`);
    }
  }
}
