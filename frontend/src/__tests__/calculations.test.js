import { describe, it, expect } from 'vitest';
import { calcProj, calcProjMonthly, spForM, ph3Boundary, phaseAnnotations, moOffset, targetDateToMonths } from '../calculations.js';

const basePhases = [
  { phase_index: 0, name: 'Phase 0', duration_months: 6,    monthly_savings: 1200 },
  { phase_index: 1, name: 'Phase 1', duration_months: 18,   monthly_savings: 1450 },
  { phase_index: 2, name: 'Phase 2', duration_months: 29,   monthly_savings: 2400 },
  { phase_index: 3, name: 'Phase 3', duration_months: null,  monthly_savings: 0    },
];

const baseSettings = {
  goal: 280000,
  target_date: '2031-09',
  ref_month: '2026-01',
  totalMo: 65,
  rate: 6.5,
  rate_ph3: 2.5,
  phases: basePhases,
};

describe('ph3Boundary', () => {
  it('returns sum of non-last phase durations', () => {
    expect(ph3Boundary(basePhases)).toBe(6 + 18 + 29);
  });
  it('returns 0 for single last-phase', () => {
    expect(ph3Boundary([{ phase_index: 0, duration_months: null, monthly_savings: 500 }])).toBe(0);
  });
  it('returns Infinity for empty', () => {
    expect(ph3Boundary([])).toBe(Infinity);
  });
});

describe('spForM', () => {
  it('returns savings for phase 0', () => {
    expect(spForM(1, basePhases)).toBe(1200);
    expect(spForM(6, basePhases)).toBe(1200);
  });
  it('returns savings for phase 1', () => {
    expect(spForM(7, basePhases)).toBe(1450);
    expect(spForM(24, basePhases)).toBe(1450);
  });
  it('returns savings for phase 2', () => {
    expect(spForM(25, basePhases)).toBe(2400);
  });
  it('returns savings for last phase (cash phase)', () => {
    expect(spForM(65, basePhases)).toBe(0);
  });
  it('returns 0 for empty phases', () => {
    expect(spForM(1, [])).toBe(0);
  });
});

describe('phaseAnnotations', () => {
  it('returns N-1 annotations for N phases', () => {
    expect(phaseAnnotations(basePhases)).toHaveLength(3);
  });
  it('returns empty for single phase', () => {
    expect(phaseAnnotations([basePhases[0]])).toHaveLength(0);
  });
  it('returns empty for empty', () => {
    expect(phaseAnnotations([])).toHaveLength(0);
  });
  it('annotations have year and label', () => {
    phaseAnnotations(basePhases).forEach(a => {
      expect(a).toHaveProperty('year');
      expect(a).toHaveProperty('label');
    });
  });
  it('annotations are in order', () => {
    const anns = phaseAnnotations(basePhases);
    expect(anns[0].year).toBeLessThan(anns[1].year);
    expect(anns[1].year).toBeLessThan(anns[2].year);
  });
  it('uses phase name as label', () => {
    const anns = phaseAnnotations(basePhases);
    expect(anns[0].label).toBe('Phase 1');
  });
});

describe('calcProj', () => {
  it('returns array starting at year 0', () => {
    const result = calcProj(baseSettings, 10000);
    expect(result[0].year).toBe(0);
    expect(result[0].total).toBe(10000);
  });
  it('grows over time', () => {
    const result = calcProj(baseSettings, 10000);
    expect(result[result.length - 1].total).toBeGreaterThan(10000);
  });
  it('includes yearly data points', () => {
    const result = calcProj(baseSettings, 10000);
    expect(result.length).toBeGreaterThan(1);
    expect(result[1].year).toBe(1);
  });
  it('respects rate override', () => {
    const low  = calcProj(baseSettings, 10000, 2);
    const high = calcProj(baseSettings, 10000, 10);
    expect(high[high.length - 1].total).toBeGreaterThan(low[low.length - 1].total);
  });
});

describe('calcProjMonthly', () => {
  it('first point is mo=0 with total=start and paid=start', () => {
    const result = calcProjMonthly(baseSettings, 10000);
    expect(result[0]).toEqual({ mo: 0, total: 10000, paid: 10000 });
  });

  it('returns monthly resolution', () => {
    const result = calcProjMonthly(baseSettings, 0);
    expect(result[1].mo).toBe(1);
    expect(result[12].mo).toBe(12);
  });

  it('grows over time with positive savings rate', () => {
    const result = calcProjMonthly(baseSettings, 10000);
    expect(result[result.length - 1].total).toBeGreaterThan(10000);
  });

  it('paid increases by savings rate each month', () => {
    const result = calcProjMonthly(baseSettings, 0);
    expect(result[1].paid).toBe(1200);
    expect(result[6].paid).toBe(6 * 1200);
    expect(result[7].paid).toBe(6 * 1200 + 1450);
  });

  it('rate override changes growth', () => {
    const low  = calcProjMonthly(baseSettings, 10000, 1);
    const high = calcProjMonthly(baseSettings, 10000, 12);
    expect(high[high.length - 1].total).toBeGreaterThan(low[low.length - 1].total);
  });

  it('paid is rate-independent', () => {
    const low  = calcProjMonthly(baseSettings, 10000, 1);
    const high = calcProjMonthly(baseSettings, 10000, 12);
    expect(low[12].paid).toBe(high[12].paid);
  });

  it('covers at least totalMo months', () => {
    const result = calcProjMonthly(baseSettings, 0);
    expect(result.length - 1).toBeGreaterThanOrEqual(baseSettings.totalMo);
  });

  it('zero start + zero rate = pure savings accumulation', () => {
    const result = calcProjMonthly({ ...baseSettings, rate: 0 }, 0);
    expect(result[1].total).toBe(1200);
  });

  it('last phase uses rate_ph3 for new contributions', () => {
    const lastPhaseOnly = [{ phase_index: 0, duration_months: null, monthly_savings: 1000 }];
    const s = { ...baseSettings, totalMo: 24, phases: lastPhaseOnly, rate: 0 };
    const highRate = calcProjMonthly({ ...s, rate_ph3: 10 }, 0);
    const lowRate  = calcProjMonthly({ ...s, rate_ph3: 1  }, 0);
    expect(highRate[24].total).toBeGreaterThan(lowRate[24].total);
  });

  it('empty phases produces zero savings', () => {
    const result = calcProjMonthly({ ...baseSettings, phases: [] }, 10000);
    // no savings contributions — only compound growth at rate
    expect(result[1].paid).toBe(10000);
  });
});

describe('moOffset', () => {
  it('computes positive offset', () => {
    expect(moOffset('2026-01', '2026-07')).toBe(6);
    expect(moOffset('2026-01', '2027-01')).toBe(12);
  });
  it('computes negative offset', () => {
    expect(moOffset('2026-07', '2026-01')).toBe(-6);
  });
  it('returns 0 for same month', () => {
    expect(moOffset('2026-05', '2026-05')).toBe(0);
  });
});

describe('targetDateToMonths', () => {
  it('converts date to month count', () => {
    expect(targetDateToMonths('2031-09', '2026-01')).toBe(68);
  });
  it('returns 96 for null input', () => {
    expect(targetDateToMonths(null, '2026-01')).toBe(96);
    expect(targetDateToMonths('2031-09', null)).toBe(96);
  });
  it('returns minimum of 1', () => {
    expect(targetDateToMonths('2025-01', '2026-01')).toBe(1);
  });
});
