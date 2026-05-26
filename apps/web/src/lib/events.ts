// Lightweight cross-page event bus over CustomEvent. Used to notify pages
// like /workouts and /nutrition that the active plan changed (e.g. after the
// chat auto-regenerated both plans following a Dr Shape evaluation), so they
// refetch instead of showing stale data.

type PlanKind = 'workout' | 'nutrition';

export const PLAN_UPDATED_EVENT = 'fitai:plan-updated';

export function emitPlanUpdated(kind: PlanKind) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PLAN_UPDATED_EVENT, { detail: { kind } }));
}

export function onPlanUpdated(
  kind: PlanKind,
  handler: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail as { kind: PlanKind } | undefined;
    if (detail?.kind === kind) handler();
  };
  window.addEventListener(PLAN_UPDATED_EVENT, listener);
  return () => window.removeEventListener(PLAN_UPDATED_EVENT, listener);
}
