/**
 * Client-side progress report → PDF.
 *
 * We deliberately avoid a PDF library (jsPDF/pdfkit) so nothing new touches the
 * monorepo lockfile/build. Instead we render a print-optimized A4 HTML document
 * into a hidden iframe and trigger the browser's print dialog, where the user
 * picks "Salvar como PDF". Works on desktop and mobile Safari/Chrome.
 */

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const num = (v: unknown, suffix = '') =>
  v === null || v === undefined || v === '' ? '—' : `${v}${suffix}`;

export interface ReportData {
  userName?: string;
  summary?: {
    currentWeight?: number | null;
    startWeight?: number | null;
    weightChange?: number | null;
    totalWorkouts?: number;
    totalMealsLogged?: number;
    latestMeasurements?: any;
  } | null;
  logs?: any[]; // ProgressLog[] ascending
  plan?: {
    name?: string;
    periodization?: { phase?: string; currentWeek?: number; cycleWeeks?: number };
    sessions?: any[];
  } | null;
  recentWorkouts?: any[]; // workout history items (most recent first)
}

function buildReportHtml(data: ReportData): string {
  const { userName, summary, logs = [], plan, recentWorkouts = [] } = data;
  const generatedAt = fmtDate(new Date());

  const sumCards = [
    { label: 'Peso atual', value: num(summary?.currentWeight, ' kg') },
    {
      label: 'Variação total',
      value:
        summary?.weightChange === null || summary?.weightChange === undefined
          ? '—'
          : `${summary.weightChange > 0 ? '+' : ''}${summary.weightChange} kg`,
    },
    { label: 'Treinos realizados', value: num(summary?.totalWorkouts) },
    { label: 'Refeições registradas', value: num(summary?.totalMealsLogged) },
  ]
    .map(
      (c) =>
        `<div class="card"><div class="card-label">${esc(c.label)}</div><div class="card-value">${esc(
          c.value,
        )}</div></div>`,
    )
    .join('');

  // Measurement history table (most recent first, cap to keep it one-ish page).
  const measRows = [...logs]
    .reverse()
    .slice(0, 24)
    .map(
      (l) => `<tr>
        <td>${esc(fmtDate(l.loggedAt))}</td>
        <td>${num(l.weightKg)}</td>
        <td>${num(l.waistCm)}</td>
        <td>${num(l.hipCm)}</td>
        <td>${num(l.armCm)}</td>
        <td>${num(l.legCm)}</td>
      </tr>`,
    )
    .join('');

  const measTable = logs.length
    ? `<h2>Histórico de medidas</h2>
       <table>
         <thead><tr><th>Data</th><th>Peso (kg)</th><th>Cintura</th><th>Quadril</th><th>Braço</th><th>Perna</th></tr></thead>
         <tbody>${measRows}</tbody>
       </table>`
    : '';

  const planBlock = plan
    ? `<h2>Plano atual</h2>
       <p><strong>${esc(plan.name || 'Plano de treino')}</strong>${
         plan.periodization
           ? ` — Semana ${esc(plan.periodization.currentWeek)}/${esc(
               plan.periodization.cycleWeeks,
             )} · ${esc(plan.periodization.phase)}`
           : ''
       }</p>
       <ul>${(plan.sessions || [])
         .map(
           (s: any) =>
             `<li><strong>${esc(s.name)}</strong> — ${esc(
               (s.muscleGroups || []).join(', '),
             )} · ${esc(s.exercises?.length ?? 0)} exercícios</li>`,
         )
         .join('')}</ul>`
    : '';

  const woRows = recentWorkouts
    .slice(0, 15)
    .map(
      (w: any) => `<tr>
        <td>${esc(fmtDate(w.completedAt))}</td>
        <td>${esc(w.workoutSession?.name || w.sessionName || '—')}</td>
        <td>${num(w.durationMinutes, ' min')}</td>
        <td>${w.rating ? esc('★'.repeat(w.rating)) : '—'}</td>
      </tr>`,
    )
    .join('');

  const woTable = recentWorkouts.length
    ? `<h2>Treinos recentes</h2>
       <table>
         <thead><tr><th>Data</th><th>Treino</th><th>Duração</th><th>Avaliação</th></tr></thead>
         <tbody>${woRows}</tbody>
       </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatório de Progresso${userName ? ' — ' + esc(userName) : ''}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #1f2937; margin: 0; padding: 32px; }
  .header { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 3px solid #16a34a; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { font-size: 22px; font-weight: 800; color: #16a34a; }
  .brand span { color: #1f2937; }
  .meta { font-size: 12px; color: #6b7280; text-align: right; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; color: #111827; border-left: 4px solid #16a34a; padding-left: 8px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 8px; }
  .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
  .card-label { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af; }
  .card-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
  th { background: #f9fafb; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: #6b7280; }
  ul { margin: 6px 0; padding-left: 18px; font-size: 12px; }
  li { margin: 2px 0; }
  .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
  @page { margin: 16mm; }
  @media print { body { padding: 0; } h2 { page-break-after: avoid; } table, ul { page-break-inside: auto; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">FIT<span>Muscle</span></div>
    <div class="meta">Relatório gerado em ${esc(generatedAt)}</div>
  </div>
  <h1>Relatório de Progresso${userName ? ' — ' + esc(userName) : ''}</h1>
  <div class="cards">${sumCards}</div>
  ${planBlock}
  ${measTable}
  ${woTable}
  <div class="footer">Gerado automaticamente pelo FIT Muscle · Documento para acompanhamento pessoal</div>
</body>
</html>`;
}

export function printProgressReport(data: ReportData): void {
  const html = buildReportHtml(data);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  });
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    return;
  }

  const cleanup = () => {
    // Give the print dialog time to grab the document before removing.
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };
  win.onafterprint = cleanup;

  doc.open();
  doc.write(html);
  doc.close();

  // Let layout settle before invoking the print dialog.
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  }, 350);
}
