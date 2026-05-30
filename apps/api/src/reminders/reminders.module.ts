import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PushModule } from '../push/push.module';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';

@Module({
  imports: [PushModule],
  controllers: [RemindersController],
  providers: [RemindersService, PrismaService],
})
export class RemindersModule {}
