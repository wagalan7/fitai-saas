import { Controller, Get, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileService, UpdateProfileDto } from './profile.service';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private profileService: ProfileService) {}

  @Get()
  getProfile(@Req() req: any) {
    return this.profileService.getProfile(req.user.id);
  }

  @Patch()
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(req.user.id, dto);
  }

  @Get('memories')
  getMemories(@Req() req: any) {
    return this.profileService.getMemories(req.user.id);
  }

  @Delete('memories/:id')
  deleteMemory(@Req() req: any, @Param('id') id: string) {
    return this.profileService.deleteMemory(req.user.id, id);
  }
}
