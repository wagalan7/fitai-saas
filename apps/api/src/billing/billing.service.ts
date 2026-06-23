import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/**
 * STRIPE BILLING
 *
 * Mirrors the PushService pattern: the module loads cleanly even with no
 * credentials (so dev/preview deploys boot), and only flips `enabled` when
 * STRIPE_SECRET_KEY is present. Every action that needs Stripe guards on
 * `requireStripe()` and returns a 503 when it's not configured.
 *
 * Env vars:
 *   STRIPE_SECRET_KEY        — sk_test_... or sk_live_...
 *   STRIPE_WEBHOOK_SECRET    — whsec_... (from the webhook endpoint config)
 *   STRIPE_PRICE_ID          — the recurring price the checkout subscribes to
 *   STRIPE_PRICE_ID_PREMIUM  — (optional) a second price mapped to PREMIUM
 *   STRIPE_SUCCESS_URL       — (optional) overrides {FRONTEND_URL}/billing?status=success
 *   STRIPE_CANCEL_URL        — (optional) overrides {FRONTEND_URL}/billing?status=cancel
 *   STRIPE_PORTAL_RETURN_URL — (optional) overrides {FRONTEND_URL}/billing
 */
@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) {
      this.stripe = new Stripe(key);
      const mode = key.startsWith('sk_live_') ? 'LIVE' : 'test';
      this.logger.log(`Stripe billing enabled (${mode})`);
    } else {
      this.logger.warn('Stripe billing disabled (set STRIPE_SECRET_KEY to enable)');
    }
  }

  isEnabled() {
    return !!this.stripe;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Pagamentos ainda não estão configurados. Tente novamente em breve.',
      );
    }
    return this.stripe;
  }

  private frontendBase(): string {
    return (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
  }

  // ─── PUBLIC READ ───────────────────────────────────────────────────────────
  /** The user's subscription, or a synthetic FREE default when none exists. */
  async getSubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!sub) {
      return {
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: null,
        isPro: false,
        billingEnabled: this.isEnabled(),
      };
    }
    const isPro =
      sub.plan !== SubscriptionPlan.FREE &&
      (sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.TRIALING);
    return {
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      isPro,
      billingEnabled: this.isEnabled(),
    };
  }

  // ─── CHECKOUT / PORTAL ──────────────────────────────────────────────────────
  /** Creates a Checkout Session for the configured subscription price. */
  async createCheckoutSession(userId: string): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      throw new BadRequestException('STRIPE_PRICE_ID não configurado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const customerId = await this.ensureCustomer(userId, user.email, user.name);
    const base = this.frontendBase();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      subscription_data: { metadata: { userId } },
      success_url:
        process.env.STRIPE_SUCCESS_URL ||
        `${base}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.STRIPE_CANCEL_URL || `${base}/billing?status=cancel`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Não foi possível iniciar o checkout.');
    }
    return { url: session.url };
  }

  /** Stripe-hosted billing portal for managing/canceling the subscription. */
  async createPortalSession(userId: string): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!sub?.stripeCustomerId) {
      throw new BadRequestException('Nenhuma assinatura ativa para gerenciar.');
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: process.env.STRIPE_PORTAL_RETURN_URL || `${this.frontendBase()}/billing`,
    });
    return { url: session.url };
  }

  /** Gets-or-creates the Stripe customer and persists its id on the Subscription. */
  private async ensureCustomer(userId: string, email: string, name: string): Promise<string> {
    const stripe = this.requireStripe();
    const existing = await this.prisma.subscription.findUnique({ where: { userId } });
    if (existing?.stripeCustomerId) return existing.stripeCustomerId;

    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });

    await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: customer.id,
      },
      update: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  // ─── WEBHOOK ────────────────────────────────────────────────────────────────
  /**
   * Verifies the Stripe signature and reconciles our Subscription row with the
   * source of truth (Stripe). Always returns { received: true } on success so
   * Stripe stops retrying; throws on signature failure so Stripe retries.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const stripe = this.requireStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('STRIPE_WEBHOOK_SECRET não configurado.');
    if (!rawBody || !signature) throw new BadRequestException('Webhook inválido.');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err: any) {
      this.logger.warn(`Webhook signature failed: ${err?.message}`);
      throw new BadRequestException(`Webhook signature verification failed`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id || session.metadata?.userId;
          if (userId && session.subscription) {
            const sub = await stripe.subscriptions.retrieve(session.subscription as string);
            await this.upsertFromStripeSub(userId, sub);
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const userId = await this.resolveUserId(sub);
          if (userId) await this.upsertFromStripeSub(userId, sub);
          break;
        }
        default:
          // Unhandled event types are fine — we only care about subscription state.
          break;
      }
    } catch (err: any) {
      this.logger.error(`Webhook handler error (${event.type}): ${err?.message}`);
      // Re-throw so Stripe retries; the signature was valid, the failure is ours.
      throw err;
    }

    return { received: true };
  }

  /** Finds our userId for a Stripe subscription via metadata or the customer row. */
  private async resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
    if (sub.metadata?.userId) return sub.metadata.userId;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (!customerId) return null;
    const row = await this.prisma.subscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  /** Reconciles our Subscription row from a Stripe Subscription object. */
  private async upsertFromStripeSub(userId: string, sub: Stripe.Subscription) {
    const status = this.mapStatus(sub.status);
    const plan = this.mapPlan(sub);
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    const periodEnd = (sub as any).current_period_end
      ? new Date((sub as any).current_period_end * 1000)
      : null;

    await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status,
        stripeCustomerId: customerId ?? null,
        stripeSubId: sub.id,
        currentPeriodEnd: periodEnd,
      },
      update: {
        plan,
        status,
        stripeCustomerId: customerId ?? undefined,
        stripeSubId: sub.id,
        currentPeriodEnd: periodEnd,
      },
    });
    this.logger.log(`Subscription synced user=${userId} plan=${plan} status=${status}`);
  }

  /** Maps Stripe subscription status → our enum. */
  private mapStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
    switch (s) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'past_due':
      case 'unpaid':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
      case 'incomplete':
      case 'incomplete_expired':
      case 'paused':
      default:
        return SubscriptionStatus.CANCELED;
    }
  }

  /** Maps the subscription's price → our plan tier. */
  private mapPlan(sub: Stripe.Subscription): SubscriptionPlan {
    const active = sub.status === 'active' || sub.status === 'trialing';
    if (!active) return SubscriptionPlan.FREE;
    const priceId = sub.items?.data?.[0]?.price?.id;
    if (priceId && priceId === process.env.STRIPE_PRICE_ID_PREMIUM) {
      return SubscriptionPlan.PREMIUM;
    }
    return SubscriptionPlan.PRO;
  }
}
