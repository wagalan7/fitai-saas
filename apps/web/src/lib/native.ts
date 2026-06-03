/**
 * Native bridge — feature-detects the Capacitor runtime and exposes
 * tiny helpers the rest of the web app can call unconditionally. When
 * we're running in the browser/PWA (no Capacitor injected), every
 * helper short-circuits to a noop / safe default. That's important
 * because the same Next.js bundle is served to both targets.
 *
 * The actual @capacitor/* and @perfood/capacitor-healthkit packages
 * are NOT imported by the web app — they live in apps/mobile and are
 * provided at runtime by the Capacitor shell. We reach into them via
 * `window.Capacitor` so the web build doesn't try to bundle native
 * code that has no chance of working in a browser.
 */
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: Record<string, any>;
      getPlatform?: () => string;
    };
  }
}

export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  const p = window.Capacitor?.getPlatform?.() ?? 'web';
  return p === 'ios' || p === 'android' ? p : 'web';
}

/**
 * Asks the user for HealthKit read/write permission for workouts +
 * active energy. Safe to call on web — returns false without prompting.
 *
 * Permissions are scoped narrowly on purpose: Apple's reviewers ding
 * apps that request everything. We ask for what we need to (a) read
 * Apple Watch workouts the user already logged and (b) write workouts
 * the user completes in FitAI back to Health.
 */
export async function requestHealthAuth(): Promise<boolean> {
  if (!isNative() || getPlatform() !== 'ios') return false;
  const HealthKit = window.Capacitor?.Plugins?.CapacitorHealthkit;
  if (!HealthKit) return false;
  try {
    await HealthKit.requestAuthorization({
      all: [],
      read: ['workouts', 'activeEnergy', 'heartRate'],
      write: ['workouts'],
    });
    return true;
  } catch {
    return false;
  }
}

export interface NativeWorkout {
  startDate: string; // ISO
  endDate: string;
  duration: number; // seconds
  totalEnergyBurned?: number; // kcal
  workoutActivityType?: string;
  sourceName?: string; // "Apple Watch" / "FitAI" / etc.
  uuid?: string;
}

/**
 * Pulls workouts from HealthKit between two dates. Returns [] on web
 * or if the user hasn't granted permission. The shape mirrors what
 * `@perfood/capacitor-healthkit` returns; if we swap plugins later
 * we'll adapt here, not in callers.
 */
/**
 * Asks for native push permission (iOS APNs), gets the device token, and
 * POSTs it to the API so the backend can fan out alerts from
 * /reminders, /workouts/generate, etc. Idempotent — runs at most once per
 * boot (Capacitor caches the token; we de-dup in the API by token PK).
 *
 * Safe to call on web — returns null without prompting.
 */
let pushRegistrationStarted = false;
export async function registerNativePush(
  postDeviceToken: (token: string) => Promise<unknown>,
): Promise<string | null> {
  if (!isNative() || getPlatform() !== 'ios') return null;
  if (pushRegistrationStarted) return null;
  pushRegistrationStarted = true;

  const Push = window.Capacitor?.Plugins?.PushNotifications;
  if (!Push) return null;

  try {
    const perm = await Push.requestPermissions();
    if (perm?.receive !== 'granted') return null;

    return await new Promise<string | null>((resolve) => {
      let resolved = false;
      const settle = (token: string | null) => {
        if (resolved) return;
        resolved = true;
        resolve(token);
      };
      Push.addListener('registration', async (info: { value: string }) => {
        const token = info?.value;
        if (!token) return settle(null);
        try {
          await postDeviceToken(token);
        } catch (err) {
          console.warn('[push] device-token POST failed', err);
        }
        settle(token);
      });
      Push.addListener('registrationError', (err: any) => {
        console.warn('[push] registrationError', err);
        settle(null);
      });
      Push.register();
      // Belt & suspenders — if Apple is slow, don't keep the caller blocked
      setTimeout(() => settle(null), 8000);
    });
  } catch (err) {
    console.warn('[push] registerNativePush failed', err);
    return null;
  }
}

export async function fetchNativeWorkouts(
  startDate: Date,
  endDate: Date = new Date(),
): Promise<NativeWorkout[]> {
  if (!isNative() || getPlatform() !== 'ios') return [];
  const HealthKit = window.Capacitor?.Plugins?.CapacitorHealthkit;
  if (!HealthKit) return [];
  try {
    const res = await HealthKit.queryHKitSampleType({
      sampleName: 'workoutType',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: 100,
    });
    return (res?.resultData ?? []) as NativeWorkout[];
  } catch {
    return [];
  }
}
