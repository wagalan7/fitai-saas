import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../common/prisma.service';
import { ApnsConfig, loadApnsConfig, sendApns } from './apns.sender';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;
  private apns: ApnsConfig | null = null;

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

    this.apns = loadApnsConfig();
    if (this.apns) {
      this.logger.log(
        `APNs enabled (${this.apns.production ? 'production' : 'sandbox'}) topic=${this.apns.bundleId}`,
      );
    } else {
      this.logger.warn(
        'APNs disabled (set APNS_KEY + APNS_KEY_ID + APNS_TEAM_ID to enable)',
      );
    }
  }

  isEnabled() {
    return this.enabled;
  }

  isApnsEnabled() {
    return !!this.apns;
  }

  getPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /** Register a native APNs device token. Upsert on token — same device can
   *  re-register after re-install or after switching user, so we steal it. */
  async registerDeviceToken(userId: string, token: string, platform: 'ios' | 'android', bundleId?: string) {
    if (!token || token.length < 20) throw new Error('Invalid device token');
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform, bundleId },
      update: { userId, platform, bundleId },
    });
  }

  async unregisterDeviceToken(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { unregistered: true };
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
   * Fan-out push to every channel the user has registered: VAPID web push
   * subscriptions AND native APNs device tokens. Expired/invalid endpoints
   * are silently pruned so the DB stays clean.
   */
  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    let webSent = 0;
    let apnsSent = 0;

    // --- web push ---------------------------------------------------------
    if (this.enabled) {
      const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
          );
          webSent++;
        } catch (err: any) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          } else {
            this.logger.warn(`Web push failed (${status}): ${err?.message}`);
          }
        }
      }
    }

    // --- native APNs ------------------------------------------------------
    if (this.apns) {
      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId, platform: 'ios' },
      });
      // Parallel — APNs HTTP/2 multiplexes over a single connection so we
      // don't pay per-request handshake cost.
      const results = await Promise.all(
        tokens.map((t) =>
          sendApns(this.apns!, t.token, payload).then((r) => ({ t, r })),
        ),
      );
      for (const { t, r } of results) {
        if (r.ok) apnsSent++;
        else if (r.shouldDelete) {
          await this.prisma.deviceToken.delete({ where: { id: t.id } }).catch(() => {});
          this.logger.log(`Pruned dead APNs token (${r.reason})`);
        } else if (r.status !== 0) {
          this.logger.warn(`APNs failed (${r.status} ${r.reason})`);
        }
      }
    }

    return { sent: webSent + apnsSent, webSent, apnsSent };
  }
}
