/**
 * PROGRESSIVE OVERLOAD ENGINE
 *
 * Pure, deterministic double-progression. Given the prescribed rep range for an
 * exercise and the sets the user logged the LAST time they performed it, it
 * produces a concrete target for today — "subir a carga", "+1 rep", "consolidar"
 * — so the app coaches progression the way a trainer reads your logbook instead
 * of leaving the load decision to the user every session.
 *
 * Double-progression rule (the standard hypertrophy/strength heuristic):
 *   1. Work up reps inside the prescribed range at a fixed weight.
 *   2. Once you hit the TOP of the range (and it wasn't maximal), add the
 *      smallest sensible weight jump and reset reps to the bottom of the range.
 *   3. If the last session was truly maximal (very high RPE) and you fell short
 *      of the range, hold the weight and consolidate before progressing.
 *
 * No DB, no I/O — trivially unit-testable.
 */

export interface LoggedSet {
  reps?: number | null;
  weightKg?: number | null;
  durationSecs?: number | null;
  rpe?: number | null;
}

export type ProgressionKind =
  | 'increase_weight'
  | 'increase_reps'
  | 'increase_duration'
  | 'hold'
  | 'first_time';

export interface ProgressionSuggestion {
  hasHistory: boolean;
  kind: ProgressionKind;
  /** Snapshot of the best set from last time (top weight × reps). */
  last?: {
    weightKg?: number | null;
    reps?: number | null;
    durationSecs?: number | null;
    rpe?: number | null;
  };
  /** Concrete target for today (whichever fields apply). */
  targetWeightKg?: number | null;
  targetReps?: number | null;
  targetDurationSecs?: number | null;
  cue: string; // short pt-BR action, e.g. "Suba para 62,5 kg · 8 reps"
  reason: string; // one-line justification
}

/** lowercase + strip accents/punctuation so "Supino Reto" === "supino reto". */
export function normalizeExerciseName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface RepRange {
  low: number;
  high: number;
  isDuration: boolean;
}

/** Parses "8-12", "10", "30s", "30-60s" into a normalized range. */
function parseReps(reps: string): RepRange | null {
  const s = (reps || '').toLowerCase().trim();
  if (!s) return null;
  // Treat as time-based when it carries a seconds/minute marker and isn't "reps".
  const isDuration = /(\d)\s*(s|seg|"|min)/.test(s) && !s.includes('rep');
  const span = s.match(/(\d+)\s*[-–a]\s*(\d+)/);
  if (span) return { low: +span[1], high: +span[2], isDuration };
  const single = s.match(/(\d+)/);
  if (single) return { low: +single[1], high: +single[1], isDuration };
  return null;
}

/** Smallest sustainable jump: micro on light loads, 5 kg once you're strong. */
function weightIncrement(weightKg: number): number {
  if (weightKg >= 60) return 5;
  return 2.5;
}

/** Round to the nearest 0.5 kg (matches typical plate granularity with 1.25s). */
function roundKg(n: number): number {
  return Math.round(n * 2) / 2;
}

/** pt-BR number: integer stays plain, decimal uses a comma ("62,5"). */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

/** The heaviest set (tie-broken by reps) — the working set we progress from. */
function bestWeightedSet(sets: LoggedSet[]): LoggedSet | null {
  const weighted = sets.filter(
    (s) => typeof s.weightKg === 'number' && (s.weightKg as number) > 0,
  );
  if (!weighted.length) return null;
  return weighted.reduce((a, b) => {
    const aw = a.weightKg as number;
    const bw = b.weightKg as number;
    if (bw > aw) return b;
    if (bw < aw) return a;
    return (b.reps ?? 0) > (a.reps ?? 0) ? b : a;
  });
}

const NO_HISTORY: ProgressionSuggestion = {
  hasHistory: false,
  kind: 'first_time',
  cue: 'Primeira vez — registre as cargas para começar a progressão.',
  reason: 'Ainda não há histórico deste exercício.',
};

/**
 * Computes today's target for one exercise from its prescription + last log.
 */
export function suggestProgression(
  reps: string,
  lastSets: LoggedSet[],
): ProgressionSuggestion {
  if (!lastSets || lastSets.length === 0) return NO_HISTORY;
  const range = parseReps(reps);

  // ── Time-based holds (pranchas, isometrias, cardio) ──────────────────────
  if (range?.isDuration) {
    const best = lastSets.reduce<LoggedSet | null>(
      (a, s) => ((s.durationSecs ?? 0) > (a?.durationSecs ?? -1) ? s : a),
      null,
    );
    const lastDur = best?.durationSecs ?? null;
    if (lastDur == null || lastDur <= 0) return NO_HISTORY;
    const target = lastDur + 5;
    return {
      hasHistory: true,
      kind: 'increase_duration',
      last: { durationSecs: lastDur },
      targetDurationSecs: target,
      cue: `Meta: ${target}s (+5s)`,
      reason: `Da última vez você segurou ${lastDur}s.`,
    };
  }

  const best = bestWeightedSet(lastSets);

  // ── Bodyweight / reps-only (nothing weighted was logged) ─────────────────
  if (!best) {
    const bestReps = lastSets.reduce((m, s) => Math.max(m, s.reps ?? 0), 0);
    if (bestReps <= 0) return NO_HISTORY;
    const target = bestReps + 1;
    return {
      hasHistory: true,
      kind: 'increase_reps',
      last: { reps: bestReps },
      targetReps: target,
      cue: `Meta: ${target} reps (+1)`,
      reason: `Da última vez: ${bestReps} reps no peso do corpo.`,
    };
  }

  // ── Weighted — double progression ────────────────────────────────────────
  const w = best.weightKg as number;
  const r = best.reps ?? 0;
  const rpe = best.rpe ?? null;
  const high = range?.high ?? r;
  const low = range?.low ?? Math.max(1, r);

  // Hit (or beat) the top of the range and it wasn't maximal → add weight.
  if (r >= high && (rpe == null || rpe <= 9)) {
    const tw = roundKg(w + weightIncrement(w));
    const repLabel = low !== high ? `${low}-${high}` : `${low}`;
    return {
      hasHistory: true,
      kind: 'increase_weight',
      last: { weightKg: w, reps: r, rpe },
      targetWeightKg: tw,
      targetReps: low,
      cue: `Suba para ${fmt(tw)} kg · ${repLabel} reps`,
      reason: `Você fechou ${r} reps (topo da faixa) com ${fmt(w)} kg.`,
    };
  }

  // Truly maximal last time and short of the range → consolidate the load.
  if (rpe != null && rpe >= 9.5 && r < low) {
    return {
      hasHistory: true,
      kind: 'hold',
      last: { weightKg: w, reps: r, rpe },
      targetWeightKg: w,
      targetReps: r,
      cue: `Repita ${fmt(w)} kg · busque ${r}+ reps`,
      reason: `RPE ${rpe} na última — consolide a carga antes de subir.`,
    };
  }

  // Otherwise → same weight, chase +1 rep toward the top of the range.
  const tr = Math.min(r + 1, high);
  return {
    hasHistory: true,
    kind: 'increase_reps',
    last: { weightKg: w, reps: r, rpe },
    targetWeightKg: w,
    targetReps: tr,
    cue: `Mantenha ${fmt(w)} kg · meta ${tr} reps (+1)`,
    reason: `Da última vez: ${fmt(w)} kg × ${r} reps. Suba a carga ao fechar ${high}.`,
  };
}
