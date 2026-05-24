import { describe, it, expect } from 'vitest';
import { eur, eur2, pct, num, abbr, fmtDate, fmtDateLong, fmtMonth, fmtMonthYear, linearPath, smoothPath } from '../utils.js';

describe('eur', () => {
  it('formats integer amounts', () => {
    expect(eur(1000)).toMatch(/1[\s.]000\s*€/);
    expect(eur(0)).toMatch(/0\s*€/);
  });
  it('returns em dash for null', () => {
    expect(eur(null)).toBe('—');
    expect(eur(undefined)).toBe('—');
  });
  it('handles negative values', () => {
    expect(eur(-500)).toMatch(/-500\s*€/);
  });
  it('includes the euro sign', () => {
    expect(eur(1234)).toContain('€');
    expect(eur(1234)).toContain('1');
  });
});

describe('eur2', () => {
  it('formats with 2 decimal places', () => {
    expect(eur2(89.18)).toMatch(/89[,.]18\s*€/);
    expect(eur2(1.5)).toMatch(/1[,.]50\s*€/);
  });
  it('returns em dash for null', () => {
    expect(eur2(null)).toBe('—');
  });
});

describe('pct', () => {
  it('adds + for positive values', () => {
    expect(pct(5.123)).toBe('+5.12 %');
  });
  it('no + for negative values', () => {
    expect(pct(-2.5)).toBe('-2.50 %');
  });
  it('returns em dash for null', () => {
    expect(pct(null)).toBe('—');
  });
});

describe('num', () => {
  it('formats with default 2 decimal places', () => {
    expect(num(1.5)).toBe('1,50');
  });
  it('formats with custom decimal places', () => {
    expect(num(142.553, 4)).toBe('142,5530');
  });
  it('returns em dash for null', () => {
    expect(num(null)).toBe('—');
  });
});

describe('abbr', () => {
  it('formats thousands', () => {
    expect(abbr(12500)).toBe('13T€');
    expect(abbr(1000)).toBe('1T€');
  });
  it('formats millions', () => {
    expect(abbr(1200000)).toBe('1,2M€');
  });
  it('formats small amounts', () => {
    expect(abbr(500)).toBe('500€');
  });
  it('returns em dash for null', () => {
    expect(abbr(null)).toBe('—');
  });
});

describe('fmtMonthYear', () => {
  it('formats a year-month string', () => {
    const result = fmtMonthYear('2031-09', 'de');
    expect(result).toContain('2031');
    expect(result).toContain('September');
  });
  it('returns em dash for empty input', () => {
    expect(fmtMonthYear('')).toBe('—');
    expect(fmtMonthYear(null)).toBe('—');
  });
});

describe('fmtDate', () => {
  it('formats a date string in de locale', () => {
    const result = fmtDate('2026-05-10', 'de');
    expect(result).toContain('10');
    expect(result).toContain('05');
  });
  it('returns em dash for empty input', () => {
    expect(fmtDate('')).toBe('—');
    expect(fmtDate(null)).toBe('—');
  });
});

describe('fmtDateLong', () => {
  it('formats a date with month name', () => {
    const result = fmtDateLong('2026-05-10', 'de');
    expect(result).toContain('10');
    expect(result).toContain('Mai');
  });
});

describe('fmtMonth', () => {
  it('formats year-month as full month name', () => {
    const result = fmtMonth('2026-05', 'de');
    expect(result).toContain('Mai');
    expect(result).toContain('2026');
  });
});

describe('linearPath', () => {
  it('returns empty string for empty array', () => {
    expect(linearPath([])).toBe('');
  });
  it('creates a proper SVG path', () => {
    const path = linearPath([[0, 10], [10, 20], [20, 5]]);
    expect(path).toContain('M');
    expect(path).toContain('L');
  });
  it('starts with M for first point', () => {
    const path = linearPath([[5, 15]]);
    expect(path).toMatch(/^M/);
  });
});

describe('smoothPath', () => {
  it('returns empty for single point', () => {
    const path = smoothPath([[0, 10]]);
    expect(path).toContain('M');
  });
  it('creates bezier curve commands', () => {
    const path = smoothPath([[0, 10], [10, 20], [20, 5]]);
    expect(path).toContain('C');
  });
});
