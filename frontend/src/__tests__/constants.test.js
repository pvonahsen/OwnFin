import { describe, it, expect } from 'vitest';
import { bucketOf, BUCKETS, ACCENT_OPTIONS, L } from '../constants.js';

describe('bucketOf', () => {
  it('maps fixed costs correctly', () => {
    expect(bucketOf('Wohnen')).toBe('fix');
    expect(bucketOf('Abos')).toBe('fix');
    expect(bucketOf('Mobilität')).toBe('fix');
    expect(bucketOf('Gesundheit')).toBe('fix');
  });
  it('maps investments correctly', () => {
    expect(bucketOf('Sparen')).toBe('invest');
    expect(bucketOf('Investieren')).toBe('invest');
  });
  it('maps goals correctly', () => {
    expect(bucketOf('Lebensmittel')).toBe('goals');
  });
  it('maps guilt-free correctly', () => {
    expect(bucketOf('Restaurants')).toBe('guilt');
    expect(bucketOf('Freizeit')).toBe('guilt');
    expect(bucketOf('Shopping')).toBe('guilt');
  });
  it('defaults unknown categories to guilt', () => {
    expect(bucketOf('Unbekannt')).toBe('guilt');
    expect(bucketOf('')).toBe('guilt');
  });
});

describe('BUCKETS', () => {
  it('has all 4 buckets', () => {
    expect(BUCKETS).toHaveProperty('fix');
    expect(BUCKETS).toHaveProperty('invest');
    expect(BUCKETS).toHaveProperty('goals');
    expect(BUCKETS).toHaveProperty('guilt');
  });
  it('each bucket has required fields', () => {
    Object.values(BUCKETS).forEach(b => {
      expect(b).toHaveProperty('de');
      expect(b).toHaveProperty('en');
      expect(b).toHaveProperty('color');
      expect(b).toHaveProperty('target');
    });
  });
  it('targets sum to 100', () => {
    const total = Object.values(BUCKETS).reduce((s, b) => s + b.target, 0);
    expect(total).toBe(100);
  });
});

describe('ACCENT_OPTIONS', () => {
  it('has at least 4 options', () => {
    expect(ACCENT_OPTIONS.length).toBeGreaterThanOrEqual(4);
  });
  it('each option has accent, soft, ink', () => {
    ACCENT_OPTIONS.forEach(o => {
      expect(o).toHaveProperty('accent');
      expect(o).toHaveProperty('soft');
      expect(o).toHaveProperty('ink');
      expect(o).toHaveProperty('label');
    });
  });
});

describe('L (language strings)', () => {
  it('has de and en', () => {
    expect(L).toHaveProperty('de');
    expect(L).toHaveProperty('en');
  });
  it('both languages have same keys', () => {
    const deKeys = Object.keys(L.de).sort();
    const enKeys = Object.keys(L.en).sort();
    expect(deKeys).toEqual(enKeys);
  });
  it('has required keys', () => {
    ['dashboard', 'portfolio', 'projection', 'invested', 'cash', 'goal'].forEach(key => {
      expect(L.de).toHaveProperty(key);
      expect(L.en).toHaveProperty(key);
    });
  });
});
