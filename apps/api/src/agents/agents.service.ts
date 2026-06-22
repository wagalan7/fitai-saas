import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import { AgentType } from '@prisma/client';
import { TRAINER_SYSTEM_PROMPT } from './prompts/trainer.prompt';
import { NUTRITIONIST_SYSTEM_PROMPT } from './prompts/nutritionist.prompt';
import {
  WORKOUT_GENERATION_PROMPT,
  WORKOUT_SKELETON_PROMPT,
  WORKOUT_SESSION_EXPANSION_PROMPT,
  NUTRITION_GENERATION_PROMPT,
} from './prompts/generation.prompt';
import { COACH_SYSTEM_PROMPT } from './prompts/coach.prompt';
import { ANALYST_SYSTEM_PROMPT } from './prompts/analyst.prompt';
import { EVALUATOR_SYSTEM_PROMPT } from './prompts/evaluator.prompt';
import { MemoryService } from '../memory/memory.service';
import { PrismaService } from '../common/prisma.service';
import { computeNutritionTargets } from '../nutrition/nutrition-math';

const SYSTEM_PROMPTS: Record<AgentType, string> = {
  TRAINER: TRAINER_SYSTEM_PROMPT,
  NUTRITIONIST: NUTRITIONIST_SYSTEM_PROMPT,
  COACH: COACH_SYSTEM_PROMPT,
  ANALYST: ANALYST_SYSTEM_PROMPT,
  EVALUATOR: EVALUATOR_SYSTEM_PROMPT,
  SYSTEM: '',
};

