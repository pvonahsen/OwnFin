const _PHASE_COLORS = ['#EF9F27', '#378ADD', '#7F77DD', '#E76F51'];

export const ph3Boundary = (phases) => {
  if (!phases || !phases.length) return Infinity;
  const sorted = [...phases].sort((a, b) => a.phase_index - b.phase_index);
  let boundary = 0;
  for (const ph of sorted) {
    if (ph.duration_months == null) return boundary;
    boundary += ph.duration_months;
  }
  return boundary;
};

export const spForM = (m, phases) => {
  if (!phases || !phases.length) return 0;
  const sorted = [...phases].sort((a, b) => a.phase_index - b.phase_index);
  let boundary = 0;
  for (const ph of sorted) {
    if (ph.duration_months == null) return ph.monthly_savings;
    boundary += ph.duration_months;
    if (m <= boundary) return ph.monthly_savings;
  }
  return sorted[sorted.length - 1].monthly_savings;
};

export function calcProjMonthly(s, start, rateOverride = null) {
  const r      = ((rateOverride != null ? rateOverride : s.rate) / 100) / 12;
  const rph3   = ((s.rate_ph3 ?? 2.5) / 100) / 12;
  const phases  = s.phases ?? [];
  const lastStart = ph3Boundary(phases);

  let investedVal = start, safeVal = 0, paid = start;
  const res = [{ mo: 0, total: start, paid }];
  const maxM = Math.max(s.totalMo ?? 60, 156);

  for (let m = 1; m <= maxM; m++) {
    const sp = spForM(m, phases);
    if (m <= lastStart) {
      investedVal = investedVal * (1 + r) + sp;
    } else {
      investedVal = investedVal * (1 + r);
      safeVal = safeVal * (1 + rph3) + sp;
    }
    paid += sp;
    res.push({ mo: m, total: Math.round(investedVal + safeVal), paid: Math.round(paid) });
  }
  return res;
}

export function calcProj(s, start, rateOverride = null) {
  const r      = ((rateOverride != null ? rateOverride : s.rate) / 100) / 12;
  const rph3   = ((s.rate_ph3 ?? 2.5) / 100) / 12;
  const phases  = s.phases ?? [];
  const lastStart = ph3Boundary(phases);

  let investedVal = start, safeVal = 0, paid = start;
  const res = [{ year: 0, total: start, paid }];
  const maxM = Math.max(s.totalMo, 156);

  for (let m = 1; m <= maxM; m++) {
    const sp = spForM(m, phases);
    if (m <= lastStart) {
      investedVal = investedVal * (1 + r) + sp;
    } else {
      investedVal = investedVal * (1 + r);
      safeVal = safeVal * (1 + rph3) + sp;
    }
    paid += sp;
    if (m % 12 === 0) res.push({ year: m / 12, total: Math.round(investedVal + safeVal), paid: Math.round(paid) });
  }
  return res;
}

export const phaseAnnotations = (phases) => {
  if (!phases || phases.length <= 1) return [];
  const sorted = [...phases].sort((a, b) => a.phase_index - b.phase_index);
  const annotations = [];
  let boundary = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const dur = sorted[i].duration_months ?? 0;
    boundary += dur;
    annotations.push({
      year: boundary / 12,
      label: sorted[i + 1].name || `Phase ${i + 2}`,
      color: _PHASE_COLORS[i % _PHASE_COLORS.length],
    });
  }
  return annotations;
};

export function moOffset(refM, targetM) {
  const [ry, rm] = refM.split('-').map(Number);
  const [ty, tm] = targetM.split('-').map(Number);
  return (ty - ry) * 12 + (tm - rm);
}

export function targetDateToMonths(targetDate, refMonth) {
  if (!targetDate || !refMonth) return 96;
  const [ty, tm] = targetDate.split('-').map(Number);
  const [ry, rm] = refMonth.split('-').map(Number);
  return Math.max(1, (ty - ry) * 12 + (tm - rm));
}

export function monthsToTargetDate(months, refMonth) {
  if (!refMonth) return '';
  const [ry, rm] = refMonth.split('-').map(Number);
  const d = new Date(ry, rm - 1 + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentPhaseMo(s) {
  const now = new Date();
  const [ry, rm] = s.ref_month.split('-').map(Number);
  const wholeMonths = (now.getFullYear() - ry) * 12 + (now.getMonth() + 1 - rm);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(0, wholeMonths + (now.getDate() - 1) / daysInMonth);
}

/** Convert a projection year offset (0, 1, 2…) to a calendar year string using ref_month. */
export function projLabel(year, refMonth) {
  if (!refMonth) return `J${year}`;
  const ry = parseInt(refMonth.split('-')[0], 10);
  return String(ry + year);
}

export function baselineValueAtNow(baseline, refMonth) {
  if (!baseline?.projection?.length || !refMonth) return null;
  const now = new Date();
  const [ry, rm] = refMonth.split('-').map(Number);
  const monthsElapsed = (now.getFullYear() - ry) * 12 + (now.getMonth() + 1 - rm);
  const yearElapsed = monthsElapsed / 12;
  const proj = baseline.projection;
  const before = [...proj].reverse().find(p => p.year <= yearElapsed);
  const after  = proj.find(p => p.year > yearElapsed);
  if (!before && !after) return null;
  if (!before) return after.total;
  if (!after)  return before.total;
  const t = (yearElapsed - before.year) / (after.year - before.year);
  return Math.round(before.total + t * (after.total - before.total));
}
