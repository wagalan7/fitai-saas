import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NutritionService } from './nutrition.service';
import { AdjustDietDto, LogMealDto, SavePlanFromChatDto } from './nutrition.dto';

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

  @Get('today-adherence')
  getTodayAdherence(@Req() req: { user: { id: string } }) {
    return this.nutritionService.getTodayAdherence(req.user.id);
  }

  // Diet auto-titration: recommendation based on the weight trend vs the goal.
  @Get('diet-adjustment')
  getDietAdjustment(@Req() req: { user: { id: string } }) {
    return this.nutritionService.getDietAdjustment(req.user.id);
  }

  // Applies a calorie titration (recommended delta, or an explicit override).
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  @Post('adjust')
  adjustDiet(
    @Req() req: { user: { id: string } },
    @Body() body: AdjustDietDto = {},
  ) {
    return this.nutritionService.applyDietAdjustment(req.user.id, body.deltaKcal);
  }

  @Get('log')
  getDailyLog(
    @Req() req: { user: { id: string } },
    @Query('date') date?: string,
  ) {
    return this.nutritionService.getDailyLog(req.user.id, date ? new Date(date) : new Date());
  }
}
