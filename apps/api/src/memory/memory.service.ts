import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AgentType, MemoryType } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class MemoryService {
  private genAI: GoogleGenerativeAI;

  constructor(private prisma: PrismaService) {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  }

  private getModel(params: Parameters<GoogleGenerativeAI['getGenerativeModel']>[0]) {
    return this.genAI.getGenerativeModel(params);
  }

  async saveMemory(
    userId: string,
    agentType: AgentType,
    type: MemoryType,
    content: string,
    importance = 1.0,
  ) {
    return this.prisma.memory.create({
      data: { userId, agentType, type, content, importance },
    });
  }

  async getRelevantMemories(userId: string, agentType: AgentType, limit = 10) {
    return this.prisma.memory.findMany({
      where: {
        userId,
        OR: [{ agentType }, { agentType: AgentType.SYSTEM }],
      },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  async extractMemoriesFromConversation(
    userId: string,
    agentType: AgentType,
    userMessage: string,
    assistantReply: string,
  ) {
    try {
      const model = this.getModel({
        model: 'gemini-2.5-flash',
        systemInstruction: `Você extrai memórias relevantes de conversas. Retorne APENAS JSON válido:
{"memories":[{"type":"FACT|PREFERENCE|PROGRESS|INSIGHT","content":"texto","importance":0.1-1.0}]}
Extraia apenas informações genuinamente úteis para personalizar futuras interações.`,
      });

      const result = await model.generateContent(
        `Usuário: "${userMessage}"\nAssistente: "${assistantReply.substring(0, 300)}"`,
      );

      const text = result.response.text();
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(clean);

      if (parsed.memories?.length > 0) {
        await Promise.all(
          parsed.memories.map((m: { type: string; content: string; importance: number }) =>
            this.saveMemory(userId, agentType, m.type as MemoryType, m.content, m.importance),
          ),
        );
      }
    } catch {
      // Memory extraction is non-critical — fail silently
    }
  }

  async summarizeOldMemories(userId: string, agentType: AgentType) {
    const oldMemories = await this.prisma.memory.findMany({
      where: {
        userId,
        agentType,
        type: { not: MemoryType.SUMMARY },
        createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { importance: 'desc' },
      take: 50,
    });

    if (oldMemories.length < 10) return;

    const model = this.getModel({
      model: 'gemini-2.5-flash',
      systemInstruction: 'Crie um resumo conciso das memórias, mantendo apenas o essencial.',
    });

    const result = await model.generateContent(
      oldMemories.map((m) => `[${m.type}] ${m.content}`).join('\n'),
    );

    const summary = result.response.text();

    await this.prisma.$transaction([
      this.prisma.memory.deleteMany({ where: { id: { in: oldMemories.map((m) => m.id) } } }),
      this.prisma.memory.create({
        data: { userId, agentType, type: MemoryType.SUMMARY, content: summary, importance: 1.5 },
      }),
    ]);
  }
}
