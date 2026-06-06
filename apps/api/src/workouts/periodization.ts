/**
 * Mesocycle periodization engine.
 *
 * A real coach doesn't run the same intensity every week — they wave volume
 * and load across a block and program a deload to let the body supercompensate.
 * This maps a (week, cycleWeeks) position to a phase + a directive injected
 * into both generation passes so the produced plan actually reflects where the
 * athlete is in the cycle.
 *
 * Default block = 4 weeks: Acumulação → Progressão → Intensificação → Deload.
 * Generalizes to any cycle length: the LAST week is always the deload, the
 * working weeks ramp intensity from accumulation to intensification.
 */

export interface Periodization {
  currentWeek: number;
  cycleWeeks: number;
  phase: string; // PT-BR phase label for the UI
  isDeload: boolean;
  rpeTarget: string; // e.g. "7", "7-8", "8-9", "5-6"
  /** Text block injected into skeleton + expansion prompts. */
  directive: string;
}

export function clampCycleWeeks(n: unknown): number {
  const v = Math.round(Number(n) || 4);
  if (v < 1) return 1;
  if (v > 8) return 8;
  return v;
}

/**
 * Resolves the periodization phase for a given mesocycle position.
 */
export function getPeriodization(
  currentWeek: number,
  cycleWeeks: number,
): Periodization {
  const cycle = clampCycleWeeks(cycleWeeks);
  const week = Math.min(Math.max(1, Math.round(currentWeek) || 1), cycle);

  const isDeload = cycle > 1 && week === cycle;

  if (isDeload) {
    return {
      currentWeek: week,
      cycleWeeks: cycle,
      phase: 'Deload',
      isDeload: true,
      rpeTarget: '5-6',
      directive: [
        `PERIODIZAÇÃO — SEMANA DE DELOAD (semana ${week} de ${cycle}).`,
        'Objetivo: recuperação e supercompensação. NÃO é semana de pegar pesado.',
        '- Reduza o VOLUME para ~60%: use 2-3 séries por exercício (em vez de 3-4).',
        '- RPE alvo 5-6 (deixe 3-4 repetições na reserva).',
        '- Cargas ~10-15% abaixo do habitual.',
        '- Mantenha os MESMOS padrões de movimento/exercícios, só alivie a intensidade.',
      ].join('\n'),
    };
  }

  // Working weeks: ramp intensity across the block (excluding the deload).
  const workingWeeks = Math.max(1, cycle - (cycle > 1 ? 1 : 0));
  const frac = week / workingWeeks; // 0 < frac <= 1

  let phase: string;
  let rpeTarget: string;
  let focus: string;
  if (frac <= 0.34) {
    phase = 'Acumulação';
    rpeTarget = '7';
    focus =
      'Foco em VOLUME com técnica perfeita. Deixe 3 repetições na reserva (RPE ~7). Construa a base do ciclo.';
  } else if (frac <= 0.67) {
    phase = 'Progressão';
    rpeTarget = '7-8';
    focus =
      'Aumente levemente a carga em relação à semana anterior mantendo as repetições. RPE 7-8.';
  } else {
    phase = 'Intensificação';
    rpeTarget = '8-9';
    focus =
      'Pico de intensidade do ciclo: cargas mais pesadas, pode reduzir 1-2 repetições no topo das séries. RPE 8-9, próximo do limite com boa técnica.';
  }

  return {
    currentWeek: week,
    cycleWeeks: cycle,
    phase,
    isDeload: false,
    rpeTarget,
    directive: [
      `PERIODIZAÇÃO — SEMANA ${week} de ${cycle}, Fase de ${phase} (RPE alvo ${rpeTarget}).`,
      focus,
    ].join('\n'),
  };
}
