import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushService } from './push.service';

class SubscribeDto {
  @IsString() endpoint!: string;
  @IsObject() keys!: { p256dh: string; auth: string };
}

class UnsubscribeDto {
  @IsString() endpoint!: string;
}

class DeviceTokenDto {
  @IsString() token!: string;
  @IsIn(['ios', 'android']) platform!: 'ios' | 'android';
  @IsOptional() @IsString() bundleId?: string;
}

class DeviceTokenDeleteDto {
  @IsString() token!: string;
}

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private push: PushService) {}

  @Get('public-key')
  getPublicKey() {
    return { publicKey: this.push.getPublicKey(), enabled: this.push.isEnabled() };
  }

  @Post('subscribe')
  subscribe(@Req() req: any, @Body() body: SubscribeDto) {
    return this.push.subscribe(req.user.id, body, req.headers?.['user-agent']);
  }

  @Delete('subscribe')
  unsubscribe(@Req() req: any, @Body() body: UnsubscribeDto) {
    return this.push.unsubscribe(req.user.id, body.endpoint);
  }

  /**
   * Native device-token registration. Called from the Capacitor shell after
   * the user grants notification permission and PushNotifications fires the
   * `registration` event with an APNs token.
   */
  @Post('device-token')
  registerDeviceToken(@Req() req: any, @Body() body: DeviceTokenDto) {
    return this.push.registerDeviceToken(req.user.id, body.token, body.platform, body.bundleId);
  }

  @Delete('device-token')
  unregisterDeviceToken(@Req() req: any, @Body() body: DeviceTokenDeleteDto) {
    return this.push.unregisterDeviceToken(req.user.id, body.token);
  }

  @Post('test')
  test(@Req() req: any) {
    return this.push.sendToUser(req.user.id, {
      title: 'FitAI',
      body: 'Notificação de teste — está funcionando! 💪',
      url: '/dashboard',
    });
  }
}
