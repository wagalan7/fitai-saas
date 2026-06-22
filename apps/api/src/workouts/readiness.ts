/**
 * Autoregulated deload — readiness analysis.
 *
 * A programmed deload (last week of the mesocycle) is a good baseline, but a
 * real coach also reads the athlete: if the last sessions came in at RPE 9 with
 * falling session ratings, fatigue has outrun the plan and a deload is due NOW,
 * not in three weeks. This turns the user's own logged RPE + session ratings
 * into a readiness signal and a concrete recommendation.
 *
 * Pure & deterministic over the inputs so it's trivially testable; the service
 * supplies the recent logs.
 */

export interface ReadinessInput {
  /** RPE values (1-10) from logged sets within the lookback window. */
  rpes: number[];
  /** Session ratings (1-5) within the lookback window. */
  ratings: number[];
  /** Number of distinct logged sessions in the window. */
  sessionsAnalyzed: number;
  /** True if the active plan is already in its programmed deload week. */
  alreadyDeloading: boolean;
}

export type ReadinessStatus = 'ok' | 'caution' | 'deload';

export interface Readiness {
  status: ReadinessStatus;
  recommendDeload: boolean;
  avgRpe: number | null;
  avgRating: number | null;
  sessionsAnalyzed: number;
  /** Whether we had enough data to make a confident call. */
  hasEnoughData: boolean;
  /** PT-BR explanation shown to the user. */
  reason: string;
}

function avg(xs: number[]): number | null {
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

const MIN_SESSIONS = 3;

export function analyzeReadiness(input: ReadinessInput): Readiness {
  const avgRpe = avg(input.rpes);
  const avgRating = avg(input.ratings);
  const sessionsAnalyzed = input.sessionsAnalyzed;
  const hasEnoughData = sessionsAnalyzed >= MIN_SESSIONS;

  if (input.alreadyDeloading) {
    return {
      status: 'ok',
      recommendDeload: false,
      avgRpe,
      avgRating,
      sessionsAnalyzed,
      hasEnoughData,
      reason:
        'Você já está numa semana de deload. Aproveite para recuperar antes de retomar a intensidade.',
    };
  }

  if (!hasEnoughData) {
    return {
      status: 'ok',
      recommendDeload: false,
      avgRpe,
      avgRating,
      sessionsAnalyzed,
      hasEnoughData,
      reason:
        'Ainda não há registros suficientes para avaliar a fadiga. Registre alguns treinos com RPE para liberar a autorregulação.',
    };
  }

  // High fatigue signals: sustained near-maximal RPE or low session ratings.
  const highRpe = avgRpe != null && avgRpe >= 8.5;
  const lowRating = avgRating != null && avgRating <= 2.3;
  const cautionRpe = avgRpe != null && avgRpe >= 7.8;
  const cautionRating = avgRating != null && avgRating <= 3;

  if (highRpe || lowRating) {
    const bits: string[] = [];
    if (highRpe) bits.push(`RPE médio ${avgRpe} (muito alto)`);
    if (lowRating) bits.push(`avaliação média ${avgRating}/5 (baixa)`);
    return {
      status: 'deload',
      recommendDeload: true,
      avgRpe,
      avgRating,
      sessionsAnalyzed,
      hasEnoughData,
      reason: `Sinais de fadiga acumulada nos últimos ${sessionsAnalyzed} treinos: ${bits.join(
        ' e ',
      )}. Um deload agora vai acelerar sua recuperação e destravar novos ganhos.`,
    };
  }

  if (cautionRpe || cautionRating) {
    return {
      status: 'caution',
      recommendDeload: false,
      avgRpe,
      avgRating,
      sessionsAnalyzed,
      hasEnoughData,
      reason:
        'Intensidade elevada nos treinos recentes. Continue monitorando o RPE — se subir mais, vale antecipar um deload.',
    };
  }

  return {
    status: 'ok',
    recommendDeload: false,
    avgRpe,
    avgRating,
    sessionsAnalyzed,
    hasEnoughData,
    reason:
      'Boa recuperação: o RPE e as avaliações recentes estão dentro do esperado. Siga com o ciclo planejado.',
  };
}
