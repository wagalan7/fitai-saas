import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Hosted-shell pattern: the iOS app is a thin WKWebView wrapper that loads
 * the production Next.js deploy directly. This is the cheapest way to ship
 * on the App Store without static-exporting a Next 14 app router build
 * (which would lose SSR, ISR, and route handlers).
 *
 * Trade-offs:
 *  - Updates flow through Railway, not the App Store (faster iteration).
 *  - First load needs network; we'll add offline fallback later if needed.
 *  - Native APIs (HealthKit, push, haptics) still work via Capacitor bridges
 *    because the WebView shares the JS context with the plugins.
 *
 * NOTE: Apple sometimes rejects pure "website wrappers" under 4.2. We
 * justify native value by integrating HealthKit + Apple Watch workout
 * sync + native push — features the PWA literally can't provide on iOS.
 */
const config: CapacitorConfig = {
  appId: 'com.fitai.app',
  appName: 'FitAI',
  // webDir is required by Capacitor even when server.url is set; we point it
  // at a tiny placeholder built at sync time (see scripts/build-shell.sh).
  webDir: 'www',
  server: {
    url: 'https://fitai-web-production.up.railway.app',
    cleartext: false,
    // androidScheme intentionally omitted — iOS-only for now.
  },
  ios: {
    contentInset: 'always',
    // Lets the WebView pick up the safe-area insets so the bottom nav
    // doesn't slide under the home indicator.
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
