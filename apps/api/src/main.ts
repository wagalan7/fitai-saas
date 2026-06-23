import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { SentryExceptionFilter } from './common/sentry.filter';

// Initialize Sentry as early as possible. No-op if DSN is missing.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
  });
  console.log('[sentry] enabled');
}

async function bootstrap() {
  // rawBody: true preserves the unparsed request buffer (req.rawBody) so the
  // Stripe webhook can verify the signature against the exact bytes Stripe
  // signed. The global JSON body parser still runs for every other route.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());

  app.useGlobalFilters(new SentryExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // FRONTEND_URL can be a comma-separated list so the API authorizes both
  // the web app (Next.js, normally same-origin via rewrite) AND any clients
  // hitting the API host directly — the Capacitor iOS shell, plus the
  // browser bypassing the Next proxy on long endpoints like
  // /workouts/generate where Next's internal undici timeout drops the
  // socket. Any *.up.railway.app is also waved through so preview deploys
  // and the auto-generated production slug work without env churn.
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl / native
      if (allowedOrigins.includes(origin)) return cb(null, true);
      try {
        if (/\.up\.railway\.app$/.test(new URL(origin).hostname)) {
          return cb(null, true);
        }
      } catch {}
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`API running on port ${port}`);
}

bootstrap();
