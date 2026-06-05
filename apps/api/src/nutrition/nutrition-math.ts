/**
 * Deterministic nutrition targets.
 *
 * The nutritionist agent used to invent the daily calorie/macro headline,
 * which drifted run-to-run and ignored the user's actual body. This computes
 * the numbers in code (Mifflin-St Jeor BMR → activity factor → goal
 * adjustment → macro split) so the headline is always defensible, and the AI
 * only has to distribute that target across meals.
 *
 * Returns null when the profile lacks the data to compute (new user with
 * zero weight/height/age) — the caller then falls back to letting the AI
 * estimate, rather than producing a nonsense number.
 */

export interface NutritionTargets {
  bmr: number;
  tdee: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  rationale: string;
}

export interface NutritionProfileInput {
  genderIdentity?: string | null;
  age?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  fitnessGoal?: string | null;
  workoutsPerWeek?: number | null;
}

/** Mifflin-St Jeor BMR (kcal/day). */
function mifflinStJeor(
  sex: 'male' | 'female' | 'other',
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  // Sex constant: +5 men, -161 women, average (-78) when unknown/other.
  const offset = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return base + offset;
}

/** TDEE multiplier from weekly training frequency. */
function activityFactor(workoutsPerWeek: number): number {
  if (workoutsPerWeek <= 1) return 1.2; // sedentary
  if (workoutsPerWeek <= 3) return 1.375; // light
  if (workoutsPerWeek <= 5) return 1.55; // moderate
  return 1.725; // very active (6+)
}

/** Goal-based calorie delta applied to TDEE. */
function goalCalorieMultiplier(goal: string): number {
  switch (goal) {
    case 'LOSE_WEIGHT':
      return 0.8; // 20% deficit
    case 'GAIN_MUSCLE':
      return 1.1; // 10% lean surplus
    default:
      return 1.0; // MAINTAIN / GENERAL_FITNESS / IMPROVE_* → maintenance
  }
}

/** Protein target in g/kg of bodyweight, by goal. */
function proteinPerKg(goal: string): number {
  // Higher protein when cutting (muscle preservation) or building.
  if (goal === 'LOSE_WEIGHT' || goal === 'GAIN_MUSCLE') return 2.0;
  return 1.6;
}

function normalizeSex(genderIdentity?: string | null): 'male' | 'female' | 'other' {
  const g = (genderIdentity || '').toUpperCase();
  if (g === 'MALE' || g === 'MASCULINO' || g === 'M') return 'male';
  if (g === 'FEMALE' || g === 'FEMININO' || g === 'F') return 'female';
  return 'other';
}

const round = (n: number) => Math.round(n);
const round5 = (n: number) => Math.round(n / 5) * 5;

export function computeNutritionTargets(
  profile: NutritionProfileInput,
): NutritionTargets | null {
  const weightKg = Number(profile.weightKg) || 0;
  const heightCm = Number(profile.heightCm) || 0;
  const age = Number(profile.age) || 0;

  // Not enough data to compute anything trustworthy.
  if (weightKg < 25 || heightCm < 100 || age < 12) return null;

  const sex = normalizeSex(profile.genderIdentity);
  const goal = (profile.fitnessGoal || 'GENERAL_FITNESS').toUpperCase();
  const workouts = Math.max(0, Number(profile.workoutsPerWeek) || 0);

  const bmr = mifflinStJeor(sex, weightKg, heightCm, age);
  const tdee = bmr * activityFactor(workouts);
  let calories = tdee * goalCalorieMultiplier(goal);

  // Safety floor: never prescribe below BMR or below sex-based minimums.
  const floor = Math.max(bmr, sex === 'female' ? 1200 : 1500);
  if (calories < floor) calories = floor;

  // Macros: protein from bodyweight, fat at 25% of calories, carbs fill rest.
  const proteinG = round(proteinPerKg(goal) * weightKg);
  const fatG = round((calories * 0.25) / 9);
  const carbsG = Math.max(0, round((calories - proteinG * 4 - fatG * 9) / 4));

  const goalLabel =
    goal === 'LOSE_WEIGHT'
      ? 'déficit de 20% para perda de gordura'
      : goal === 'GAIN_MUSCLE'
        ? 'superávit de 10% para ganho de massa'
        : 'manutenção';

  const calRounded = round5(calories);

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    calories: calRounded,
    proteinG,
    carbsG,
    fatG,
    rationale: `BMR ${round(bmr)} kcal (Mifflin-St Jeor) × fator de atividade ${activityFactor(
      workouts,
    )} = TDEE ${round(tdee)} kcal; ${goalLabel} → ${calRounded} kcal/dia.`,
  };
}
