import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { AgentsModule } from '../agents/agents.module';
import { ChatModule } from '../chat/chat.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  // Pulled in for the inline Dr Shape evaluation that runs during the
  // onboarding wizard — see OnboardingService.runInitialEvaluation.
  imports: [AgentsModule, ChatModule, MemoryModule],
  providers: [OnboardingService],
  controllers: [OnboardingController],
})
export class OnboardingModule {}
