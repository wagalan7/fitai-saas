import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingService, OnboardingAnswers } from './onboarding.service';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Get('status')
  getStatus(@Req() req: { user: { id: string } }) {
    return this.onboardingService.getStatus(req.user.id);
  }

  @Post('step')
  saveStep(
    @Req() req: { user: { id: string } },
    @Body() body: { step: number; answers: OnboardingAnswers },
  ) {
    return this.onboardingService.saveAnswers(req.user.id, body.step, body.answers);
  }

  @Post('complete')
  complete(
    @Req() req: { user: { id: string } },
    @Body() body: OnboardingAnswers,
  ) {
    return this.onboardingService.complete(req.user.id, body);
  }
}
