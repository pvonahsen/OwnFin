export const C = {
  jetzt:        '#d4a853',
  einverdiener: '#3d9970',
  dual:         '#c8902a',
  cashPhase:    '#7c72d8',
  rot:          '#e05533',
  baseline:     '#b0a898',
};

// Ramit Sethi 4-bucket system
export const BUCKETS = {
  fix:    { de: 'Fixkosten',   en: 'Fixed costs',   color: '#a23a25', target: 50 },
  invest: { de: 'Investieren', en: 'Investments',   color: '#3a6b4a', target: 20 },
  goals:  { de: 'Sparziele',   en: 'Savings goals', color: '#a06a20', target: 10 },
  guilt:  { de: 'Guilt-free',  en: 'Guilt-free',    color: '#4a6b8a', target: 20 },
};

export function bucketOf(cat) {
  if (['Wohnen', 'Abos', 'Mobilität', 'Gesundheit', 'Miete', 'Versicherung', 'Strom', 'Internet'].includes(cat)) return 'fix';
  if (['Sparen', 'Investieren', 'ETF', 'Aktien'].includes(cat)) return 'invest';
  if (['Lebensmittel', 'Haushalt'].includes(cat)) return 'goals';
  if (['Restaurants', 'Freizeit', 'Shopping', 'Sonstiges', 'Urlaub', 'Unterhaltung'].includes(cat)) return 'guilt';
  return 'guilt';
}

export function bucketOfDynamic(cat, categories = []) {
  const found = categories.find(c => c.name === cat);
  return found?.bucket || bucketOf(cat);
}

export const ACCENT_OPTIONS = [
  { label: 'Forest',    accent: '#2c5d4e', soft: '#dde8df', ink: '#234c40' },
  { label: 'Deep Blue', accent: '#3a4a8a', soft: '#dee2f0', ink: '#2e3c70' },
  { label: 'Plum',      accent: '#7a4a5c', soft: '#efdde3', ink: '#5e3845' },
  { label: 'Mustard',   accent: '#8a6420', soft: '#efe5cf', ink: '#6e4f1a' },
];

// Language strings
export const L = {
  de: {
    dashboard: 'Übersicht',
    portfolio: 'Portfolio',
    projection: 'Projektion',
    invested: 'Investiert',
    cash: 'Cash',
    goal: 'Ziel',
    gap: 'Lücke',
    return_simple: 'Rendite',
    return_irr: 'IRR p.a.',
    monthly_rate: 'Sparrate',
    phase_plan: 'Phasenplan',
    phase_now: 'Jetzt',
    phase_start: 'Start Phase',
    phase_single: 'Einverdienerphase',
    phase_dual: 'Dual Income',
    phase_cash: 'Cash Phase',
  },
  en: {
    dashboard: 'Overview',
    portfolio: 'Portfolio',
    projection: 'Projection',
    invested: 'Invested',
    cash: 'Cash',
    goal: 'Goal',
    gap: 'Gap',
    return_simple: 'Return',
    return_irr: 'IRR p.a.',
    monthly_rate: 'Savings',
    phase_plan: 'Phase plan',
    phase_now: 'Now',
    phase_start: 'Start Phase',
    phase_single: 'Einverdienerphase',
    phase_dual: 'Dual Income',
    phase_cash: 'Cash Phase',
  },
};
