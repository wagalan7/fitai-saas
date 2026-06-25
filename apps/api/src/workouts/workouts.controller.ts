import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkoutsService } from './workouts.service';
import { LogWorkoutDto, SavePlanFromChatDto, GeneratePlanDto } from './workouts.dto';

@Controller('workouts')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class WorkoutsController {
  constructor(private workoutsService: WorkoutsService) {}

  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('generate')
  generatePlan(
    @Req() req: { user: { id: string } },
    // Body is optional — existing callers (mobile, older web) post nothing,
    // which is fine. Newer web sends { preferences }.
    @Body() body: GeneratePlanDto = {},
  ) {
    return this.workoutsService.generatePlan(req.user.id, body.preferences, body.cycleWeeks);
  }

  // Advances the active plan to the next week of its mesocycle, regenerating
  // with that week's periodization phase (deload at the end of the block).
  // Same long-running cost as generate, so it shares the throttle budget.
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('advance-week')
  advanceWeek(@Req() req: { user: { id: string } }) {
    return this.workoutsService.advanceWeek(req.user.id);
  }

  // Autoregulated deload: reads recent logged RPE + ratings and recommends
  // whether to deload now. Cheap read — no generation — so no extra throttle.
  @Get('readiness')
  getReadiness(@Req() req: { user: { id: string } }) {
    return this.workoutsService.getReadiness(req.user.id);
  }

  // Applies an autoregulated deload immediately (regenerates at the deload
  // week). Same long-running generation cost, so it shares the throttle budget.
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('deload')
  applyDeload(@Req() req: { user: { id: string } }) {
    return this.workoutsService.applyDeload(req.user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('save-from-chat')
  savePlanFromChat(
    @Req() req: { user: { id: string } },
    @Body() body: SavePlanFromChatDto,
  ) {
    return this.workoutsService.savePlanFromText(req.user.id, body.text);
  }

  @Get('plan')
  getActivePlan(@Req() req: { user: { id: string } }) {
    return this.workoutsService.getActivePlan(req.user.id);
  }

  // Progressive-overload targets per exercise (last performance → today's goal).
  // Cheap read, no generation — shares the default throttle budget.
  @Get('progression')
  getProgression(@Req() req: { user: { id: string } }) {
    return this.workoutsService.getProgression(req.user.id);
  }

  @Post('log')
  logWorkout(@Req() req: { user: { id: string } }, @Body() body: LogWorkoutDto) {
    return this.workoutsService.logWorkout(req.user.id, body.workoutSessionId, body);
  }

  @Get('today-logs')
  getTodayLogs(@Req() req: { user: { id: string } }) {
    return this.workoutsService.getTodayLogs(req.user.id);
  }

  @Get('history')
  getHistory(@Req() req: { user: { id: string } }) {
    return this.workoutsService.getWorkoutHistory(req.user.id);
  }

  @Delete('log/:id')
  async deleteLog(
    @Req() req: { user: { id: string } },
    @Param('id') logId: string,
  ) {
    return this.workoutsService.deleteWorkoutLog(req.user.id, logId);
  }
}
