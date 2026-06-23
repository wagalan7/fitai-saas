/**
 * Diet auto-titration by weight trend.
 *
 * A real nutritionist doesn't set calories once and walk away — they watch the
 * scale trend over 2-3 weeks and nudge intake to keep the rate of change in the
 * right band for the goal: losing too slowly on a cut → drop calories; losing
 * too fast (muscle risk) → raise them; a lean bulk that stalled → add calories.
 *
 * This turns the user's logged body weight into a recommended calorie delta.
 * Pure & deterministic over the inputs (the service supplies the data), so it's
 * trivially testable and never invents numbers.
 */

export type FitnessGoal =
  | 'LOSE_WEIGHT'
  | 'GAIN_MUSCLE'
  | 'MAINTAIN'
  | 'IMPROVE_ENDURANCE'
  | 'IMPROVE_FLEXIBILITY'
  | 'GENERAL_FITNESS';

export interface WeightPoint {
  weightKg: number;
  loggedAt: Date | string;
}

export interface TitrationInput {
  goal: FitnessGoal;
  currentCalories: number;
  /** Body-weight logs, chronological ascending. Use ~21 days of history. */
  weights: WeightPoint[];
}

export type TitrationStatus =
  | 'on_track'
  | 'adjust_down'
  | 'adjust_up'
  | 'insufficient_data';

export interface DietTitration {
  status: TitrationStatus;
  hasEnoughData: boolean;
  currentWeightKg: number | null;
  weeklyChangeKg: number | null;
  weeklyChangePct: number | null;
  /** Target weekly change band (% of bodyweight) for the goal, for display. */
  targetWeeklyPct: { lo: number; hi: number };
  /** Signed calorie delta to apply (0 when on track / not enough data). */
  recommendDeltaKcal: number;
  /** currentCalories + delta, floored for safety. Null when no adjustment. */
  newCalories: number | null;
  dataPoints: number;
  spanDays: number;
  reason: string;
}

const MIN_POINTS = 3;
const MIN_SPAN_DAYS = 10;
const MIN_SAFE_CALORIES = 1200;

// Acceptable weekly change band per goal, as % of bodyweight. `lo`/`hi` are the
// "on track" edges; outside the wider guard band we recommend an adjustment.
const GOAL_BANDS: Record<FitnessGoal, { lo: number; hi: number; guardLo: number; guardHi: number; label: string }> = {
  LOSE_WEIGHT:        { lo: -1.0, hi: -0.4, guardLo: -1.2, guardHi: -0.3, label: 'perda de peso' },
  GAIN_MUSCLE:        { lo: 0.15, hi: 0.5,  guardLo: 0.1,  guardHi: 0.6,  label: 'ganho de massa' },
  MAINTAIN:           { lo: -0.3, hi: 0.3,  guardLo: -0.3, guardHi: 0.3,  label: 'manutenção' },
  IMPROVE_ENDURANCE:  { lo: -0.3, hi: 0.3,  guardLo: -0.3, guardHi: 0.3,  label: 'manutenção' },
  IMPROVE_FLEXIBILITY:{ lo: -0.3, hi: 0.3,  guardLo: -0.3, guardHi: 0.3,  label: 'manutenção' },
  GENERAL_FITNESS:    { lo: -0.3, hi: 0.3,  guardLo: -0.3, guardHi: 0.3,  label: 'manutenção' },
};

function dayDiff(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 86_400_000;
}

