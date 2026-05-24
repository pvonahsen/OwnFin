import { ph2Mo, currentPhaseMo } from '../calculations.js';
import { eur } from '../utils.js';
import { C } from '../constants.js';

export default function PhaseBar({ s }) {
  if (!s) return null;
  const p2 = ph2Mo(s);
  const phases = [
    { label: 'Jetzt',        months: s.ph0, color: C.jetzt,       rate: s.sp0 },
    { label: 'Einverdiener', months: s.ph1, color: C.einverdiener, rate: s.sp1 },
    { label: 'Dual Income',  months: p2,    color: C.dual,         rate: s.sp2 },
    { label: 'Cash-Phase',   months: s.ph3, color: C.cashPhase,    rate: s.sp3 },
  ];
  const totalMo = phases.reduce((a, p) => a + p.months, 0);
  const currentMo = s.ref_month ? currentPhaseMo(s) : 0;
  const todayPct = Math.min(100, (currentMo / totalMo) * 100);

  let acc = 0;
  const phaseStarts = phases.map(p => { const v = acc; acc += p.months; return v; });
  const phaseIdx = phaseStarts.findLastIndex((start, i) => currentMo >= start);

  return (
    <div className="phase-journey">
      <div className="phase-track">
        <div className="phase-line" />

        {/* Today marker */}
        <div className="phase-today" style={{ left: `${todayPct}%` }}>
          <div className="phase-today-dot" />
          <div className="phase-today-label">Heute</div>
        </div>

        {/* House at end */}
        <div className="phase-house">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>
          </svg>
        </div>

        {/* Phase segments */}
        {phases.map((p, i) => {
          const start = (phaseStarts[i] / totalMo) * 100;
          const width = (p.months / totalMo) * 100;
          const isPast = i < phaseIdx;
          const isCurrent = i === phaseIdx;
          const showInfo = width >= 10; // hide label if segment < 10% of total width
          return (
            <div key={p.label}
              className={`phase-seg${isPast ? ' past' : ''}${isCurrent ? ' current' : ''}`}
              style={{ left: `${start}%`, width: `${width}%` }}>
              <div className="phase-seg-fill" style={{ background: p.color }} />
              {showInfo && (
                <div className="phase-seg-info">
                  <div className="phase-seg-label">
                    <span className="phase-seg-name">{p.label}</span>
                  </div>
                  <div className="phase-seg-rate">{eur(p.rate)}<span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>/Mo</span></div>
                  <div className="phase-seg-dur">{p.months} Mo</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
