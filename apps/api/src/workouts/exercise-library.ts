/**
 * Exercise demonstration resolver.
 *
 * The AI generator is constrained to a known whitelist of Portuguese exercise
 * names (see generation.prompt.ts). For each canonical movement we map to a
 * *curated* YouTube search query that reliably lands on a good technique demo,
 * instead of the noisy raw "<name> como fazer" search the web page did inline.
 *
 * Why a search deep-link and not an embedded GIF/MP4?
 *  - Zero hosting, zero copyright risk, zero external API key.
 *  - Always resolves to fresh, Portuguese, real coaching demos.
 *  - The resolver is the single swap-point: to move to hosted GIFs later,
 *    change only `buildUrl()` — callers (cleanSession) stay the same.
 *
 * The result is stored on Exercise.videoUrl so every client (web, iOS,
 * Apple Watch) shows the same curated demo, not a per-screen reimplementation.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\s+/g, ' ')
    .trim();
}

function buildUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${query} execução correta técnica academia`,
  )}`;
}

/**
 * Ordered entries — first match wins, so specific variants come before the
 * generic base. `keywords` ALL must be substrings of the normalized name.
 */
const LIBRARY: Array<{ keywords: string[]; query: string }> = [
  // ── Peito ──────────────────────────────────────────────────────────────
  { keywords: ['supino', 'inclinad'], query: 'supino inclinado' },
  { keywords: ['supino', 'declinad'], query: 'supino declinado' },
  { keywords: ['supino', 'reto'], query: 'supino reto' },
  { keywords: ['supino'], query: 'supino reto' },
  { keywords: ['crucifixo', 'inclinad'], query: 'crucifixo inclinado halteres' },
  { keywords: ['crucifixo'], query: 'crucifixo halteres peito' },
  { keywords: ['crossover'], query: 'crossover cabo peito' },
  { keywords: ['flexao', 'braco'], query: 'flexão de braço' },
  // NB: bare ['flexao'] lives at the very end — otherwise it shadows the leg
  // "Flexão de Pernas (Femoral)" which must resolve to mesa flexora.
  { keywords: ['peck', 'deck'], query: 'peck deck voador máquina' },
  { keywords: ['voador'], query: 'voador máquina peito' },

  // ── Costas ─────────────────────────────────────────────────────────────
  { keywords: ['puxada', 'frontal'], query: 'puxada frontal pulldown' },
  { keywords: ['puxada', 'fechad'], query: 'puxada fechada triângulo' },
  { keywords: ['puxada'], query: 'puxada frontal pulldown' },
  { keywords: ['remada', 'curvad'], query: 'remada curvada barra' },
  { keywords: ['remada', 'serrote'], query: 'remada serrote halter' },
  { keywords: ['remada', 'cavalinho'], query: 'remada cavalinho' },
  { keywords: ['remada', 'baixa'], query: 'remada baixa máquina' },
  { keywords: ['remada', 'unilateral'], query: 'remada unilateral halter' },
  { keywords: ['remada'], query: 'remada costas' },
  { keywords: ['levantamento', 'terra'], query: 'levantamento terra deadlift' },
  { keywords: ['pull', 'up'], query: 'barra fixa pull up' },
  { keywords: ['barra', 'fixa'], query: 'barra fixa pull up' },
  { keywords: ['pulldown'], query: 'pulldown puxada' },

  // ── Ombros ─────────────────────────────────────────────────────────────
  { keywords: ['desenvolvimento', 'halter'], query: 'desenvolvimento com halteres ombro' },
  { keywords: ['desenvolvimento', 'barra'], query: 'desenvolvimento com barra ombro' },
  { keywords: ['desenvolvimento', 'arnold'], query: 'arnold press' },
  { keywords: ['arnold'], query: 'arnold press' },
  { keywords: ['desenvolvimento'], query: 'desenvolvimento ombro' },
  { keywords: ['elevacao', 'lateral'], query: 'elevação lateral halteres' },
  { keywords: ['elevacao', 'frontal'], query: 'elevação frontal halteres' },
  { keywords: ['face', 'pull'], query: 'face pull ombro posterior' },
  { keywords: ['remada', 'alta'], query: 'remada alta ombro' },
  { keywords: ['encolhimento'], query: 'encolhimento trapézio' },

  // ── Bíceps ─────────────────────────────────────────────────────────────
  { keywords: ['rosca', 'alternad'], query: 'rosca alternada halteres' },
  { keywords: ['rosca', 'martelo'], query: 'rosca martelo' },
  { keywords: ['rosca', 'concentrad'], query: 'rosca concentrada' },
  { keywords: ['rosca', 'scott'], query: 'rosca scott banco' },
  { keywords: ['rosca', 'direta'], query: 'rosca direta barra bíceps' },
  { keywords: ['rosca'], query: 'rosca bíceps' },

  // ── Tríceps ────────────────────────────────────────────────────────────
  { keywords: ['triceps', 'testa'], query: 'tríceps testa' },
  { keywords: ['triceps', 'pulley'], query: 'tríceps pulley corda' },
  { keywords: ['triceps', 'frances'], query: 'tríceps francês' },
  { keywords: ['triceps', 'corda'], query: 'tríceps corda pulley' },
  { keywords: ['triceps', 'coice'], query: 'tríceps coice kickback' },
  { keywords: ['kickback'], query: 'tríceps coice kickback' },
  { keywords: ['mergulho'], query: 'mergulho banco tríceps' },
  { keywords: ['triceps'], query: 'tríceps' },

  // ── Pernas / Glúteos ──────────────────────────────────────────────────
  { keywords: ['agachamento', 'sumo'], query: 'agachamento sumô' },
  { keywords: ['agachamento', 'bulgaro'], query: 'agachamento búlgaro' },
  { keywords: ['agachamento', 'hack'], query: 'hack squat máquina' },
  { keywords: ['agachamento', 'livre'], query: 'agachamento livre barra' },
  { keywords: ['agachamento'], query: 'agachamento livre' },
  { keywords: ['leg', 'press'], query: 'leg press 45' },
  { keywords: ['extensao', 'perna'], query: 'cadeira extensora quadríceps' },
  { keywords: ['cadeira', 'extensora'], query: 'cadeira extensora quadríceps' },
  { keywords: ['flexao', 'perna'], query: 'mesa flexora posterior coxa' },
  { keywords: ['mesa', 'flexora'], query: 'mesa flexora posterior coxa' },
  { keywords: ['femoral'], query: 'mesa flexora femoral' },
  { keywords: ['cadeira', 'flexora'], query: 'cadeira flexora femoral' },
  { keywords: ['stiff'], query: 'stiff posterior glúteo' },
  { keywords: ['cadeira', 'abdutora'], query: 'cadeira abdutora glúteo' },
  { keywords: ['cadeira', 'adutora'], query: 'cadeira adutora' },
  { keywords: ['abducao'], query: 'abdução de quadril glúteo' },
  { keywords: ['hip', 'thrust'], query: 'hip thrust glúteo' },
  { keywords: ['elevacao', 'pelvica'], query: 'elevação pélvica glúteo' },
  { keywords: ['afundo'], query: 'afundo passada' },
  { keywords: ['passada'], query: 'passada afundo' },
  { keywords: ['avanco'], query: 'avanço afundo' },
  { keywords: ['panturrilha', 'sentad'], query: 'panturrilha sentado' },
  { keywords: ['panturrilha'], query: 'panturrilha em pé' },

  // ── Abdômen / Core ────────────────────────────────────────────────────
  { keywords: ['prancha'], query: 'prancha abdominal isometria' },
  { keywords: ['abdominal', 'bicicleta'], query: 'abdominal bicicleta' },
  { keywords: ['abdominal', 'crunch'], query: 'abdominal crunch' },
  { keywords: ['russian', 'twist'], query: 'russian twist abdominal oblíquo' },
  { keywords: ['elevacao', 'pernas'], query: 'elevação de pernas abdominal inferior' },
  { keywords: ['abdominal'], query: 'abdominal' },

  // ── Cardio ─────────────────────────────────────────────────────────────
  { keywords: ['corrida'], query: 'corrida técnica' },
  { keywords: ['caminhada'], query: 'caminhada inclinada esteira' },
  { keywords: ['esteira'], query: 'esteira treino' },
  { keywords: ['ciclismo'], query: 'bike ergométrica treino' },
  { keywords: ['bike'], query: 'bike ergométrica treino' },
  { keywords: ['natacao'], query: 'natação técnica' },
  { keywords: ['eliptico'], query: 'elíptico transport' },
  { keywords: ['pular', 'corda'], query: 'pular corda técnica' },
  { keywords: ['hiit'], query: 'treino hiit' },

  // ── Last-resort generics (kept at the very end so they never shadow a
  //    more specific multi-keyword match above) ───────────────────────────
  { keywords: ['flexao'], query: 'flexão de braço' },
];

/**
 * Resolves a demonstration URL for an exercise name. Always returns a usable
 * link — curated query for known movements, a sensible generic search for
 * anything unmapped.
 */
export function resolveExerciseVideo(name: string): string {
  const n = normalize(name || '');
  if (!n) return buildUrl('exercício academia');

  for (const entry of LIBRARY) {
    if (entry.keywords.every((k) => n.includes(k))) {
      return buildUrl(entry.query);
    }
  }
  // Unmapped: fall back to the raw name so the user still gets a relevant demo.
  return buildUrl(name);
}
