export const eur  = v => v == null ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
export const eur2 = v => v == null ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
export const pct  = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)} %`;
export const num  = (v, d = 2) => v == null ? '—' : new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

// Abbreviated currency: 12500 → "13T€", 1200000 → "1,2M€"
export function abbr(v) {
  if (v == null) return '—';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M€`;
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}T€`;
  return `${Math.round(v)}€`;
}

export function fmtMonthYear(ym, lang = 'de') {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  return new Date(y, m - 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function fmtDate(dateStr, lang = 'de') {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

export function fmtDateLong(dateStr, lang = 'de') {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
}

export function fmtMonth(dateStr, lang = 'de') {
  if (!dateStr) return '—';
  const [y, m] = dateStr.split('-').map(Number);
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  return new Date(y, m - 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

// SVG path helpers
export function linearPath(pts) {
  if (!pts.length) return '';
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}

export function smoothPath(pts) {
  if (pts.length < 2) return linearPath(pts);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

export function getGreeting(userName) {
  const hour = new Date().getHours();
  let greeting;
  if (hour < 11) {
    greeting = 'Guten Morgen';
  } else if (hour < 18) {
    greeting = 'Guten Tag';
  } else {
    greeting = 'Guten Abend';
  }
  return `${greeting}, ${userName}`;
}
