import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [MemoryModule],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
