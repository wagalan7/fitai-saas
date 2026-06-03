import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingService } from './onboarding.service';
import {
  InitialEvaluationDto,
  OnboardingAnswersDto,
  SaveStepDto,
} from './onboarding.dto';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Get('status')
  getStatus(@Req() req: { user: { id: string } }) {
    return this.onboardingService.getStatus(req.user.id);
  }

  @Post('step')
  saveStep(@Req() req: { user: { id: string } }, @Body() body: SaveStepDto) {
    return this.onboardingService.saveAnswers(req.user.id, body.step, body.answers);
  }

  @Post('complete')
  complete(@Req() req: { user: { id: string } }, @Body() body: OnboardingAnswersDto) {
    return this.onboardingService.complete(req.user.id, body);
  }

  /**
   * First Dr Shape body evaluation, run inline during the onboarding wizard.
   * Heavy (vision model + image payload) so rate-limit hard — 3 per hour is
   * way more than legit retries need.
   */
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @Post('evaluation')
  initialEvaluation(
    @Req() req: { user: { id: string } },
    @Body() body: InitialEvaluationDto,
  ) {
    return this.onboardingService.runInitialEvaluation(
      req.user.id,
      body.images,
      body.notes,
    );
  }

  @Post('evaluation/skip')
  skipEvaluation(@Req() req: { user: { id: string } }) {
    return this.onboardingService.skipInitialEvaluation(req.user.id);
  }
}
