import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AgentsService } from '../agents/agents.service';
import { ChatService } from './chat.service';
import { MemoryService } from '../memory/memory.service';
import { AgentType } from '@prisma/client';

interface AuthSocket extends Socket {
  userId: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private agentsService: AgentsService,
    private chatService: ChatService,
    private memoryService: MemoryService,
  ) {}

  async handleConnection(client: AuthSocket) {
    const userId = await this.extractUserId(client);
    if (!userId) {
      client.disconnect();
      return;
    }
    client.userId = userId;
    client.join(`user:${userId}`);
  }

  handleDisconnect(client: AuthSocket) {
    if (client.userId) client.leave(`user:${client.userId}`);
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    data: {
      sessionId: string;
      agentType: AgentType;
      content: string;
      imageBase64?: string;
      imageMimeType?: string;
    },
  ) {
    const { sessionId, agentType, content, imageBase64, imageMimeType } = data;
    const userId = client.userId;

    const textForSave = imageBase64 ? `[Foto enviada] ${content || ''}`.trim() : content;
    await this.chatService.saveMessage(sessionId, 'USER', textForSave);

    const history = await this.chatService.getSessionMessages(sessionId, 20);
    const messages: Array<{ role: 'user' | 'assistant'; content: string | Array<any> }> =
      history.slice(0, -1).map((m) => ({
        role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));

    // Build the last user message (with optional image)
    if (imageBase64) {
      const msgContent: Array<any> = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageMimeType || 'image/jpeg',
            data: imageBase64,
          },
        },
      ];
      if (content?.trim()) msgContent.push({ type: 'text', text: content.trim() });
      else msgContent.push({ type: 'text', text: 'Por favor, analise esta foto.' });
      messages.push({ role: 'user', content: msgContent });
    } else {
      messages.push({ role: 'user', content });
    }

    client.emit('stream:start', { sessionId });

    let fullReply = '';

    try {
      const stream = await this.agentsService.streamChat(userId, agentType, messages);

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const delta = event.delta.text;
          fullReply += delta;
          client.emit('stream:chunk', { sessionId, delta });
        }
      }

      client.emit('stream:end', { sessionId });

      await this.chatService.saveMessage(sessionId, 'ASSISTANT', fullReply, agentType);

      this.memoryService
        .extractMemoriesFromConversation(userId, agentType, content, fullReply)
        .catch(() => {});
    } catch (error) {
      console.error('Stream error:', error);
      client.emit('stream:error', { sessionId, message: 'Erro ao processar mensagem' });
    }
  }

  private async extractUserId(client: Socket): Promise<string | null> {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) return null;

    try {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(token, process.env.JWT_SECRET) as { sub: string };
      return payload.sub;
    } catch {
      return null;
    }
  }
}
