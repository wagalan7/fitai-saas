import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AgentType, MemoryType } from '@prisma/client';
import Groq from 'groq-sdk';

const MEMORY_MODEL = 'llama-3.1-8b-instant';

@Injectable()
export class MemoryService {
  private groq: Groq;

  constructor(private prisma: PrismaService) {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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
      const completion = await this.groq.chat.completions.create({
        model: MEMORY_MODEL,
        messages: [
          {
            role: 'system',
            content: `Você extrai memórias relevantes de conversas. Retorne APENAS JSON válido:
{"memories":[{"type":"FACT|PREFERENCE|PROGRESS|INSIGHT","content":"texto","importance":0.1-1.0}]}
Extraia apenas informações genuinamente úteis para personalizar futuras interações.`,
          },
          {
            role: 'user',
            content: `Usuário: "${userMessage}"\nAssistente: "${assistantReply.substring(0, 300)}"`,
          },
        ],
        max_tokens: 512,
      });

      const text = completion.choices[0]?.message?.content || '';
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

    const completion = await this.groq.chat.completions.create({
      model: MEMORY_MODEL,
      messages: [
        { role: 'system', content: 'Crie um resumo conciso das memórias, mantendo apenas o essencial.' },
        { role: 'user', content: oldMemories.map((m) => `[${m.type}] ${m.content}`).join('\n') },
      ],
      max_tokens: 512,
    });

    const summary = completion.choices[0]?.message?.content || '';

    await this.prisma.$transaction([
      this.prisma.memory.deleteMany({ where: { id: { in: oldMemories.map((m) => m.id) } } }),
      this.prisma.memory.create({
        data: { userId, agentType, type: MemoryType.SUMMARY, content: summary, importance: 1.5 },
      }),
    ]);
  }
}
