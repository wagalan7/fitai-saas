import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
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

const CHAT_MODEL = 'llama-3.3-70b-versatile';   // chat streaming — no think tags, Portuguese-native
const GEN_MODEL = 'qwen/qwen3-32b';              // generation — better JSON instruction following
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

@Injectable()
export class AgentsService {
  private groq: Groq;

  constructor(
    private prisma: PrismaService,
    private memoryService: MemoryService,
  ) {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        const msg = err?.message || '';
        const isRetryable = msg.includes('503') || msg.includes('529') || msg.includes('rate') || msg.includes('overloaded');
        if (isRetryable && i < retries - 1) {
          console.log(`[retry] attempt ${i + 1} failed, retrying in ${delayMs}ms...`);
          await new Promise((r) => setTimeout(r, delayMs));
          delayMs *= 2;
        } else {
          throw err;
        }
      }
    }
    throw new Error('Max retries exceeded');
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

    // Detect if any message has images
    const hasImages = messages.some(
      (m) => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image'),
    );
    const model = hasImages ? VISION_MODEL : CHAT_MODEL;

    const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt + (context ? `\n\n${context}` : ''),
      },
      ...messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: this.convertContent(m.content),
      })),
    ];

    const stream = await this.groq.chat.completions.create({
      model,
      messages: groqMessages,
      stream: true,
      max_tokens: 2048,
    });

    let inThink = false;
    let thinkBuf = '';
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (!text) continue;
      // Filter out <think>...</think> blocks in real time
      let out = '';
      for (let i = 0; i < text.length; i++) {
        thinkBuf += text[i];
        if (!inThink && thinkBuf.endsWith('<think>')) { inThink = true; thinkBuf = ''; continue; }
        if (inThink && thinkBuf.endsWith('</think>')) { inThink = false; thinkBuf = ''; continue; }
        if (!inThink && thinkBuf.length > 8) { out += thinkBuf[0]; thinkBuf = thinkBuf.slice(1); }
      }
      if (!inThink && thinkBuf && thinkBuf.length > 0 && !thinkBuf.startsWith('<')) {
        out += thinkBuf; thinkBuf = '';
      }
      if (out) yield out;
    }
    if (!inThink && thinkBuf) yield thinkBuf;
  }

  private convertContent(content: string | Array<any>): any {
    if (typeof content === 'string') return content;

    const parts: any[] = [];
    for (const c of content) {
      if (c.type === 'text') {
        parts.push({ type: 'text', text: c.text });
      } else if (c.type === 'image') {
        const mimeType = c.source?.media_type || c.mimeType || 'image/jpeg';
        const data = c.source?.data || c.data || '';
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${data}` },
        });
      }
    }
    return parts;
  }

  async extractWorkoutFromText(text: string): Promise<any> {
    const completion = await this.groq.chat.completions.create({
      model: GEN_MODEL,
      messages: [
        {
          role: 'system',
          content: `Você recebe a descrição de um plano de treino em texto e deve convertê-la para JSON estruturado.
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
        },
        { role: 'user', content: `Converta este plano de treino para JSON:\n\n${text}` },
      ],
      max_tokens: 4096,
    });

    const raw = completion.choices[0]?.message?.content || '';
    return this.extractJson(raw);
  }

  async extractNutritionFromText(text: string): Promise<any> {
    const completion = await this.groq.chat.completions.create({
      model: GEN_MODEL,
      messages: [
        {
          role: 'system',
          content: `Você recebe a descrição de um plano alimentar em texto e deve convertê-la para JSON estruturado.
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
        },
        { role: 'user', content: `Converta este plano alimentar para JSON:\n\n${text}` },
      ],
      max_tokens: 4096,
    });

    const raw = completion.choices[0]?.message?.content || '';
    return this.extractJson(raw);
  }

  private stripThinkTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  private extractJson(text: string): any {
    let clean = this.stripThinkTags(text)
      .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch {
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
    console.log(`[generateWorkoutPlan] start userId=${userId} model=${GEN_MODEL}`);
    const context = await this.buildContext(userId, AgentType.TRAINER);

    const completion = await this.withRetry(() =>
      this.groq.chat.completions.create({
        model: GEN_MODEL,
        messages: [
          { role: 'system', content: WORKOUT_GENERATION_PROMPT },
          {
            role: 'user',
            content: `${context}\n\nCrie um plano de treino semanal completo e personalizado para este usuário. Responda APENAS com o JSON.`,
          },
        ],
        max_tokens: 4096,
      }),
    );

    const text = completion.choices[0]?.message?.content || '';
    console.log(`[generateWorkoutPlan] response length=${text.length} preview=${text.slice(0, 100)}`);
    return this.extractJson(text);
  }

  async generateNutritionPlan(userId: string) {
    console.log(`[generateNutritionPlan] start userId=${userId} model=${GEN_MODEL}`);
    const context = await this.buildContext(userId, AgentType.NUTRITIONIST);

    const completion = await this.withRetry(() =>
      this.groq.chat.completions.create({
        model: GEN_MODEL,
        messages: [
          { role: 'system', content: NUTRITION_GENERATION_PROMPT },
          {
            role: 'user',
            content: `${context}\n\nCrie um plano alimentar diário completo e personalizado para este usuário. Responda APENAS com o JSON.`,
          },
        ],
        max_tokens: 4096,
      }),
    );

    const text = completion.choices[0]?.message?.content || '';
    console.log(`[generateNutritionPlan] response length=${text.length} preview=${text.slice(0, 100)}`);
    return this.extractJson(text);
  }
}