/** Least-squares slope (kg per day) of weight over time. */
function slopeKgPerDay(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

function stepFor(currentCalories: number): number {
  // ~10% of current intake, snapped to 50 kcal, bounded to a sane titration.
  const raw = Math.round((currentCalories * 0.1) / 50) * 50;
  return Math.min(300, Math.max(150, raw));
}

export function computeTitration(input: TitrationInput): DietTitration {
  const band = GOAL_BANDS[input.goal] ?? GOAL_BANDS.GENERAL_FITNESS;
  const targetWeeklyPct = { lo: band.lo, hi: band.hi };

  const pts = (input.weights || [])
    .map((w) => ({ d: new Date(w.loggedAt), y: w.weightKg }))
    .filter((p) => !isNaN(p.d.getTime()) && typeof p.y === 'number')
    .sort((a, b) => a.d.getTime() - b.d.getTime());

  const dataPoints = pts.length;
  const spanDays = dataPoints >= 2 ? Math.round(dayDiff(pts[dataPoints - 1].d, pts[0].d)) : 0;
  const currentWeightKg = dataPoints ? pts[dataPoints - 1].y : null;

  if (dataPoints < MIN_POINTS || spanDays < MIN_SPAN_DAYS) {
    return {
      status: 'insufficient_data',
      hasEnoughData: false,
      currentWeightKg,
      weeklyChangeKg: null,
      weeklyChangePct: null,
      targetWeeklyPct,
      recommendDeltaKcal: 0,
      newCalories: null,
      dataPoints,
      spanDays,
      reason:
        'Registre seu peso por pelo menos 10-14 dias (3+ medições) para a Nutricionista avaliar a tendência e ajustar as calorias.',
    };
  }

  const x0 = pts[0].d.getTime();
  const regPoints = pts.map((p) => ({ x: dayDiff(p.d, new Date(x0)), y: p.y }));
  const slope = slopeKgPerDay(regPoints); // kg/day
  const weeklyChangeKg = Math.round(slope * 7 * 100) / 100;
  const base = currentWeightKg || 1;
  const weeklyChangePct = Math.round((weeklyChangeKg / base) * 1000) / 10; // 1 decimal %

  const dirLabel = (kg: number) =>
    kg === 0 ? 'estável' : kg > 0 ? `+${kg}kg/semana` : `${kg}kg/semana`;

  // Too fast in the "wrong-but-good-intent" direction or not enough progress.
  if (weeklyChangePct > band.guardHi) {
    // Gaining faster than desired (cut: gaining; bulk: gaining too fast).
    const delta = -stepFor(input.currentCalories);
    const newCalories = Math.max(MIN_SAFE_CALORIES, input.currentCalories + delta);
    const reason =
      input.goal === 'GAIN_MUSCLE'
        ? `Você está ganhando rápido demais (${dirLabel(weeklyChangeKg)}), o que tende a acumular gordura. Reduzir ~${Math.abs(delta)} kcal mantém o ganho mais limpo.`
        : `A tendência de peso (${dirLabel(weeklyChangeKg)}) está acima do alvo de ${band.label}. Reduzir ~${Math.abs(delta)} kcal recoloca você na faixa.`;
    return {
      status: 'adjust_down',
      hasEnoughData: true,
      currentWeightKg,
      weeklyChangeKg,
      weeklyChangePct,
      targetWeeklyPct,
      recommendDeltaKcal: delta,
      newCalories,
      dataPoints,
      spanDays,
      reason,
    };
  }

  if (weeklyChangePct < band.guardLo) {
    // Losing faster than desired (bulk: losing; cut: losing too fast).
    const delta = stepFor(input.currentCalories);
    const newCalories = Math.max(MIN_SAFE_CALORIES, input.currentCalories + delta);
    const reason =
      input.goal === 'LOSE_WEIGHT'
        ? `Você está perdendo rápido demais (${dirLabel(weeklyChangeKg)}), o que arrisca perder músculo. Adicionar ~${delta} kcal preserva massa magra.`
        : `A tendência de peso (${dirLabel(weeklyChangeKg)}) está abaixo do alvo de ${band.label}. Adicionar ~${delta} kcal recoloca você na faixa.`;
    return {
      status: 'adjust_up',
      hasEnoughData: true,
      currentWeightKg,
      weeklyChangeKg,
      weeklyChangePct,
      targetWeeklyPct,
      recommendDeltaKcal: delta,
      newCalories,
      dataPoints,
      spanDays,
      reason,
    };
  }

  return {
    status: 'on_track',
    hasEnoughData: true,
    currentWeightKg,
    weeklyChangeKg,
    weeklyChangePct,
    targetWeeklyPct,
    recommendDeltaKcal: 0,
    newCalories: null,
    dataPoints,
    spanDays,
    reason: `Sua tendência de peso (${dirLabel(weeklyChangeKg)}) está dentro do alvo de ${band.label}. Mantenha as calorias atuais.`,
  };
}

/**
 * Re-derives plan macros for a new calorie target, keeping protein fixed
 * (protein is bodyweight-driven, not a titration lever) and letting carbs + fat
 * absorb the delta while preserving their current kcal ratio.
 */
export function retargetMacros(
  current: { calories: number; proteinG: number; carbsG: number; fatG: number },
  newCalories: number,
): { calories: number; proteinG: number; carbsG: number; fatG: number } {
  const proteinKcal = current.proteinG * 4;
  const oldCarbKcal = current.carbsG * 4;
  const oldFatKcal = current.fatG * 9;
  const oldNonProtein = oldCarbKcal + oldFatKcal;
  const newNonProtein = Math.max(0, newCalories - proteinKcal);

  // If there's no carb/fat baseline to scale, split the remainder 50/50 by kcal.
  const scale = oldNonProtein > 0 ? newNonProtein / oldNonProtein : 1;
  const newCarbsG =
    oldNonProtein > 0
      ? Math.round(current.carbsG * scale)
      : Math.round((newNonProtein * 0.5) / 4);
  const newFatG =
    oldNonProtein > 0
      ? Math.round(current.fatG * scale)
      : Math.round((newNonProtein * 0.5) / 9);

  return {
    calories: Math.round(newCalories),
    proteinG: Math.round(current.proteinG),
    carbsG: newCarbsG,
    fatG: newFatG,
  };
}
