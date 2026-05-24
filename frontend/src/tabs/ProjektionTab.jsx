import { useState, useEffect } from 'react';
import Spinner from '../components/Spinner.jsx';
import SvgLineChart from '../components/charts/SvgLineChart.jsx';
import { eur, fmtDate } from '../utils.js';
import { calcProjMonthly, moOffset, ph3Boundary, phaseAnnotations } from '../calculations.js';
import { api, ownerUrl } from '../api.js';

// ── Scenario compare + editable variables ─────────────────────────────────────
const RANGES_CFG = [
  { id: 'house', de: 'Finanzziel', en: 'Financial goal' },
  { id: '1y',   de: '1J',       en: '1Y' },
  { id: '2y',   de: '2J',       en: '2Y' },
  { id: '5y',   de: '5J',       en: '5Y' },
  { id: '10y',  de: '10J',      en: '10Y' },
  { id: 'max',  de: 'Max',      en: 'Max' },
];
const MO_ABBR_DE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const MO_ABBR_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function moToYM(refMonth, mo) {
  if (!refMonth) return '';
  const [ry, rm] = refMonth.split('-').map(Number);
  const d = new Date(ry, rm - 1 + mo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shortLabel(ym, lang) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  const n = lang === 'de' ? MO_ABBR_DE : MO_ABBR_EN;
  return `${n[m - 1]} '${String(y).slice(-2)}`;
}

function endMoFor(range, settings) {
  const max = Math.max(settings.totalMo ?? 60, 156);
  switch (range) {
    case '1y':  return Math.min(12, max);
    case '2y':  return Math.min(24, max);
    case '5y':  return Math.min(60, max);
    case '10y': return Math.min(120, max);
    case 'max': return max;
    default:    return settings.totalMo ?? max;
  }
}

function ScenarioCompare({ settings, lang, chartStyle, baseline, portfolioSummary, currentUser, users, onRefresh, checkins, history }) {
  const [active, setActive] = useState(1);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixMsg, setFixMsg] = useState(null);
  const [range, setRange] = useState('house');
  const [showIstDepot, setShowIstDepot] = useState(true);
  const [showIstGesamt, setShowIstGesamt] = useState(false);

  const phases = settings?.phases ?? [];
  const ph0sp = phases[0]?.monthly_savings ?? 0;
  const ph1sp = phases[1]?.monthly_savings ?? ph0sp;

  const [localSc, setLocalSc] = useState(null);
  useEffect(() => {
    if (!settings) return;
    setLocalSc([
      { r: settings.sc_r0 ?? 4,                    sp1: settings.sc_s0 ?? ph0sp, sp2: settings.sc_d0 ?? ph1sp },
      { r: settings.sc_r1 ?? settings.rate ?? 6.5, sp1: settings.sc_s1 ?? ph0sp, sp2: settings.sc_d1 ?? ph1sp },
      { r: settings.sc_r2 ?? 9,                    sp1: settings.sc_s2 ?? ph0sp, sp2: settings.sc_d2 ?? ph1sp },
    ]);
  }, [settings?.sc_r0, settings?.sc_r1, settings?.sc_r2, settings?.rate, settings?.phases]);

  const de = lang === 'de';
  const sc = [
    { id: 0, name: de ? 'Pessimistisch' : 'Pessimistic', color: 'var(--c-3)' },
    { id: 1, name: de ? 'Realistisch'   : 'Realistic',   color: 'var(--accent)' },
    { id: 2, name: de ? 'Optimistisch'  : 'Optimistic',  color: 'var(--c-6)' },
  ];

  const start = currentUser === 'Gemeinsam'
    ? (portfolioSummary?.total_value ?? baseline?.start_value ?? 0)
    : (baseline?.start_value ?? 0);
  const endMo = endMoFor(range, settings);

  const projOf = (p) => {
    const scenarioPhases = phases.map((ph, i) => ({
      ...ph,
      monthly_savings: i === 0 ? p.sp1 : i === 1 ? p.sp2 : ph.monthly_savings,
    }));
    try { return calcProjMonthly({ ...settings, phases: scenarioPhases, rate: p.r }, start, p.r); }
    catch { return [{ mo: 0, total: start, paid: start }]; }
  };

  const allDatas = (localSc || sc.map(() => ({ r: 6.5, sp1: 0, sp2: 0 }))).map(projOf);
  const sliced = allDatas.map(d => d.slice(0, endMo + 1));
  const labels = (sliced[1] || []).map(p => shortLabel(moToYM(settings?.ref_month, p.mo), lang));

  const refStart = settings?.ref_month ? settings.ref_month + '-01' : '';

  // Ist (Depot): daily portfolio history mapped to fractional month offsets
  const istDepotPoints = (Array.isArray(history) ? history : [])
    .filter(h => h.date >= refStart)
    .map(h => {
      const ym = h.date.slice(0, 7);
      const day = parseInt(h.date.slice(8)) || 1;
      const x = moOffset(settings?.ref_month, ym) + (day - 1) / 30;
      if (!isFinite(x) || x < 0 || x > endMo) return null;
      return { x, y: h.total };
    })
    .filter(Boolean);

  // Ist (Gesamt): check-ins with cash included
  const istGesamtPoints = (Array.isArray(checkins) ? checkins : [])
    .map(c => {
      const mo = moOffset(settings?.ref_month, (c.date || '').slice(0, 7));
      if (!isFinite(mo) || mo < 0 || mo > endMo) return null;
      return { x: mo, y: (c.invested || 0) + (c.cash || 0) };
    })
    .filter(Boolean);

  const phaseLines = phaseAnnotations(phases)
    .filter(a => a.year * 12 <= endMo)
    .map(a => ({ value: Math.round(a.year * 12), color: a.color, label: a.label }));

  const chartSeries = sc.map((s, i) => ({
    label: s.name,
    data: (sliced[i] || []).map(p => p.total),
    color: s.color,
    area: i === active,
    thick: i === active,
    dashed: i !== active,
    faint: i !== active,
  }));
  if (showIstDepot && istDepotPoints.length >= 2) {
    chartSeries.push({
      label: de ? 'Ist (Depot)' : 'Actual (portfolio)',
      data: istDepotPoints,
      color: 'var(--accent)',
      thick: true,
    });
  }
  if (showIstGesamt && istGesamtPoints.length >= 2) {
    chartSeries.push({
      label: de ? 'Ist (Gesamt)' : 'Actual (total)',
      data: istGesamtPoints,
      color: 'var(--pos)',
      thick: true,
      dashed: true,
    });
  }

  const saveScenarios = async () => {
    if (!localSc) return;
    setSaving(true);
    try {
      const owner = users?.find(u => u.id === currentUser)?.member_ids?.[0] ?? currentUser;
      await api.post(ownerUrl('/api/settings', owner), {
        ...settings,
        sc_r0: localSc[0].r, sc_s0: localSc[0].sp1, sc_d0: localSc[0].sp2,
        sc_r1: localSc[1].r, sc_s1: localSc[1].sp1, sc_d1: localSc[1].sp2,
        sc_r2: localSc[2].r, sc_s2: localSc[2].sp1, sc_d2: localSc[2].sp2,
      });
      setEditing(false);
      onRefresh?.();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const fixPlan = async () => {
    setFixing(true);
    try {
      const r = await api.post(ownerUrl('/api/baselines/fix', currentUser), {});
      setFixMsg(`${de ? 'Plan fixiert' : 'Plan fixed'}: ${eur(r.start_value)}`);
      setTimeout(() => setFixMsg(null), 4000);
      onRefresh?.();
    } catch (e) { alert(e.message); }
    finally { setFixing(false); }
  };

  if (!localSc) return null;

  return (
    <section className="tile rise">
      <div className="section-label" style={{ margin: '0 0 6px' }}>
        <span>{de ? 'SZENARIEN' : 'SCENARIOS'}</span>
        <div className="row gap-1">
          <span className="faint">{settings.totalMo}M</span>
          <button
            onClick={() => setEditing(v => !v)}
            style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 10,
              background: editing ? 'var(--accent)' : 'var(--bg-sunken)',
              border: '1px solid var(--line)',
              color: editing ? '#fff' : 'var(--ink-muted)',
              cursor: 'pointer', font: 'inherit',
            }}
          >
            {editing ? '✕' : (de ? 'Anpassen' : 'Edit')}
          </button>
        </div>
      </div>

      {/* Range filter + Ist toggles */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {RANGES_CFG.map(rc => (
          <button
            key={rc.id}
            onClick={() => setRange(rc.id)}
            style={{
              fontSize: 10.5, padding: '3px 8px', borderRadius: 8,
              background: range === rc.id ? 'var(--accent)' : 'var(--bg-sunken)',
              color: range === rc.id ? '#fff' : 'var(--ink-muted)',
              border: `1px solid ${range === rc.id ? 'var(--accent)' : 'var(--line)'}`,
              cursor: 'pointer', font: 'inherit', fontFamily: 'var(--font-mono)',
            }}
          >
            {de ? rc.de : rc.en}
          </button>
        ))}
        <span style={{ width: 1, height: 14, background: 'var(--line)', margin: '0 2px', flexShrink: 0 }} />
        {[
          { key: 'depot', label: de ? 'Ist (Depot)' : 'Actual (portfolio)', state: showIstDepot, set: setShowIstDepot },
          { key: 'gesamt', label: de ? 'Ist (Gesamt)' : 'Actual (total)', state: showIstGesamt, set: setShowIstGesamt },
        ].map(({ key, label, state, set }) => (
          <button
            key={key}
            onClick={() => set(v => !v)}
            style={{
              fontSize: 10.5, padding: '3px 8px', borderRadius: 8,
              background: state ? 'var(--bg-sunken)' : 'var(--bg)',
              color: state ? 'var(--ink)' : 'var(--ink-ghost)',
              border: `1px solid ${state ? 'var(--line-strong)' : 'var(--line)'}`,
              cursor: 'pointer', font: 'inherit',
            }}
          >
            {state ? '✓ ' : ''}{label}
          </button>
        ))}
      </div>

      <SvgLineChart
        labels={labels}
        indexToLabel={x => shortLabel(moToYM(settings?.ref_month, Math.round(x)), lang)}
        series={chartSeries}
        goalLine={settings.goal}
        phaseLines={phaseLines}
        height={200}
        style={chartStyle}
      />

      {/* Scenario cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
        {sc.map(s => {
          const goalMoData = allDatas[s.id]?.find(p => p.mo === (settings.totalMo ?? 0));
          const final = (goalMoData ?? allDatas[s.id]?.at(-1))?.total ?? 0;
          const reached = final >= (settings.goal ?? Infinity);
          const p = localSc[s.id];
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                cursor: 'pointer', textAlign: 'left', font: 'inherit',
                background: active === s.id ? 'var(--bg)' : 'var(--bg-elev)',
                border: `1px solid ${active === s.id ? s.color : 'var(--line)'}`,
                borderRadius: 14, padding: 10,
              }}
            >
              <div className="row gap-1" style={{ alignItems: 'center' }}>
                <span className="bucket-dot" style={{ background: s.color }} />
                <span style={{ fontSize: 9.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{s.name}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', marginTop: 4, color: reached ? 'var(--pos)' : 'var(--warn)' }}>
                <span className="pv">{eur(final)}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>{(p.r ?? 0).toFixed(1)}% p.a.</div>
            </button>
          );
        })}
      </div>

      {/* Editable sliders */}
      {editing && (
        <div style={{ marginTop: 16, background: 'var(--bg-sunken)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {sc.map((s, i) => {
              const p = localSc[i];
              const setP = (field, val) => setLocalSc(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x));
              return (
                <div key={s.id}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: s.color, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
                    {s.name.toUpperCase()}
                  </div>
                  {[
                    { label: de ? 'Rendite p.a.' : 'Return p.a.', field: 'r', min: 1, max: 14, step: 0.5, fmt: v => `${v}%` },
                    { label: de ? 'Sparrate Ph.1' : 'Savings Ph.1', field: 'sp1', min: 0, max: 4000, step: 50, fmt: v => eur(v) },
                    { label: de ? 'Sparrate Ph.2' : 'Savings Ph.2', field: 'sp2', min: 0, max: 6000, step: 50, fmt: v => eur(v) },
                  ].map(({ label, field, min, max, step, fmt }) => (
                    <div key={field} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{label}</span>
                        <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{fmt(p[field])}</span>
                      </div>
                      <input
                        type="range" min={min} max={max} step={step} value={p[field]}
                        onChange={e => setP(field, parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: s.color }}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <button
            onClick={saveScenarios}
            disabled={saving}
            style={{
              marginTop: 8, padding: '9px', borderRadius: 10, border: 'none',
              cursor: 'pointer', background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 500, font: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '…' : (de ? 'Szenarien speichern' : 'Save scenarios')}
          </button>
        </div>
      )}

      {/* Plan fixieren */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={fixPlan}
          disabled={fixing}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 10,
            background: 'var(--bg-sunken)', border: '1px solid var(--line)',
            color: 'var(--ink-muted)', cursor: fixing ? 'default' : 'pointer',
            fontSize: 12, fontWeight: 500, font: 'inherit',
            opacity: fixing ? 0.6 : 1,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L12 8M12 8l-3-3m3 3 3-3M3 14l9 7 9-7M3 18l9 7 9-7"/>
          </svg>
          {fixing ? '…' : (de ? 'Plan fixieren' : 'Fix plan')}
        </button>
        {baseline?.start_value != null && (
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
            {de ? 'Fixiert' : 'Fixed'}: {eur(baseline.start_value)}
          </span>
        )}
        {fixMsg && (
          <span style={{ fontSize: 11, color: 'var(--pos)', fontWeight: 500 }}>{fixMsg}</span>
        )}
      </div>
    </section>
  );
}

// ── Sparplan list + create/edit form ─────────────────────────────────────────
const EMPTY_FORM = { position_id: '', monthly_amount: '', execution_day: 1, started_at: '', notes: '' };

function SparplanList({ sparplans, positions, lang, currentUser, users, onRefresh }) {
  const de = lang === 'de';
  const list = Array.isArray(sparplans) ? sparplans : [];
  const active = list.filter(s => s.is_active);
  const total = active.reduce((s, sp) => s + sp.monthly_amount, 0);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const posOptions = Array.isArray(positions) ? positions : [];

  const openCreate = () => { setEditId(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (sp) => {
    setEditId(sp.id);
    setForm({
      position_id: sp.position_id,
      monthly_amount: sp.monthly_amount,
      execution_day: sp.execution_day ?? 1,
      started_at: sp.started_at ?? '',
      notes: sp.notes ?? '',
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); };

  const save = async () => {
    if (!form.position_id || !form.monthly_amount) return;
    setSaving(true);
    try {
      const owner = users?.find(u => u.id === currentUser)?.member_ids?.[0] ?? currentUser;
      const body = {
        position_id: parseInt(form.position_id),
        monthly_amount: parseFloat(form.monthly_amount),
        execution_day: parseInt(form.execution_day) || 1,
        started_at: form.started_at || null,
        notes: form.notes || null,
      };
      if (editId != null) {
        await api.put(`/api/sparplans/${editId}`, body);
      } else {
        await api.post(`/api/sparplans?owner=${owner}`, body);
      }
      closeForm();
      onRefresh?.();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const deactivate = async (id) => {
    if (!confirm(de ? 'Sparplan deaktivieren?' : 'Deactivate savings plan?')) return;
    try {
      await api.del(`/api/sparplans/${id}`);
      onRefresh?.();
    } catch (e) { alert(e.message); }
  };

  return (
    <section className="tile rise" style={{ animationDelay: '90ms' }}>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        <span>{de ? 'SPARPLÄNE' : 'SAVINGS PLANS'} · {active.length}</span>
        <div className="row gap-1">
          <span className="faint"><span className="pv">{eur(total)}</span>/Mo</span>
          <button
            className="pill pill-accent"
            style={{ border: 0, cursor: 'pointer', font: 'inherit' }}
            onClick={showForm && editId == null ? closeForm : openCreate}
          >
            {showForm && editId == null ? '✕' : `+ ${de ? 'Sparplan' : 'Plan'}`}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ background: 'var(--bg-sunken)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
              {de ? 'POSITION' : 'POSITION'}
            </div>
            <select
              className="input"
              value={form.position_id}
              onChange={e => setForm(f => ({ ...f, position_id: e.target.value }))}
            >
              <option value="">{de ? 'Bitte wählen…' : 'Select…'}</option>
              {posOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.ticker ? ` (${p.ticker})` : ''}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                {de ? 'BETRAG (€/Mo)' : 'AMOUNT (€/mo)'}
              </div>
              <input
                className="input" type="number" step="any" min="1" placeholder="0"
                value={form.monthly_amount}
                onChange={e => setForm(f => ({ ...f, monthly_amount: e.target.value }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                {de ? 'AUSFÜHRUNGSTAG' : 'EXEC. DAY'}
              </div>
              <input
                className="input" type="number" min="1" max="28" placeholder="1"
                value={form.execution_day}
                onChange={e => setForm(f => ({ ...f, execution_day: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                {de ? 'STARTDATUM' : 'START DATE'}
              </div>
              <input
                className="input" type="date"
                value={form.started_at}
                onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                {de ? 'NOTIZ' : 'NOTE'}
              </div>
              <input
                className="input" type="text" placeholder={de ? 'Optional' : 'Optional'}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={save}
              disabled={saving || !form.position_id || !form.monthly_amount}
              style={{
                flex: 1, padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500,
                font: 'inherit', opacity: (saving || !form.position_id || !form.monthly_amount) ? 0.5 : 1,
              }}
            >
              {saving ? '…' : (editId != null ? (de ? 'Speichern' : 'Save') : (de ? 'Erstellen' : 'Create'))}
            </button>
            <button
              onClick={closeForm}
              style={{
                padding: '9px 14px', borderRadius: 10, border: '1px solid var(--line)',
                background: 'var(--bg-sunken)', color: 'var(--ink-muted)',
                fontSize: 13, cursor: 'pointer', font: 'inherit',
              }}
            >
              {de ? 'Abbrechen' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {active.map(sp => (
        <div key={sp.id} className="activity-row" style={{ gridTemplateColumns: 'auto 1fr auto auto' }}>
          <div className="activity-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>↑</div>
          <div className="activity-text">
            <div className="name">{sp.position_name}</div>
            <div className="meta">
              {sp.ticker ? `${sp.ticker} · ` : ''}{de ? 'am' : 'on'} {sp.execution_day}.
              {sp.notes ? ` · ${sp.notes}` : ''}
            </div>
          </div>
          <div className="activity-amt"><span className="pv">{eur(sp.monthly_amount)}</span></div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
            <button
              onClick={() => openEdit(sp)}
              title={de ? 'Bearbeiten' : 'Edit'}
              style={{
                width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line)',
                background: 'var(--bg-sunken)', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'var(--ink-muted)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button
              onClick={() => deactivate(sp.id)}
              title={de ? 'Deaktivieren' : 'Deactivate'}
              style={{
                width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line)',
                background: 'var(--bg-sunken)', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'var(--neg)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      ))}
      {active.length === 0 && !showForm && (
        <div style={{ color: 'var(--ink-faint)', fontSize: 13, padding: '8px 0' }}>
          {de ? 'Keine aktiven Sparpläne' : 'No active savings plans'}
        </div>
      )}
    </section>
  );
}

// ── Check-in history ──────────────────────────────────────────────────────────
function CheckinHistory({ checkins, lang, currentUser, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    invested: '', cash: '', note: '',
  });
  const [saving, setSaving] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoMsg, setAutoMsg] = useState(null);

  const de = lang === 'de';
  const list = Array.isArray(checkins) ? checkins : [];
  const recent = [...list].reverse().slice(0, 6);

  const computedTotal = (parseFloat(form.invested) || 0) + (parseFloat(form.cash) || 0);

  const doAutoCheckin = async () => {
    if (currentUser === 'Gemeinsam') { alert(de ? 'Nicht verfügbar im Gemeinsam-Modus.' : 'Not available in shared mode.'); return; }
    setAutoLoading(true);
    try {
      const r = await api.post(ownerUrl('/api/checkins/auto', currentUser), {});
      setAutoMsg(`${de ? 'Eingecheckt' : 'Checked in'}: ${eur(r.invested)} + ${eur(r.cash)}`);
      setTimeout(() => setAutoMsg(null), 5000);
      onRefresh();
    } catch (e) { alert(e.message); }
    finally { setAutoLoading(false); }
  };

  const saveCheckin = async () => {
    if (!form.invested && !form.cash) return;
    setSaving(true);
    try {
      await api.post(ownerUrl('/api/checkins', currentUser), {
        date: form.date,
        invested: parseFloat(form.invested) || 0,
        cash: parseFloat(form.cash) || 0,
        note: form.note || null,
      });
      setShowForm(false);
      setForm({ date: new Date().toISOString().slice(0, 10), invested: '', cash: '', note: '' });
      onRefresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="tile rise" style={{ animationDelay: '150ms' }}>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        <span>{de ? 'CHECK-INS' : 'CHECK-INS'}</span>
        <div className="row gap-1">
          <button
            onClick={doAutoCheckin}
            disabled={autoLoading}
            title={de ? 'Aktuellen Depotwert automatisch einchecken' : 'Auto check-in with current portfolio value'}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 10,
              background: 'var(--bg-sunken)', border: '1px solid var(--line)',
              color: 'var(--ink-muted)', fontSize: 11, fontWeight: 500,
              cursor: autoLoading ? 'default' : 'pointer', font: 'inherit',
              opacity: autoLoading ? 0.5 : 1,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/>
            </svg>
            {autoLoading ? '…' : (de ? 'Aktuell' : 'Auto')}
          </button>
          <button
            className="pill pill-accent"
            style={{ border: 0, cursor: 'pointer', font: 'inherit' }}
            onClick={() => setShowForm(v => !v)}
          >
            {showForm ? '✕' : `+ ${de ? 'Manuell' : 'Manual'}`}
          </button>
        </div>
      </div>

      {autoMsg && (
        <div style={{ fontSize: 12, color: 'var(--pos)', background: 'var(--pos-soft)', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
          {autoMsg}
        </div>
      )}

      {showForm && (
        <div style={{ background: 'var(--bg-sunken)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{de ? 'DATUM' : 'DATE'}</div>
              <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{de ? 'GESAMT (AUTO)' : 'TOTAL (AUTO)'}</div>
              <div style={{ height: 38, display: 'flex', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                {computedTotal > 0 ? eur(computedTotal) : '—'}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{de ? 'INVESTIERT (€)' : 'INVESTED (€)'}</div>
              <input className="input" type="number" step="any" placeholder="0" value={form.invested} onChange={e => setForm(f => ({ ...f, invested: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>CASH (€)</div>
              <input className="input" type="number" step="any" placeholder="0" value={form.cash} onChange={e => setForm(f => ({ ...f, cash: e.target.value }))} />
            </div>
          </div>
          <input className="input" type="text" placeholder={de ? 'Notiz (optional)' : 'Note (optional)'} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          <button
            onClick={saveCheckin}
            disabled={saving || (!form.invested && !form.cash)}
            style={{
              padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500,
              font: 'inherit', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '…' : (de ? 'Speichern' : 'Save')}
          </button>
        </div>
      )}

      {recent.map((c, i) => {
        const prev = recent[i + 1];
        const total = (c.invested || 0) + (c.cash || 0);
        const prevTotal = prev ? ((prev.invested || 0) + (prev.cash || 0)) : 0;
        const delta = prev ? total - prevTotal : 0;
        return (
          <div key={c.date} className="activity-row" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
            <div className="mono faint" style={{ fontSize: 10.5, minWidth: 56 }}>{fmtDate(c.date, lang)}</div>
            <div className="activity-text">
              <div className="name"><span className="pv">{eur(total)}</span></div>
              <div className="meta">
                {c.note || (
                  <><span className="pv">{eur(c.invested)}</span> {de ? 'invest.' : 'inv.'} · <span className="pv">{eur(c.cash)}</span> cash</>
                )}
              </div>
            </div>
            <div className={`delta ${delta >= 0 ? 'pos' : 'neg'}`}>
              <span className="pv">{delta !== 0 ? `${delta >= 0 ? '+' : ''}${eur(delta)}` : '—'}</span>
            </div>
          </div>
        );
      })}
      {recent.length === 0 && (
        <div style={{ color: 'var(--ink-faint)', fontSize: 13, padding: '8px 0' }}>
          {de ? 'Noch keine Check-ins' : 'No check-ins yet'}
        </div>
      )}
    </section>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────
export default function ProjektionTab({
  settings, positions, sparplans, checkins, baseline, history,
  portfolioSummary,
  lang, chartStyle, currentUser, users, onRefresh,
}) {
  if (!settings) return <Spinner />;
  return (
    <>
      <ScenarioCompare
        settings={settings}
        lang={lang}
        chartStyle={chartStyle}
        baseline={baseline}
        portfolioSummary={portfolioSummary}
        currentUser={currentUser}
        users={users}
        onRefresh={onRefresh}
        checkins={checkins}
        history={history}
      />
      <SparplanList
        sparplans={sparplans}
        positions={positions}
        lang={lang}
        currentUser={currentUser}
        users={users}
        onRefresh={onRefresh}
      />
      <CheckinHistory
        checkins={checkins}
        lang={lang}
        currentUser={currentUser}
        onRefresh={onRefresh}
      />
    </>
  );
}
