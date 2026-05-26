import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NutritionService } from './nutrition.service';
import { LogMealDto, SavePlanFromChatDto } from './nutrition.dto';

@Controller('nutrition')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class NutritionController {
  constructor(private nutritionService: NutritionService) {}

  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('generate')
  generate(@Req() req: { user: { id: string } }) {
    return this.nutritionService.generatePlan(req.user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('save-from-chat')
  savePlanFromChat(
    @Req() req: { user: { id: string } },
    @Body() body: SavePlanFromChatDto,
  ) {
    return this.nutritionService.savePlanFromText(req.user.id, body.text);
  }

  @Get('plan')
  getPlan(@Req() req: { user: { id: string } }) {
    return this.nutritionService.getPlan(req.user.id);
  }

  @Post('log')
  logMeal(@Req() req: { user: { id: string } }, @Body() body: LogMealDto) {
    return this.nutritionService.logMeal(req.user.id, body);
  }

  @Get('log')
  getDailyLog(
    @Req() req: { user: { id: string } },
    @Query('date') date?: string,
  ) {
    return this.nutritionService.getDailyLog(req.user.id, date ? new Date(date) : new Date());
  }
}
