'use client';

import { useEffect } from 'react';

// Lightweight Sentry init — only runs on the client and only if DSN is configured.
// We import lazily so the bundle isn't pulled in when Sentry is disabled.
export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    import('@sentry/browser').then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: 0.1,
        // Ignore noisy network errors
        ignoreErrors: ['ResizeObserver loop limit exceeded', 'Network Error', 'NetworkError'],
      });
      // eslint-disable-next-line no-console
      console.log('[sentry] enabled');
    });
  }, []);
  return null;
}
