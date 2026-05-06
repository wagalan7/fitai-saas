import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { AgentType } from '@prisma/client';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('sessions')
  createSession(
    @Req() req: { user: { id: string } },
    @Body() body: { agentType: AgentType; title?: string },
  ) {
    return this.chatService.createSession(req.user.id, body.agentType, body.title);
  }

  @Get('sessions')
  getSessions(
    @Req() req: { user: { id: string } },
    @Query('agentType') agentType?: AgentType,
  ) {
    return this.chatService.getUserSessions(req.user.id, agentType);
  }

  @Get('sessions/:id/messages')
  getMessages(@Param('id') id: string) {
    return this.chatService.getSessionMessages(id, 100);
  }

  @Delete('sessions/:id')
  deleteSession(@Param('id') id: string, @Req() req: { user: { id: string } }) {
    return this.chatService.deleteSession(id, req.user.id);
  }
}
