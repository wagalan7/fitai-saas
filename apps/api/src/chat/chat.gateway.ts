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
  // Phone photos as base64 easily exceed Socket.io's 1MB default, causing
  // the message to be silently dropped (which manifests as "Dr Shape ignored
  // my photo"). 10MB gives plenty of headroom; client also compresses.
  maxHttpBufferSize: 10 * 1024 * 1024,
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
      // Legacy single-image payload (kept for back-compat with older clients)
      imageBase64?: string;
      imageMimeType?: string;
      // New multi-image payload — Dr Shape body evaluation needs 3+ photos
      images?: Array<{ data: string; mimeType?: string }>;
    },
  ) {
    const { sessionId, agentType, content } = data;
    const userId = client.userId;

    // Normalize the image payload — array first, fall back to legacy single image
    const imageList: Array<{ data: string; mimeType: string }> = [];
    if (Array.isArray(data.images) && data.images.length > 0) {
      for (const img of data.images) {
        if (img?.data) imageList.push({ data: img.data, mimeType: img.mimeType || 'image/jpeg' });
      }
    } else if (data.imageBase64) {
      imageList.push({ data: data.imageBase64, mimeType: data.imageMimeType || 'image/jpeg' });
    }

    const textForSave = imageList.length
      ? `[${imageList.length} foto${imageList.length > 1 ? 's' : ''} enviada${imageList.length > 1 ? 's' : ''}] ${content || ''}`.trim()
      : content;
    await this.chatService.saveMessage(sessionId, 'USER', textForSave);

    const history = await this.chatService.getSessionMessages(sessionId, 20);
    const messages: Array<{ role: 'user' | 'assistant'; content: string | Array<any> }> =
      history.slice(0, -1).map((m) => ({
        role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));

    // Build the last user message (with optional images)
    if (imageList.length > 0) {
      const msgContent: Array<any> = imageList.map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.data },
      }));
      const text = content?.trim() || 'Por favor, analise esta(s) foto(s).';
      msgContent.push({ type: 'text', text });
      messages.push({ role: 'user', content: msgContent });
    } else {
      messages.push({ role: 'user', content });
    }

    client.emit('stream:start', { sessionId });

    let fullReply = '';

    try {
      const stream = this.agentsService.streamChat(userId, agentType, messages);

      for await (const delta of stream) {
        fullReply += delta;
        client.emit('stream:chunk', { sessionId, delta });
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
