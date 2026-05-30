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
