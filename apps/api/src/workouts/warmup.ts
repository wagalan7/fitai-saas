/**
 * Deterministic warm-up & mobility generator.
 *
 * A real coach never lets an athlete walk in and load the first work set cold.
 * They prescribe (1) a general raise to lift core temperature and heart rate,
 * then (2) joint-specific mobility and activation drills for the muscles that
 * day's session will hammer — and tell them to ramp the first big lift with
 * progressively heavier feeder sets.
 *
 * This is computed, NOT AI-generated or persisted: it's a pure function of the
 * session's `muscleGroups`, so it stays consistent, costs nothing, and can be
 * attached to every session in the API response (see WorkoutsService).
 */

export interface WarmupDrill {
  name: string;
  /** How to perform it — reps, time, or per-side guidance. */
  prescription: string;
}

export interface Warmup {
  /** Total suggested warm-up time in minutes. */
  durationMinutes: number;
  /** General raise (cardio / pulse-raiser) — always present. */
  general: WarmupDrill[];
  /** Joint mobility + muscle activation specific to the day's muscle groups. */
  specific: WarmupDrill[];
  /** Coaching note about ramp-up / feeder sets before the first heavy lift. */
  rampNote: string;
}

function normalize(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DrillGroup {
  /** Substrings (normalized) that map a muscleGroup label to this group. */
  match: string[];
  drills: WarmupDrill[];
}

// Ordered: first matching group per muscle label wins. Drills are deduped by
// name across all matched groups so overlapping days don't repeat a mobilization.
const DRILL_GROUPS: DrillGroup[] = [
  {
    match: ['peito', 'peitoral', 'supino'],
    drills: [
      { name: 'Rotação de ombros com banda', prescription: '2 × 15 (frente e trás)' },
      { name: 'Flexão escapular (push-up plus)', prescription: '2 × 12' },
      { name: 'Crucifixo leve de ativação', prescription: '2 × 15 com carga muito leve' },
    ],
  },
  {
    match: ['costa', 'dorsal', 'remada', 'puxada'],
    drills: [
      { name: 'Cat-camel (mobilidade torácica)', prescription: '2 × 10' },
      { name: 'Retração escapular na banda', prescription: '2 × 15' },
      { name: 'Pull-apart com banda', prescription: '2 × 20' },
    ],
  },
  {
    match: ['ombro', 'deltoid', 'desenvolvimento'],
    drills: [
      { name: 'Circundução de ombros', prescription: '2 × 12 (cada direção)' },
      { name: 'Face pull leve com banda', prescription: '2 × 15' },
      { name: 'Elevação em Y na banda', prescription: '2 × 12' },
    ],
  },
  {
    match: ['perna', 'quadr', 'coxa', 'agachamento', 'leg'],
    drills: [
      { name: 'Mobilidade de tornozelo na parede', prescription: '2 × 10 (cada lado)' },
      { name: 'Agachamento livre sem carga', prescription: '2 × 12 (amplitude total)' },
      { name: 'Afundo com mobilidade de quadril', prescription: '2 × 8 (cada perna)' },
      { name: 'Leg press / cadeira extensora leve', prescription: '2 × 15 de ativação' },
    ],
  },
  {
    match: ['gluteo', 'gluteos', 'posterior', 'femoral', 'stiff', 'terra'],
    drills: [
      { name: 'Ponte de glúteo', prescription: '2 × 15' },
      { name: 'Caminhada lateral com mini-band', prescription: '2 × 12 (cada lado)' },
      { name: 'Bom-dia sem carga (dobradiça de quadril)', prescription: '2 × 12' },
    ],
  },
  {
    match: ['biceps', 'rosca'],
    drills: [
      { name: 'Rotação de punho e cotovelo', prescription: '2 × 15' },
      { name: 'Rosca leve de ativação', prescription: '2 × 15 com carga muito leve' },
    ],
  },
  {
    match: ['triceps', 'extensao'],
    drills: [
      { name: 'Rotação de punho e cotovelo', prescription: '2 × 15' },
      { name: 'Extensão de tríceps leve na corda', prescription: '2 × 15 de ativação' },
    ],
  },
  {
    match: ['abdom', 'core', 'abdominal', 'lombar'],
    drills: [
      { name: 'Prancha frontal', prescription: '2 × 20s' },
      { name: 'Dead bug', prescription: '2 × 10 (cada lado)' },
      { name: 'Bird-dog', prescription: '2 × 10 (cada lado)' },
    ],
  },
];

const CARDIO_GENERAL: WarmupDrill[] = [
  { name: 'Aquecimento progressivo', prescription: '5 min em ritmo leve, subindo gradualmente' },
  { name: 'Mobilidade dinâmica geral', prescription: '2 min (tornozelos, quadris, ombros)' },
];

const DEFAULT_GENERAL: WarmupDrill[] = [
  { name: 'Esteira ou bike (pulso)', prescription: '5 min em ritmo leve' },
  { name: 'Mobilidade dinâmica geral', prescription: '5-8 movimentos articulares' },
];

/**
 * Builds a structured warm-up for a session given its muscle groups.
 * Pure & deterministic — same input always yields the same warm-up.
 */
export function buildWarmup(muscleGroups: string[] | undefined | null): Warmup {
  const groups = (muscleGroups || []).map(normalize).filter(Boolean);

  const isCardioOnly =
    groups.length > 0 &&
    groups.every((g) => g.includes('cardio') || g.includes('aerob'));

  if (isCardioOnly) {
    return {
      durationMinutes: 7,
      general: CARDIO_GENERAL,
      specific: [],
      rampNote:
        'Comece bem leve e aumente a intensidade aos poucos nos primeiros minutos antes de atingir o ritmo alvo.',
    };
  }

  // Collect specific drills for every matched muscle group, deduped by name.
  const seen = new Set<string>();
  const specific: WarmupDrill[] = [];
  for (const g of groups) {
    for (const dg of DRILL_GROUPS) {
      if (dg.match.some((m) => g.includes(m))) {
        for (const d of dg.drills) {
          const key = normalize(d.name);
          if (!seen.has(key)) {
            seen.add(key);
            specific.push(d);
          }
        }
        break; // first matching group wins for this label
      }
    }
  }

  // Cap specific drills so the warm-up stays ~8-10 min, prioritizing variety
  // across the muscle groups already collected in order.
  const cappedSpecific = specific.slice(0, 5);

  return {
    durationMinutes: cappedSpecific.length >= 4 ? 10 : 8,
    general: DEFAULT_GENERAL,
    specific: cappedSpecific,
    rampNote:
      'Antes da primeira série pesada de cada exercício composto, faça 2-3 séries de aproximação (feeder sets) subindo a carga progressivamente até o peso de trabalho.',
  };
}
