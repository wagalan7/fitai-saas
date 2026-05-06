import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkoutsService } from './workouts.service';

@Controller('workouts')
@UseGuards(JwtAuthGuard)
export class WorkoutsController {
  constructor(private workoutsService: WorkoutsService) {}

  @Post('generate')
  generatePlan(@Req() req: { user: { id: string } }) {
    return this.workoutsService.generatePlan(req.user.id);
  }

  @Get('plan')
  getActivePlan(@Req() req: { user: { id: string } }) {
    return this.workoutsService.getActivePlan(req.user.id);
  }

  @Post('log')
  logWorkout(
    @Req() req: { user: { id: string } },
    @Body()
    body: {
      workoutSessionId: string;
      durationMinutes?: number;
      rating?: number;
      notes?: string;
      exerciseLogs?: any[];
    },
  ) {
    return this.workoutsService.logWorkout(req.user.id, body.workoutSessionId, body);
  }

  @Get('history')
  getHistory(@Req() req: { user: { id: string } }) {
    return this.workoutsService.getWorkoutHistory(req.user.id);
  }
}
