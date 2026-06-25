/**
 * Plan explicability ("por que esse treino?").
 *
 * A good coach can always explain WHY the program looks the way it does — the
 * split, the volume, the rep ranges, the current week's intensity. This pure
 * module turns the user's profile + the live periodization phase + the plan's
 * own structure into a short, human rationale the UI can show next to the plan.
 *
 * Deterministic and DB-free on purpose: same inputs → same explanation, no AI
 * call, instant to render, trivially testable.
 */

export interface RationaleInput {
  fitnessGoal?: string | null; // FitnessGoal enum value
  fitnessLevel?: string | null; // FitnessLevel enum value
  workoutsPerWeek?: number | null;
  workoutDuration?: number | null; // minutes
  injuries?: string[] | null;
  sessionCount: number; // how many training days the plan actually has
  muscleGroups: string[]; // de-duped across all sessions
  periodization: {
    phase: string;
    currentWeek: number;
    cycleWeeks: number;
    isDeload: boolean;
    rpeTarget: string;
  };
}

export interface RationalePoint {
  /** Stable key so the UI can map an icon without parsing copy. */
  key: 'goal' | 'level' | 'split' | 'periodization' | 'volume' | 'injuries';
  title: string;
  detail: string;
}

export interface PlanRationale {
  summary: string;
  points: RationalePoint[];
}

const GOAL_LABEL: Record<string, string> = {
  LOSE_WEIGHT: 'emagrecimento',
  GAIN_MUSCLE: 'ganho de massa muscular',
  MAINTAIN: 'manutenção',
  IMPROVE_ENDURANCE: 'resistência',
  IMPROVE_FLEXIBILITY: 'flexibilidade e mobilidade',
  GENERAL_FITNESS: 'condicionamento geral',
};

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: 'iniciante',
  INTERMEDIATE: 'intermediário',
  ADVANCED: 'avançado',
  ATHLETE: 'atleta',
};

function goalDetail(goal: string): string {
  switch (goal) {
    case 'LOSE_WEIGHT':
      return 'Priorizamos exercícios compostos e densidade de treino (descansos curtos) para maximizar o gasto calórico, preservando massa magra com cargas significativas.';
    case 'GAIN_MUSCLE':
      return 'O foco é volume e sobrecarga progressiva nas faixas de hipertrofia (6-12 reps), com cada grupo muscular treinado em frequência suficiente para crescer.';
    case 'IMPROVE_ENDURANCE':
      return 'Trabalhamos faixas de repetição mais altas e descansos menores para elevar a capacidade de trabalho e a resistência muscular.';
    case 'IMPROVE_FLEXIBILITY':
      return 'A estrutura privilegia amplitude de movimento e padrões de mobilidade, integrados ao trabalho de força.';
    case 'MAINTAIN':
      return 'Volume e intensidade são calibrados para sustentar seus ganhos atuais sem fadiga excessiva.';
    default:
      return 'O plano equilibra força, condicionamento e mobilidade para uma evolução geral consistente.';
  }
}

function splitDetail(sessionCount: number, perWeek: number): string {
  if (sessionCount <= 1) {
    return 'Treino de corpo inteiro: com baixa frequência, estimular o corpo todo a cada sessão rende mais que dividir por grupos.';
  }
  if (sessionCount === 2) {
    return 'Divisão em 2 (ex. superior/inferior ou empurrar/puxar): cada grupo é treinado ~2x na semana, ótimo equilíbrio entre estímulo e recuperação.';
  }
  if (sessionCount === 3) {
    return 'Divisão em 3 dias: distribui o volume sem sobrecarregar nenhuma sessão, deixando dias de recuperação entre grupos próximos.';
  }
  if (sessionCount >= 5) {
    return `Divisão em ${sessionCount} dias: o volume semanal é fatiado em sessões mais curtas e focadas, permitindo mais qualidade por grupo muscular.`;
  }
  return `Divisão em ${sessionCount} dias, alinhada à sua disponibilidade de ${perWeek}x por semana, com recuperação adequada entre grupos.`;
}

function periodizationDetail(p: RationaleInput['periodization']): string {
  if (p.isDeload) {
    return `Você está na semana ${p.currentWeek} de ${p.cycleWeeks} — o DELOAD. Reduzimos volume e carga (RPE ${p.rpeTarget}) de propósito: é quando o corpo supercompensa e os ganhos das semanas anteriores "assentam".`;
  }
  return `Semana ${p.currentWeek} de ${p.cycleWeeks}, fase de ${p.phase} (RPE alvo ${p.rpeTarget}). A intensidade sobe ao longo do ciclo e termina com um deload, em vez de pegar pesado toda semana — é assim que se progride sem estagnar ou se machucar.`;
}

/**
 * Builds the rationale. All fields are best-effort; missing profile data just
 * trims the corresponding point rather than failing.
 */
export function buildPlanRationale(input: RationaleInput): PlanRationale {
  const goal = (input.fitnessGoal || 'GENERAL_FITNESS').toUpperCase();
  const level = (input.fitnessLevel || 'BEGINNER').toUpperCase();
  const perWeek = Math.max(1, Math.round(input.workoutsPerWeek || input.sessionCount || 3));
  const goalLabel = GOAL_LABEL[goal] || GOAL_LABEL.GENERAL_FITNESS;
  const levelLabel = LEVEL_LABEL[level] || LEVEL_LABEL.BEGINNER;

  const points: RationalePoint[] = [];

  points.push({
    key: 'goal',
    title: `Objetivo: ${goalLabel}`,
    detail: goalDetail(goal),
  });

  points.push({
    key: 'level',
    title: `Nível: ${levelLabel}`,
    detail:
      level === 'BEGINNER'
        ? 'Como iniciante, priorizamos execução e exercícios mais seguros/estáveis — a maior parte do progresso vem de aprender o movimento e ser consistente.'
        : level === 'ADVANCED' || level === 'ATHLETE'
          ? 'No seu nível, o plano usa maior volume e técnicas de intensidade, porque seu corpo já precisa de um estímulo mais forte para continuar evoluindo.'
          : 'No nível intermediário, equilibramos volume e intensidade e introduzimos progressão de carga mais agressiva que a fase inicial.',
  });

  points.push({
    key: 'split',
    title: `${input.sessionCount} ${input.sessionCount === 1 ? 'dia' : 'dias'} de treino`,
    detail: splitDetail(input.sessionCount, perWeek),
  });

  points.push({
    key: 'periodization',
    title: `Periodização: ${input.periodization.phase}`,
    detail: periodizationDetail(input.periodization),
  });

  if (input.workoutDuration && input.workoutDuration > 0) {
    points.push({
      key: 'volume',
      title: `Sessões de ~${input.workoutDuration} min`,
      detail: `O número de exercícios e séries cabe na sua janela de ${input.workoutDuration} minutos, para você conseguir cumprir o treino completo sem correria.`,
    });
  }

  const injuries = (input.injuries || []).filter((i) => i && i.trim());
  if (injuries.length > 0) {
    points.push({
      key: 'injuries',
      title: 'Adaptado às suas limitações',
      detail: `Levamos em conta ${injuries.join(', ')}: evitamos ou substituímos movimentos de risco para essas áreas, mantendo o estímulo com alternativas seguras.`,
    });
  }

  const summary = `Este plano foi montado para ${goalLabel}, no nível ${levelLabel}, com ${input.sessionCount} ${
    input.sessionCount === 1 ? 'sessão' : 'sessões'
  } por ciclo. Agora você está na fase de ${input.periodization.phase} (semana ${input.periodization.currentWeek}/${input.periodization.cycleWeeks}).`;

  return { summary, points };
}
