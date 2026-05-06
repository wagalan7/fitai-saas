import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AgentType, MemoryType } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class MemoryService {
  private anthropic: Anthropic;

  constructor(private prisma: PrismaService) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `Você extrai memórias relevantes de conversas. Retorne APENAS JSON válido:
{"memories":[{"type":"FACT|PREFERENCE|PROGRESS|INSIGHT","content":"texto","importance":0.1-1.0}]}
Extraia apenas informações genuinamente úteis para personalizar futuras interações.`,
        messages: [
          {
            role: 'user',
            content: `Usuário: "${userMessage}"\nAssistente: "${assistantReply.substring(0, 300)}"`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '{"memories":[]}';
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(clean);

      if (result.memories?.length > 0) {
        await Promise.all(
          result.memories.map((m: { type: string; content: string; importance: number }) =>
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

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'Crie um resumo conciso das memórias, mantendo apenas o essencial.',
      messages: [{ role: 'user', content: oldMemories.map((m) => `[${m.type}] ${m.content}`).join('\n') }],
    });

    const summary = response.content[0].type === 'text' ? response.content[0].text : '';

    await this.prisma.$transaction([
      this.prisma.memory.deleteMany({ where: { id: { in: oldMemories.map((m) => m.id) } } }),
      this.prisma.memory.create({
        data: { userId, agentType, type: MemoryType.SUMMARY, content: summary, importance: 1.5 },
      }),
    ]);
  }
}
