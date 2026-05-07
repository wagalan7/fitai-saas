import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NutritionService } from './nutrition.service';

@Controller('nutrition')
@UseGuards(JwtAuthGuard)
export class NutritionController {
  constructor(private nutritionService: NutritionService) {}

  @Post('generate')
  generate(@Req() req: { user: { id: string } }) {
    return this.nutritionService.generatePlan(req.user.id);
  }

  @Post('save-from-chat')
  savePlanFromChat(
    @Req() req: { user: { id: string } },
    @Body() body: { text: string },
  ) {
    return this.nutritionService.savePlanFromText(req.user.id, body.text);
  }

  @Get('plan')
  getPlan(@Req() req: { user: { id: string } }) {
    return this.nutritionService.getPlan(req.user.id);
  }

  @Post('log')
  logMeal(
    @Req() req: { user: { id: string } },
    @Body()
    body: {
      mealName: string;
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      notes?: string;
    },
  ) {
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
