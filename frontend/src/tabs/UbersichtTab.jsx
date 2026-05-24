import { useMemo, useState, useEffect } from 'react';
import Spinner from '../components/Spinner.jsx';
import SvgLineChart from '../components/charts/SvgLineChart.jsx';
import { eur, pct, fmtMonthYear, fmtDate } from '../utils.js';
import { currentPhaseMo } from '../calculations.js';
import { L, BUCKETS } from '../constants.js';
import { api } from '../api.js';

// ── Ring gauge ───────────────────────────────────────────────────────────────
function RingGauge({ pct: pctVal, size = 92, stroke = 8, color = 'var(--forest)' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(100, pctVal)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off}
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────
function Hero({ summary, settings, lang, t }) {
  const total = summary.total;
  const pctDone = Math.min(100, Math.round((summary.invest / settings.goal) * 100));
  const onTrack = summary.countdown?.on_track;
  const monthsDiff = summary.countdown?.months_ahead_or_behind ?? 0;
  return (
    <section className="hero rise">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hero-label">{lang === 'de' ? 'Gesamtvermögen' : 'Net worth'}</div>
          <div className="hero-value pv" style={{
            fontSize: 52, fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em', lineHeight: 1, marginTop: 8,
            background: 'linear-gradient(135deg, var(--forest) 0%, var(--accent) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            {eur(total)}
          </div>
          <div className="hero-meta" style={{ marginTop: 14 }}>
            <span className={`pill ${onTrack ? 'pill-pos' : 'pill-warn'}`}>
              {onTrack
                ? `▲ ${monthsDiff} ${lang === 'de' ? 'Mo voraus' : 'mo ahead'}`
                : `▼ ${Math.abs(monthsDiff)} ${lang === 'de' ? 'Mo hinter Plan' : 'mo behind'}`}
            </span>
          </div>
        </div>
        {/* Ring gauge — goal progress */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <RingGauge pct={pctDone} size={92} stroke={8} color="var(--accent)" />
          <div style={{
            position: 'absolute', textAlign: 'center', lineHeight: 1,
          }}>
            <div style={{
              fontFamily: 'var(--font-serif)', fontSize: 22, fontStyle: 'italic',
              color: 'var(--accent)', letterSpacing: '-0.02em',
            }}>{pctDone}<span style={{ fontSize: 13, fontStyle: 'normal' }}>%</span></div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 4,
            }}>{lang === 'de' ? 'des Ziels' : 'of goal'}</div>
          </div>
        </div>
      </div>

      {/* Three-column split: Depot | Cash | Ziel */}
      <div className="hero-split" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 22 }}>
        <div>
          <div className="hero-split-label">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
            {t.invested}
          </div>
          <div className="hero-split-val"><span className="pv">{eur(summary.invest)}</span></div>
        </div>
        <div>
          <div className="hero-split-label">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ocean)', display: 'inline-block' }} />
            {t.cash}
          </div>
          <div className="hero-split-val"><span className="pv">{eur(summary.cash)}</span></div>
        </div>
        <div>
          <div className="hero-split-label">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-faint)', display: 'inline-block' }} />
            {t.goal}
          </div>
          <div className="hero-split-val" style={{ color: 'var(--ink-muted)' }}><span className="pv">{eur(settings.goal)}</span></div>
        </div>
      </div>
    </section>
  );
}

// ── Goal tile ────────────────────────────────────────────────────────────────
function GoalTile({ summary, settings, lang, t }) {
  const goal = settings.goal;
  const pctDone = Math.min(100, Math.round((summary.invest / goal) * 100));
  const monthsLeft = summary.countdown?.months_remaining ?? 0;
  const yLeft = Math.floor(monthsLeft / 12);
  const mLeft = monthsLeft % 12;
  return (
    <section className="tile rise" style={{ animationDelay: '60ms' }}>
      <div className="goal-head">
        <div>
          <div className="mono faint" style={{ fontSize: 11 }}>
            {lang === 'de' ? 'Finanzziel' : 'Financial goal'}
          </div>
          <div className="goal-title">{fmtMonthYear(settings.target_date, lang)}</div>
        </div>
        <div className="serif" style={{ fontSize: 22, color: 'var(--accent)' }}>{pctDone}%</div>
      </div>
      <div className="goal-bar" style={{ height: 8 }}><i style={{ width: `${pctDone}%` }} /></div>
      <div className="goal-stats">
        <div>
          <div className="goal-stat-label">{t.goal.toUpperCase()}</div>
          <div className="goal-stat-val"><span className="pv">{eur(goal)}</span></div>
        </div>
        <div>
          <div className="goal-stat-label">{t.gap.toUpperCase()}</div>
          <div className="goal-stat-val"><span className="pv">{eur(summary.countdown?.gap ?? 0)}</span></div>
        </div>
        <div>
          <div className="goal-stat-label">{lang === 'de' ? 'VERBLEIBEND' : 'REMAINING'}</div>
          <div className="goal-stat-val">{yLeft}J · {mLeft}M</div>
        </div>
      </div>
    </section>
  );
}

