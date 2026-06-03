import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AgentsModule } from '../agents/agents.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [AgentsModule, MemoryModule],
  providers: [ChatGateway, ChatService],
  controllers: [ChatController],
  // OnboardingModule needs ChatService to persist the Dr Shape evaluation
  // session/messages produced during initial onboarding.
  exports: [ChatService],
})
export class ChatModule {}
