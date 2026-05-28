import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PushModule } from '../push/push.module';
import { RemindersService } from './reminders.service';

@Module({
  imports: [PushModule],
  providers: [RemindersService, PrismaService],
})
export class RemindersModule {}
