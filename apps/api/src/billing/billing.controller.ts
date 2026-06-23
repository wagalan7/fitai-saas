import {
  Controller,
  Get,
  Post,
  Req,
  Headers,
  HttpCode,
  UseGuards,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService) {}

  /** Current plan/status for the signed-in user (FREE default when none). */
  @UseGuards(JwtAuthGuard)
  @Get('subscription')
  getSubscription(@Req() req: { user: { id: string } }) {
    return this.billing.getSubscription(req.user.id);
  }

  /** Starts a Stripe Checkout Session; returns the hosted-checkout URL. */
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  createCheckout(@Req() req: { user: { id: string } }) {
    return this.billing.createCheckoutSession(req.user.id);
  }

  /** Opens the Stripe billing portal; returns the hosted-portal URL. */
  @UseGuards(JwtAuthGuard)
  @Post('portal')
  createPortal(@Req() req: { user: { id: string } }) {
    return this.billing.createPortalSession(req.user.id);
  }

  /**
   * Stripe webhook — NO auth guard (Stripe can't send a JWT). Authenticity is
   * proven by the `stripe-signature` header verified against the raw body, so
   * this route relies on `rawBody: true` being set in main.ts.
   */
  @Post('webhook')
  @HttpCode(200)
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