// ── Check-in banner ──────────────────────────────────────────────────────────
function CheckinBanner({ checkins, lang, onCheckin }) {
  const lastDate = checkins?.[checkins.length - 1]?.date;
  const days = lastDate
    ? Math.floor((Date.now() - new Date(lastDate)) / 86400000)
    : null;
  // Only show if no check-in ever, or last check-in was 7+ days ago
  if (days != null && days < 7) return null;
  return (
    <section className="checkin-banner rise" style={{ animationDelay: '120ms' }}>
      <span style={{ fontSize: 18 }}>📍</span>
      <span className="label">
        <b>{lang === 'de' ? 'Letzter Check-in' : 'Last check-in'}</b>
        {days != null ? ` · ${days} ${lang === 'de' ? 'Tagen her' : 'days ago'}` : ` · ${lang === 'de' ? 'Noch keiner' : 'None yet'}`}
      </span>
      <button onClick={onCheckin}>{lang === 'de' ? 'Jetzt' : 'Now'}</button>
    </section>
  );
}

// ── KPI row ──────────────────────────────────────────────────────────────────
function KPIRow({ summary, settings, lang, t }) {
  const kpis = [
    {
      code: 'R',
      label: t.return_simple,
      val: pct(summary.return_pct),
      sub: lang === 'de' ? 'einfache Rendite' : 'simple return',
      color: 'var(--forest)',
      valColor: (summary.return_pct ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)',
    },
    {
      code: 'IRR',
      label: t.return_irr,
      val: pct(summary.irr_pct),
      sub: `${lang === 'de' ? 'Plan' : 'plan'} ${settings.rate}%`,
      color: 'var(--amber)',
      valColor: summary.irr_pct != null && summary.irr_pct >= (settings.rate || 6) ? 'var(--pos)' : 'var(--warn)',
    },
    {
      code: 'Σ/MO',
      label: t.monthly_rate,
      val: `${summary.monthly_savings}€`,
      sub: lang === 'de' ? 'aktive Sparpläne' : 'active plans',
      color: 'var(--ocean)',
      valColor: 'var(--ink)',
    },
    {
      code: 'MSCI',
      label: 'MSCI World',
      val: pct(summary.benchmark_cagr_pct),
      sub: `CAGR ${lang === 'de' ? 'seit Start' : 'since start'}`,
      color: 'var(--plum)',
      valColor: summary.benchmark_cagr_pct != null && summary.irr_pct != null
        ? (summary.irr_pct >= summary.benchmark_cagr_pct ? 'var(--pos)' : 'var(--warn)')
        : 'var(--ink)',
    },
  ];
  return (
    <div className="kpi-row rise" style={{ animationDelay: '180ms' }}>
      {kpis.map((k, i) => (
        <div key={i} className="kpi">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
              textTransform: 'uppercase', fontWeight: 500,
              padding: '3px 8px', borderRadius: 4,
              color: k.color,
              background: `color-mix(in oklab, ${k.color} 12%, transparent)`,
            }}>{k.code}</span>
            <span style={{
              fontFamily: 'var(--font-serif)', fontSize: 12, fontStyle: 'italic',
              color: 'var(--ink-muted)', textAlign: 'right',
            }}>{k.label}</span>
          </div>
          <div className="val" style={{ color: k.valColor }}><span className="pv">{k.val}</span></div>
          <div className="sub">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Rebalancing alert ────────────────────────────────────────────────────────
function RebalancingAlert({ positions, lang }) {
  const total = positions.reduce((s, p) => s + (p.current_value || 0), 0);
  const alerts = positions
    .map(p => ({ name: p.name, diff: ((p.current_value / total) * 100) - (p.target_weight || 0) }))
    .filter(a => Math.abs(a.diff) > 5)
    .slice(0, 2);
  if (!alerts.length) return null;
  return (
    <section className="tile rise rebal-alert" style={{ animationDelay: '200ms' }}>
      <div className="row gap-2" style={{ alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16 }}>⚠</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>
            {lang === 'de' ? 'Rebalancing empfohlen' : 'Rebalancing suggested'}
          </div>
          {alerts.map(a => (
            <div key={a.name} className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              {a.name}: {a.diff > 0 ? '+' : ''}{a.diff.toFixed(1)}%
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Performance chart ─────────────────────────────────────────────────────────
function PerformanceTile({ history, lang, chartStyle }) {
  const slice = history.slice(-180);
  const labels = slice.map(h => fmtDate(h.date, lang));
  const data = slice.map(h => h.total);
  return (
    <section className="tile rise wide" style={{ animationDelay: '240ms' }}>
      <div className="section-label" style={{ margin: '0 0 6px' }}>
        <span>{lang === 'de' ? 'PORTFOLIO · 6 MONATE' : 'PORTFOLIO · 6 MONTHS'}</span>
      </div>
      <SvgLineChart
        labels={labels}
        series={[
          { label: lang === 'de' ? 'Depotwert' : 'Portfolio', data, color: 'var(--accent)', area: true, thick: true },
        ]}
        height={170}
        style={chartStyle}
      />
    </section>
  );
}

// ── Phase timeline ────────────────────────────────────────────────────────────
function PhaseTimeline({ settings, lang, t }) {
  const rawPhases = settings.phases ?? [];
  const phaseColors = ['var(--sage)', 'var(--amber)', 'var(--forest)', 'var(--ocean)'];
  const cur = currentPhaseMo(settings);
  let acc = 0;
  const enriched = rawPhases.map((ph, i) => {
    const start = acc;
    acc += ph.duration_months || 0;
    return {
      key: i,
      name: ph.name || `Phase ${i + 1}`,
      months: ph.duration_months,
      sp: ph.monthly_savings,
      start,
      end: ph.duration_months != null ? acc : Infinity,
    };
  });
  const currentIdx = enriched.findIndex((p, i) =>
    cur >= p.start && (i === enriched.length - 1 || cur <= p.end)
  );
  return (
    <section className="tile rise" style={{ animationDelay: '300ms' }}>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        <span>{t.phase_plan.toUpperCase()}</span>
        <span className="faint">{settings.totalMo} {lang === 'de' ? 'Mo' : 'mo'}</span>
      </div>
      <div>
        {enriched.map((p, i) => {
          const status = i < currentIdx ? 'past' : i === currentIdx ? 'current' : '';
          const phaseColor = phaseColors[p.key] || 'var(--ink-faint)';
          return (
            <div key={p.key} className={`phase-step ${status}`} style={{ display: 'grid', gridTemplateColumns: '4px 30px 1fr auto', alignItems: 'center', gap: '14px', padding: '13px 0', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
              {/* Colored stripe */}
              <div style={{
                alignSelf: 'stretch', width: 4, minHeight: 26, borderRadius: 2,
                background: status === 'past' ? 'var(--ink-faint)'
                           : status === 'current' ? phaseColor
                           : `color-mix(in oklab, ${phaseColor} 28%, transparent)`,
              }} />
              {/* Phase number */}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em',
                color: status === 'current' ? phaseColor : 'var(--ink-faint)',
                fontWeight: status === 'current' ? 600 : 400,
              }}>P{p.key}</span>
              {/* Phase name + meta */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-serif)', fontSize: 15,
                    letterSpacing: '-0.005em', color: 'var(--ink)',
                  }}>{p.name}</span>
                  {status === 'current' && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 600,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      padding: '2px 7px', borderRadius: 3,
                      color: phaseColor,
                      background: `color-mix(in oklab, ${phaseColor} 14%, transparent)`,
                    }}>{t.phase_now}</span>
                  )}
                </div>
                <div style={{
                  marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 9.5,
                  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)',
                }}>
                  {p.months != null
                    ? `${p.months} ${lang === 'de' ? 'Monate' : 'months'}`
                    : (lang === 'de' ? 'bis Ziel' : 'to goal')}
                </div>
              </div>
              {/* Savings rate */}
              <span style={{
                fontFamily: 'var(--font-serif)', fontSize: 15,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.005em',
                color: p.sp ? 'var(--ink)' : 'var(--ink-faint)',
              }}>
                <span className="pv">{p.sp ? `${p.sp.toLocaleString('de-DE')} €` : '—'}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Monthly review ────────────────────────────────────────────────────────────
function MonthlyReview({ lang, currentUser, users, settings }) {
  const de = lang === 'de';
  const today = new Date();
  const initMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(initMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const owner = users?.find(u => u.id === currentUser)?.member_ids?.[0] ?? currentUser;
    api.get(`/api/portfolio/monthly-review?month=${month}&owner=${owner}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [month, currentUser]);

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    if (month >= initMonth) return;
    const d = new Date(y, m);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const changeColor = data?.value_change != null
    ? data.value_change >= 0 ? 'var(--pos)' : 'var(--neg)' : 'var(--ink-muted)';
  const retColor = data?.return_pct != null
    ? data.return_pct >= 0 ? 'var(--pos)' : 'var(--neg)' : 'var(--ink-muted)';

  return (
    <section className="tile rise" style={{ animationDelay: '360ms' }}>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        <span>{de ? 'MONATSRÜCKBLICK' : 'MONTHLY REVIEW'}</span>
        <div className="row gap-1">
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 16, padding: '0 4px', font: 'inherit' }}>‹</button>
          <span className="faint" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', minWidth: 56, textAlign: 'center' }}>{fmtMonthYear(month, lang)}</span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: month >= initMonth ? 'var(--ink-faint)' : 'var(--ink-muted)', fontSize: 16, padding: '0 4px', font: 'inherit' }}>›</button>
        </div>
      </div>

      {loading && <div style={{ padding: '12px 0', color: 'var(--ink-faint)', fontSize: 13 }}>…</div>}
      {!loading && data && (
        <>
          {/* Portfolio change */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ background: 'var(--bg-sunken)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{de ? 'WERTÄND.' : 'CHANGE'}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: changeColor, fontVariantNumeric: 'tabular-nums' }}>
                <span className="pv">{data.value_change != null ? `${data.value_change >= 0 ? '+' : ''}${eur(data.value_change)}` : '—'}</span>
              </div>
            </div>
            <div style={{ background: 'var(--bg-sunken)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{de ? 'EINZAHL.' : 'CONTRIB.'}</div>
              <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}><span className="pv">{eur(data.contributions || 0)}</span></div>
            </div>
            <div style={{ background: 'var(--bg-sunken)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{de ? 'RENDITE' : 'RETURN'}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: retColor, fontVariantNumeric: 'tabular-nums' }}>
                <span className="pv">{data.return_pct != null ? pct(data.return_pct) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Giro summary + check-ins */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ background: 'var(--bg-sunken)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{de ? 'EINNAHMEN' : 'INCOME'}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--pos)', fontVariantNumeric: 'tabular-nums' }}><span className="pv">{eur(data.giro_income || 0)}</span></div>
            </div>
            <div style={{ background: 'var(--bg-sunken)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{de ? 'AUSGABEN' : 'EXPENSES'}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}><span className="pv">{eur(data.giro_expenses || 0)}</span></div>
            </div>
            <div style={{ background: 'var(--bg-sunken)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{de ? 'SPARQUOTE' : 'SAVINGS'}</div>
              <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                <span className="pv">{data.savings_rate != null ? pct(data.savings_rate) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Big 4 bucket breakdown */}
          {data.giro_big4 && data.giro_big4.total_spend > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
              {['fix', 'invest', 'goals', 'guilt'].map(k => {
                const b = data.giro_big4[k];
                if (!b) return null;
                const bc = settings?.bucket_colors || {};
                const dot = bc[k] || BUCKETS[k]?.color || 'var(--ink-faint)';
                const p = { dot, bg: `color-mix(in oklab, ${dot} 15%, transparent)` };
                return (
                  <div key={k} style={{ background: p.bg, borderRadius: 8, padding: '6px 8px' }}>
                    <div style={{ width: 6, height: 6, borderRadius: 2, background: p.dot, marginBottom: 3 }} />
                    <div style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{b.pct}%</div>
                    <div style={{ fontSize: 10, color: p.dot, fontFamily: 'var(--font-mono)', marginTop: 1 }}>{de ? {fix:'Fix',invest:'Invest',goals:'Spar',guilt:'Frei'}[k] : {fix:'Fix',invest:'Invest',goals:'Goals',guilt:'Free'}[k]}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Best/worst + check-in count */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.best_position && (
              <div className="row gap-2" style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--pos)' }}>↑</span>
                <span className="faint">{de ? 'Beste' : 'Best'}:</span>
                <span style={{ fontWeight: 500 }}>{data.best_position.name}</span>
                <span style={{ color: 'var(--pos)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}><span className="pv">+{data.best_position.change_pct}%</span></span>
              </div>
            )}
            {data.worst_position && data.worst_position.name !== data.best_position?.name && (
              <div className="row gap-2" style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--neg)' }}>↓</span>
                <span className="faint">{de ? 'Schlechteste' : 'Worst'}:</span>
                <span style={{ fontWeight: 500 }}>{data.worst_position.name}</span>
                <span style={{ color: 'var(--neg)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}><span className="pv">{data.worst_position.change_pct}%</span></span>
              </div>
            )}
            <div className="row gap-2" style={{ fontSize: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span className="faint">{de ? 'Check-ins' : 'Check-ins'}:</span>
              <span style={{ fontWeight: 500 }}>{data.checkin_count}</span>
            </div>
          </div>
        </>
      )}
      {!loading && !data && (
        <div style={{ color: 'var(--ink-faint)', fontSize: 13, padding: '8px 0' }}>
          {de ? 'Keine Daten für diesen Monat' : 'No data for this month'}
        </div>
      )}
    </section>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────
export default function UbersichtTab({
  settings, positions, portfolioSummary, history, checkins,
  performance, benchmark,
  lang, chartStyle, onCheckin, currentUser, users,
}) {
  const t = L[lang];

  const summary = useMemo(() => {
    if (!portfolioSummary) return null;
    const { total_value, cash_value, total_return_pct, monthly_savings, countdown } = portfolioSummary;
    const cashVal = cash_value ?? settings?.cash ?? 0;
    const total = (total_value || 0) + cashVal;
    return {
      total,
      invest: total_value || 0,
      cash: cashVal,
      return_pct: total_return_pct,
      irr_pct: performance?.irr_pct ?? null,
      benchmark_cagr_pct: benchmark?.benchmark_cagr_pct ?? benchmark?.benchmark_irr_pct ?? null,
      monthly_savings: monthly_savings || 0,
      countdown: {
        on_track: countdown?.on_track ?? countdown?.months_ahead > 0 ?? false,
        months_ahead_or_behind: countdown?.months_ahead ?? countdown?.months_ahead_or_behind ?? 0,
        months_remaining: countdown?.months_remaining ?? 0,
        gap: countdown?.gap ?? Math.max(0, (settings?.goal ?? 0) - (total_value || 0)),
      },
    };
  }, [portfolioSummary, performance, benchmark, settings]);

  if (!settings || !portfolioSummary) return <Spinner />;
  if (!summary) return <Spinner />;

  return (
    <>
      <Hero summary={summary} settings={settings} lang={lang} t={t} />
      <GoalTile summary={summary} settings={settings} lang={lang} t={t} />
      <CheckinBanner checkins={checkins} lang={lang} onCheckin={onCheckin} />
      <KPIRow summary={summary} settings={settings} lang={lang} t={t} />
      {history?.length > 0 && <PerformanceTile history={history} lang={lang} chartStyle={chartStyle} />}
      {settings.phases?.length > 0 && <PhaseTimeline settings={settings} lang={lang} t={t} />}
      <MonthlyReview lang={lang} currentUser={currentUser} users={users} settings={settings} />
    </>
  );
}
