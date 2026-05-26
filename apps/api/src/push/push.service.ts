import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subj = process.env.VAPID_SUBJECT || 'mailto:noreply@fitai.app';
    if (pub && priv) {
      webpush.setVapidDetails(subj, pub, priv);
      this.enabled = true;
      this.logger.log('Web Push enabled');
    } else {
      this.logger.warn('Web Push disabled (set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)');
    }
  }

  isEnabled() {
    return this.enabled;
  }

  getPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
      },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { unsubscribed: true };
  }

  /**
   * Sends a push notification to all subscriptions of a given user.
   * Silently removes expired/invalid subscriptions (410/404).
   */
  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return { sent: 0, skipped: 'disabled' as const };
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          this.logger.warn(`Push failed (${status}): ${err?.message}`);
        }
      }
    }
    return { sent };
  }
}
