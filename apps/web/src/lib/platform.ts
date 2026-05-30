/**
 * Tiny platform detection helpers — used to show iOS-specific instructions
 * when the user can't yet enable push (Safari only allows web push from
 * an installed PWA on iOS 16.4+).
 */

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ reports as Mac; the touch check catches it.
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  );
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS uses non-standard navigator.standalone; everyone else uses display-mode.
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

/** True when the user needs to install the PWA before push will work. */
export function needsIOSInstall(): boolean {
  return isIOS() && !isStandalonePWA();
}
