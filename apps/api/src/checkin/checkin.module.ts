import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PushModule } from '../push/push.module';
import { AgentsModule } from '../agents/agents.module';
import { MemoryModule } from '../memory/memory.module';
import { CheckinService } from './checkin.service';
import { CheckinController } from './checkin.controller';

@Module({
  imports: [PushModule, AgentsModule, MemoryModule],
  controllers: [CheckinController],
  providers: [CheckinService, PrismaService],
})
export class CheckinModule {}
