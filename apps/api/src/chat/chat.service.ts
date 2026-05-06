import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AgentType, MessageRole } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createSession(userId: string, agentType: AgentType, title?: string) {
    return this.prisma.chatSession.create({
      data: { userId, agentType, title },
    });
  }

  async getUserSessions(userId: string, agentType?: AgentType) {
    return this.prisma.chatSession.findMany({
      where: { userId, ...(agentType && { agentType }), isActive: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
    });
  }

  async saveMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    agentType?: AgentType,
  ) {
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { chatSessionId: sessionId, role, content, agentType },
      }),
      this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }

  async getSessionMessages(sessionId: string, limit = 50) {
    return this.prisma.chatMessage.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async deleteSession(sessionId: string, userId: string) {
    return this.prisma.chatSession.updateMany({
      where: { id: sessionId, userId },
      data: { isActive: false },
    });
  }
}
