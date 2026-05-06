import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProgressService } from './progress.service';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @Post()
  log(@Req() req: { user: { id: string } }, @Body() body: any) {
    return this.progressService.logProgress(req.user.id, body);
  }

  @Get()
  getHistory(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    return this.progressService.getHistory(req.user.id, days ? +days : 90);
  }

  @Get('summary')
  getSummary(@Req() req: { user: { id: string } }) {
    return this.progressService.getSummary(req.user.id);
  }
}
