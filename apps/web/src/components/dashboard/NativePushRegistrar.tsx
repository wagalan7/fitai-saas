'use client';

/**
 * Registers the device with APNs the first time an authenticated user lands
 * in the dashboard inside the Capacitor iOS shell. No-op on web/PWA.
 *
 * Lives in the dashboard layout (not the root layout) on purpose — we only
 * want to ask for notification permission AFTER the user is signed in and
 * has reached the main app. Asking on the login screen wastes the one-shot
 * iOS permission prompt and frequently gets denied.
 */
import { useEffect } from 'react';
import { isNative, registerNativePush } from '@/lib/native';
import { api } from '@/lib/api';

export default function NativePushRegistrar() {
  useEffect(() => {
    if (!isNative()) return;
    registerNativePush((token) =>
      api.post('/push/device-token', {
        token,
        platform: 'ios',
        bundleId: 'com.fitai.app',
      }),
    ).catch(() => {
      // swallow — failure is non-fatal, user just won't get pushes
    });
  }, []);

  return null;
}
