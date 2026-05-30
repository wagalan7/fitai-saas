import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RemindersService } from './reminders.service';

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private reminders: RemindersService) {}

  /**
   * Fire a workout-reminder push for the current user right now,
   * bypassing the scheduled hour/dedup. Returns a diagnostic object
   * so the UI can show why a test failed (no subscription, etc).
   */
  @Post('test-now')
  testNow(@Req() req: any) {
    return this.reminders.triggerForUserNow(req.user.id);
  }
}
