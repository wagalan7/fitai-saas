import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, ForbiddenException } from '@nestjs/common';
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

  @Post('save-from-chat')
  savePlanFromChat(
    @Req() req: { user: { id: string } },
    @Body() body: { text: string },
  ) {
    return this.workoutsService.savePlanFromText(req.user.id, body.text);
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

  @Delete('log/:id')
  async deleteLog(
    @Req() req: { user: { id: string } },
    @Param('id') logId: string,
  ) {
    return this.workoutsService.deleteWorkoutLog(req.user.id, logId);
  }
}