const CHAT_MODEL = 'llama-3.3-70b-versatile';      // chat streaming — no think tags, Portuguese-native
const GEN_MODEL = 'llama-3.3-70b-versatile';      // plan generation — same model, reliable JSON + no think tags
// Extraction was on 8b-instant (6k TPM on free tier) which silently 413'd
// for full-week workout plans (~8k+ tokens). Switched to the same 70b model
// we use for generation — higher TPM, native JSON mode, costs ~2s more.
const EXTRACT_MODEL = 'llama-3.3-70b-versatile';
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
        // 413 = TPM rate limit on Groq (counted as "request too large"),
        // 429 = generic rate limit, 503/529 = overload. All transient.
        const isRetryable =
          msg.includes('503') ||
          msg.includes('529') ||
          msg.includes('429') ||
          msg.includes('413') ||
          msg.includes('rate') ||
          msg.includes('overloaded');
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

  /**
   * Builds the per-exercise load history block — the single most important
   * piece of context for making the trainer behave like a real coach instead
   * of a plan generator. For every exercise the user has actually logged, we
   * surface the most recent top working set (heaviest weight + its reps/RPE)
   * so pass 2 can carry the load forward and apply progressive overload.
   *
   * Returns '' when the user has no logged history yet (new user) — the prompt
   * falls back to RIR-based starting-load guidance in that case.
   */
  async buildTrainingHistory(userId: string): Promise<string> {
    const logs = await this.prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: 20,
      include: { exerciseLogs: { include: { sets: true } } },
    });
    if (!logs.length) return '';

    // logs are newest-first, so the first time we see an exercise name is its
    // most recent performance — keep that one, ignore older repeats.
    type Top = { name: string; date: Date; weight: number | null; reps: number | null; rpe: number | null };
    const byExercise = new Map<string, Top>();

    for (const log of logs) {
      for (const el of log.exerciseLogs) {
        const key = el.exerciseName.trim().toLowerCase();
        if (!key || byExercise.has(key)) continue;
        // Top working set = heaviest weight logged for this exercise that day.
        let top: { weightKg: number | null; reps: number | null; rpe: number | null } | null = null;
        for (const s of el.sets) {
          if (s.weightKg == null && s.reps == null) continue;
          if (!top || (s.weightKg ?? 0) > (top.weightKg ?? 0)) {
            top = { weightKg: s.weightKg, reps: s.reps, rpe: s.rpe };
          }
        }
        if (!top) continue;
        byExercise.set(key, {
          name: el.exerciseName.trim(),
          date: log.completedAt,
          weight: top.weightKg,
          reps: top.reps,
          rpe: top.rpe,
        });
      }
    }

    if (!byExercise.size) return '';

    const now = Date.now();
    const daysAgo = (d: Date) => {
      const n = Math.round((now - d.getTime()) / 86_400_000);
      return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `${n} dias atrás`;
    };

    const lines = Array.from(byExercise.values())
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 30)
      .map((e) => {
        const w = e.weight != null ? `${e.weight}kg` : 'peso corporal';
        const r = e.reps != null ? ` × ${e.reps} reps` : '';
        const rpe = e.rpe != null ? `, RPE ${e.rpe}` : '';
        return `- ${e.name}: ${w}${r}${rpe} — ${daysAgo(e.date)}`;
      });

    return `=== HISTÓRICO DE CARGAS (último registro real do aluno por exercício) ===\n${lines.join('\n')}`;
  }

  /**
   * Builds the hard-constraints block — injuries and available equipment — used
   * by workout generation. Unlike the general profile context (which the model
   * treats as soft background), this block is phrased as non-negotiable safety
   * rules and is injected into BOTH passes, including pass 2 (session expansion)
   * which is the step that actually picks exercises and otherwise never sees the
   * user's limitations.
   *
   * Returns '' when there's nothing to constrain (no injuries AND no equipment
   * specified) so a full-gym, injury-free user pays no prompt-token cost.
   */
  private buildSafetyBlock(
    profile: { injuries?: string[]; availableEquipment?: string[] } | null,
  ): string {
    if (!profile) return '';
    const clean = (arr?: string[]) =>
      (arr || [])
        .map((s) => (s || '').trim())
        .filter(
          (s) =>
            s &&
            !['nenhuma', 'nenhum', 'não informado', 'nao informado', 'n/a'].includes(
              s.toLowerCase(),
            ),
        );
    const injuries = clean(profile.injuries);
    const equipment = clean(profile.availableEquipment);
    if (!injuries.length && !equipment.length) return '';

    const lines: string[] = [
      '=== RESTRIÇÕES OBRIGATÓRIAS (SEGURANÇA — prioridade sobre TODA outra regra) ===',
    ];
    if (injuries.length) {
      lines.push(`LESÕES/LIMITAÇÕES: ${injuries.join(', ')}`);
      lines.push(
        '→ Contraindicação ABSOLUTA: não prescreva exercícios que sobrecarreguem essas regiões. Substitua por variações seguras do mesmo grupo e explique a adaptação em "notes".',
      );
    }
    if (equipment.length) {
      lines.push(`EQUIPAMENTO DISPONÍVEL: ${equipment.join(', ')}`);
      lines.push(
        '→ Use SOMENTE exercícios executáveis com esse equipamento. Não prescreva máquina/polia/barra que o aluno não possui.',
      );
    }
    return `\n\n${lines.join('\n')}\n`;
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

  /**
   * Non-streaming Dr Shape evaluation — built for the onboarding flow where we
   * need a single round-trip (no WebSocket) and the caller wants the full
   * answer before persisting. Mirrors the system prompt + vision-model choice
   * of `streamChat(EVALUATOR)` so the produced analysis reads identical to the
   * one users get inside the regular chat.
   */
  async evaluateOnce(
    userId: string,
    images: Array<{ data: string; mimeType?: string }>,
    notes?: string,
  ): Promise<string> {
    if (!images?.length) {
      throw new Error('evaluateOnce requires at least one image');
    }
    const context = await this.buildContext(userId, AgentType.EVALUATOR);
    const systemPrompt = SYSTEM_PROMPTS[AgentType.EVALUATOR];

    const imageParts = images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.data}` },
    }));
    const userText = notes?.trim()
      ? `Esta é minha primeira avaliação no FitAI. Observações: ${notes.trim().slice(0, 600)}`
      : 'Esta é minha primeira avaliação no FitAI. Faça uma análise completa do meu físico atual com base nas fotos.';

    const completion = await this.withRetry(() =>
      this.groq.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: systemPrompt + (context ? `\n\n${context}` : '') },
          {
            role: 'user',
            content: [...imageParts, { type: 'text', text: userText }] as any,
          },
        ],
        max_tokens: 2048,
      }),
    );

    const raw = completion.choices[0]?.message?.content || '';
    // The 70b/scout models occasionally emit <think>…</think> reasoning blocks
    // — strip them before persisting / showing to the user.
    return raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  /**
   * One-shot weekly check-in — the ANALYST reviews a pre-computed adherence
   * block (training + nutrition + weight for the last 7 days) and returns a
   * short coaching summary. Non-streaming on purpose: it's produced by the
   * cron with no client attached, then persisted as a memory and pushed.
   *
   * The stats are computed deterministically by CheckinService and passed in
   * via `statsBlock` so the model never invents numbers — it only interprets.
   */
  async generateWeeklyCheckin(userId: string, statsBlock: string): Promise<string> {
    const context = await this.buildContext(userId, AgentType.ANALYST);
    const completion = await this.withRetry(() =>
      this.groq.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[AgentType.ANALYST] },
          {
            role: 'user',
            content: `${context}\n\n${statsBlock}\n\nGere o CHECK-IN SEMANAL do aluno em PT-BR (máximo ~150 palavras, sem markdown pesado). Estrutura:
1) Abra reconhecendo o que foi bem na semana.
2) Aponte o PRINCIPAL ponto de atenção (aderência baixa, proteína abaixo da meta, peso estagnado, etc).
3) Dê 1 a 2 ações concretas e específicas para a próxima semana.
Use SOMENTE os números fornecidos no bloco "DADOS DA SEMANA" — não invente dados. Tom de coach: direto, motivador, sem ser genérico.`,
          },
        ],
        max_tokens: 600,
      }),
    );
    const raw = completion.choices[0]?.message?.content || '';
    return this.stripThinkTags(raw);
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
    // A full weekly plan (5-6 days × multiple exercises each) easily reaches
    // 8-10k chars. Truncating at 3k cuts off the back half of the week, which
    // is exactly the "partial save" the user reported on mobile/long replies.
    const truncated = text.slice(0, 12000);
    const completion = await this.withRetry(() =>
      this.groq.chat.completions.create({
        model: EXTRACT_MODEL,
        // Force JSON-only output — bypasses the heuristic extractJson() and
        // eliminates a class of "extracted partial / extra prose" failures.
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Converta a descrição de treino para JSON. Inclua TODOS os dias mencionados, sem omitir nenhum. Responda APENAS com JSON válido:
{"name":"Nome","description":"Desc","sessions":[{"name":"Segunda-feira — Peito","dayOfWeek":1,"muscleGroups":["peito"],"estimatedTime":60,"exercises":[{"order":1,"name":"Supino Reto","sets":4,"reps":"8-12","restSeconds":90,"notes":"dica"}]}]}
dayOfWeek: 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sáb`,
          },
          { role: 'user', content: truncated },
        ],
        max_tokens: 6000,
      }),
    );

    const raw = completion.choices[0]?.message?.content || '';
    return this.extractJson(raw);
  }

  async extractNutritionFromText(text: string): Promise<any> {
    const truncated = text.slice(0, 12000);
    const completion = await this.withRetry(() =>
      this.groq.chat.completions.create({
        model: EXTRACT_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Converta a descrição de dieta para JSON. Inclua TODAS as refeições mencionadas. Responda APENAS com JSON válido:
{"calories":2200,"proteinG":160,"carbsG":220,"fatG":73,"meals":[{"name":"Café da Manhã","timeOfDay":"breakfast","calories":450,"proteinG":30,"carbsG":55,"fatG":10,"foods":[{"name":"Aveia","quantityG":80,"calories":300,"proteinG":10,"carbsG":54,"fatG":6,"alternatives":["granola"]}]}]}`,
          },
          { role: 'user', content: truncated },
        ],
        max_tokens: 6000,
      }),
    );

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

  async generateWorkoutPlan(userId: string, preferences?: string) {
    console.log(
      `[generateWorkoutPlan] start userId=${userId} model=${GEN_MODEL} hasPrefs=${!!preferences?.trim()}`,
    );
    const [context, profile] = await Promise.all([
      this.buildContext(userId, AgentType.TRAINER),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);
    const safetyBlock = this.buildSafetyBlock(profile);

    // Preferences are a free-form note from the user ("treino longo: 5 peito +
    // 3 tríceps", "foco em panturrilha"). We wrap them in a clearly-fenced
    // block so the prompt's "PRIORIDADE MÁXIMA" rule can latch onto it.
    const prefsBlock = preferences?.trim()
      ? `\n\nPREFERÊNCIAS PARA ESTA GERAÇÃO (prioridade máxima — siga ao pé da letra):\n"""\n${preferences.trim().slice(0, 600)}\n"""\n`
      : '';

    const completion = await this.withRetry(() =>
      this.groq.chat.completions.create({
        model: GEN_MODEL,
        messages: [
          { role: 'system', content: WORKOUT_GENERATION_PROMPT },
          {
            role: 'user',
            content: `${context}${prefsBlock}${safetyBlock}\n\nCrie um plano de treino semanal completo e personalizado para este usuário. Respeite as RESTRIÇÕES OBRIGATÓRIAS (lesões/equipamento) se houver. Responda APENAS com o JSON.`,
          },
        ],
        // Bumped from 4096 — a 6-day split with 6+ exercises per session
        // hits ~5k output tokens. 4096 was silently truncating the JSON
        // on richer plans, which the model then "recovered" from by
        // shrinking exercise counts to fit.
        max_tokens: 6144,
      }),
    );

    const text = completion.choices[0]?.message?.content || '';
    console.log(`[generateWorkoutPlan] response length=${text.length} preview=${text.slice(0, 100)}`);
    return this.extractJson(text);
  }

  /**
   * Two-pass workout generation. Pass 1 returns only the week skeleton with
   * per-group target counts (~500 tokens, structurally impossible to truncate).
   * Pass 2 fans out one call per session to expand its exercise list. Each
   * pass-2 call produces ~800-1500 tokens — way under any quota — and they run
   * in parallel so the wall-clock cost is roughly one model round-trip, not N.
   *
   * Replaces single-pass for everything except the manual /workouts/generate
   * fallback. The single-pass version is kept for emergency rollback.
   */
  async generateWorkoutPlanTwoPass(
    userId: string,
    preferences?: string,
    periodizationDirective?: string,
  ) {
    const t0 = Date.now();
    console.log(
      `[generateWorkoutPlanTwoPass] start userId=${userId} model=${GEN_MODEL} hasPrefs=${!!preferences?.trim()} hasPeriod=${!!periodizationDirective?.trim()}`,
    );
    const [context, history, profile] = await Promise.all([
      this.buildContext(userId, AgentType.TRAINER),
      this.buildTrainingHistory(userId),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);
    const safetyBlock = this.buildSafetyBlock(profile);
    console.log(
      `[generateWorkoutPlanTwoPass] history loaded: ${history ? 'yes' : 'none (new user)'} safety=${safetyBlock ? 'yes' : 'none'}`,
    );

    const prefsBlock = preferences?.trim()
      ? `\n\nPREFERÊNCIAS PARA ESTA GERAÇÃO (prioridade máxima — siga ao pé da letra):\n"""\n${preferences.trim().slice(0, 600)}\n"""\n`
      : '';

    const periodBlock = periodizationDirective?.trim()
      ? `\n\n${periodizationDirective.trim()}\n`
      : '';

    // --- PASS 1: skeleton ---------------------------------------------------
    const skeletonCompletion = await this.withRetry(() =>
      this.groq.chat.completions.create({
        model: GEN_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: WORKOUT_SKELETON_PROMPT },
          {
            role: 'user',
            content: `${context}${prefsBlock}${periodBlock}${safetyBlock}\n\nGere APENAS o esqueleto do plano semanal com targetExercises por grupo. Se houver diretiva de PERIODIZAÇÃO acima (ex: deload), ajuste o volume (targetExercises) de acordo. Respeite as RESTRIÇÕES OBRIGATÓRIAS (lesões/equipamento) se houver. Responda APENAS com JSON.`,
          },
        ],
        max_tokens: 2048,
      }),
    );
    const skeletonText = skeletonCompletion.choices[0]?.message?.content || '';
    const skeleton = this.extractJson(skeletonText) as {
      name: string;
      description: string;
      sessions: Array<{
        name: string;
        dayOfWeek: number;
        muscleGroups: string[];
        targetExercises: Record<string, number>;
        estimatedTime: number;
        focus?: string;
      }>;
    };
    console.log(
      `[generateWorkoutPlanTwoPass] skeleton done in ${Date.now() - t0}ms sessions=${skeleton.sessions?.length || 0}`,
    );

    if (!skeleton.sessions?.length) {
      throw new Error('Skeleton returned no sessions');
    }

    // --- PASS 2: expand each session ---------------------------------------
    // Originally fired all sessions in parallel — that hammered Groq's TPM
    // budget on the free tier and every call retried 2-3x, blowing past the
    // 60s client timeout. Batching in pairs gives us most of the wall-clock
    // win (a 6-day split goes from 6 sequential calls to ~3 batches) without
    // the rate-limit storm.
    const expandSession = async (
      session: typeof skeleton.sessions[number],
      idx: number,
    ): Promise<any[]> => {
      const blueprint = {
        name: session.name,
        dayOfWeek: session.dayOfWeek,
        muscleGroups: session.muscleGroups,
        targetExercises: session.targetExercises,
        focus: session.focus,
      };
      const totalTargets = Object.values(session.targetExercises || {}).reduce(
        (s, n) => s + (Number(n) || 0),
        0,
      );
      try {
        const completion = await this.withRetry(() =>
          this.groq.chat.completions.create({
            model: GEN_MODEL,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: WORKOUT_SESSION_EXPANSION_PROMPT },
              {
                role: 'user',
                content: `BLUEPRINT:\n${JSON.stringify(blueprint, null, 2)}\n${history ? `\n${history}\n` : ''}${periodBlock}${safetyBlock}\nGere EXATAMENTE ${totalTargets} exercícios respeitando os targetExercises por grupo. Se houver RESTRIÇÕES OBRIGATÓRIAS acima (lesões/equipamento), elas têm prioridade sobre tudo: escolha apenas variações seguras e executáveis com o equipamento disponível. Para exercícios que aparecem no HISTÓRICO DE CARGAS, aplique a regra de progressão e indique a carga sugerida em "notes". Se houver diretiva de PERIODIZAÇÃO acima, ajuste séries/RPE/carga conforme a fase (no deload, reduza séries e use cargas leves). Responda APENAS com JSON.`,
              },
            ],
            max_tokens: 2048,
          }),
        );
        const text = completion.choices[0]?.message?.content || '';
        const parsed = this.extractJson(text) as { exercises: any[] };
        return parsed.exercises || [];
      } catch (err: any) {
        console.error(
          `[generateWorkoutPlanTwoPass] session ${idx} (${session.name}) failed: ${err?.message || err}`,
        );
        return [];
      }
    };

    const BATCH_SIZE = 2;
    const expanded: any[][] = new Array(skeleton.sessions.length);
    for (let i = 0; i < skeleton.sessions.length; i += BATCH_SIZE) {
      const batch = skeleton.sessions.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((s, j) => expandSession(s, i + j)),
      );
      results.forEach((r, j) => {
        expanded[i + j] = r;
      });
    }

    // Safety net: dedupe exercises by normalized name within each session.
    // The prompt forbids duplicates but the model occasionally repeats names
    // (e.g. two "Supino Reto" entries). Keep first occurrence, drop the rest,
    // and re-number `order` so the UI stays sequential.
    const dedupe = (exs: any[]): any[] => {
      const seen = new Set<string>();
      const out: any[] = [];
      for (const e of exs || []) {
        const key = String(e?.name || '').trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ ...e, order: out.length + 1 });
      }
      return out;
    };

    const sessions = skeleton.sessions.map((s, i) => ({
      name: s.name,
      dayOfWeek: s.dayOfWeek,
      muscleGroups: s.muscleGroups,
      estimatedTime: s.estimatedTime,
      exercises: dedupe(expanded[i]),
    }));

    console.log(
      `[generateWorkoutPlanTwoPass] done in ${Date.now() - t0}ms total exercises=${expanded.reduce((s, e) => s + e.length, 0)}`,
    );

    return {
      name: skeleton.name,
      description: skeleton.description,
      sessions,
    };
  }

  async generateNutritionPlan(userId: string) {
    console.log(`[generateNutritionPlan] start userId=${userId} model=${GEN_MODEL}`);
    const [context, profile] = await Promise.all([
      this.buildContext(userId, AgentType.NUTRITIONIST),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    // Deterministic calorie/macro target (Mifflin-St Jeor). When the profile
    // has enough data we anchor the AI to it AND override the headline numbers
    // afterward, so the stored plan total is always defensible math — not an
    // AI guess that drifts run-to-run.
    const targets = profile ? computeNutritionTargets(profile) : null;
    const targetBlock = targets
      ? `\n\nMETA NUTRICIONAL (CALCULADA — prioridade máxima, distribua as refeições para bater estes totais ±5%):
- Calorias: ${targets.calories} kcal/dia
- Proteína: ${targets.proteinG} g
- Carboidrato: ${targets.carbsG} g
- Gordura: ${targets.fatG} g
(${targets.rationale})\n`
      : '';
    console.log(
      `[generateNutritionPlan] targets=${targets ? `${targets.calories}kcal P${targets.proteinG}/C${targets.carbsG}/G${targets.fatG}` : 'none (insufficient profile)'}`,
    );

    const completion = await this.withRetry(() =>
      this.groq.chat.completions.create({
        model: GEN_MODEL,
        messages: [
          { role: 'system', content: NUTRITION_GENERATION_PROMPT },
          {
            role: 'user',
            content: `${context}${targetBlock}\n\nCrie um plano alimentar diário completo e personalizado para este usuário. Responda APENAS com o JSON.`,
          },
        ],
        max_tokens: 4096,
      }),
    );

    const text = completion.choices[0]?.message?.content || '';
    console.log(`[generateNutritionPlan] response length=${text.length} preview=${text.slice(0, 100)}`);
    const planData = this.extractJson(text) as any;

    // Override the headline with the computed target so it never drifts from
    // the math. Meals stay as the AI distributed them (guidance), but the
    // plan total the user sees is the calculated one.
    if (targets && planData) {
      planData.calories = targets.calories;
      planData.proteinG = targets.proteinG;
      planData.carbsG = targets.carbsG;
      planData.fatG = targets.fatG;
    }
    return planData;
  }
}
