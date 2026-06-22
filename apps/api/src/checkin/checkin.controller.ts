import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CheckinService } from './checkin.service';

@Controller('checkin')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CheckinController {
  constructor(private checkin: CheckinService) {}

  /** Latest persisted weekly check-in (for the dashboard/progress card). */
  @Get('latest')
  async latest(@Req() req: { user: { id: string } }) {
    const result = await this.checkin.getLatestCheckin(req.user.id);
    return result ?? { summary: null, createdAt: null };
  }

  /** Live preview of this week's adherence numbers, no LLM call. */
  @Get('stats')
  getStats(@Req() req: { user: { id: string } }) {
    return this.checkin.computeWeeklyStats(req.user.id);
  }

  /**
   * Run the check-in on demand (the "Gerar agora" button). Calls the ANALYST,
   * so it shares the same tight per-hour budget as plan generation.
   */
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('run')
  run(@Req() req: { user: { id: string } }) {
    return this.checkin.runForUser(req.user.id, { push: false });
  }
}
