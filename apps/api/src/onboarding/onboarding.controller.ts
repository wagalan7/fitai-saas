import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingService } from './onboarding.service';
import { OnboardingAnswersDto, SaveStepDto } from './onboarding.dto';

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
}
