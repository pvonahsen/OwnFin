import { useState, useEffect, useRef } from 'react';
import Spinner from '../components/Spinner.jsx';
import SvgLineChart from '../components/charts/SvgLineChart.jsx';
import SvgDonut from '../components/charts/SvgDonut.jsx';
import { eur, eur2, pct, num, fmtDate, abbr } from '../utils.js';
import { api, ownerUrl } from '../api.js';
import { smoothPath } from '../utils.js';

const CHART_COLORS = ['var(--c-1)','var(--c-2)','var(--c-3)','var(--c-4)','var(--c-5)','var(--c-6)','var(--c-7)'];

// ── Minimal price chart (for position detail) ─────────────────────────────────
function PriceChart({ prices, txns, lang }) {
  const ref = useRef(null);
  const [w, setW] = useState(280);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  if (!prices?.length) return (
    <div style={{ color: 'var(--ink-faint)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
      {lang === 'de' ? 'Keine Kursdaten' : 'No price data'}
    </div>
  );

  const h = 130, padL = 40, padR = 12, padT = 10, padB = 18;
  const innerW = Math.max(40, w - padL - padR);
  const innerH = h - padT - padB;

  const vals = prices.map(p => p.price);
  const yMin = Math.min(...vals) * 0.99;
  const yMax = Math.max(...vals) * 1.01;
  const yRange = yMax - yMin || 1;

  const sx = i => padL + (i / (prices.length - 1 || 1)) * innerW;
  const sy = v => padT + (1 - (v - yMin) / yRange) * innerH;

  const pts = prices.map((p, i) => [sx(i), sy(p.price)]);
  const path = smoothPath(pts);
  const area = `${path} L ${pts[pts.length-1][0]},${padT+innerH} L ${pts[0][0]},${padT+innerH} Z`;

  const buySet = new Set((txns || []).filter(t => t.units > 0).map(t => t.date));
  const sellSet = new Set((txns || []).filter(t => t.units < 0).map(t => t.date));

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  const step = Math.max(1, Math.floor(prices.length / 4));

  return (
    <div ref={ref} style={{ width: '100%', paddingBottom: 6 }}>
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={sy(v)} y2={sy(v)} stroke="var(--line)" strokeWidth="1" strokeDasharray={i===0?'0':'2 4'} />
            <text x={padL - 4} y={sy(v) + 4} fontSize="9" fill="var(--ink-faint)" textAnchor="end" fontFamily="var(--font-mono)">{eur2(v)}</text>
          </g>
        ))}
        <path d={area} fill="var(--accent)" opacity="0.1" />
        <path d={path} stroke="var(--accent)" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {prices.map((p, i) => {
          const isBuy = buySet.has(p.date);
          const isSell = sellSet.has(p.date);
          if (!isBuy && !isSell) return null;
          const cx = sx(i), cy = sy(p.price);
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r="5" fill={isBuy ? 'var(--pos)' : 'var(--neg)'} opacity="0.9" />
              <text x={cx} y={cy - 8} fontSize="8" fill={isBuy ? 'var(--pos)' : 'var(--neg)'} textAnchor="middle">{isBuy ? 'K' : 'V'}</text>
            </g>
          );
        })}
        {prices.filter((_, i) => i % step === 0).map((p, i, arr) => {
          const origIdx = i * step;
          return (
            <text key={i} x={sx(origIdx)} y={h - 2} fontSize="9" fill="var(--ink-faint)" textAnchor="middle">{p.date.slice(0, 7)}</text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Position detail sheet (slide-up) ─────────────────────────────────────────
function PositionSheet({ pos, currentUser, lang, onClose, onRefresh }) {
  const [tab, setTab] = useState('info');
  const [prices, setPrices] = useState(null);
  const [txns, setTxns] = useState(null);
  const [deletingTxId, setDeletingTxId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const handleDeleteTx = async (txId) => {
    if (!window.confirm(de ? 'Transaktion wirklich löschen?' : 'Really delete this transaction?')) return;
    setDeletingTxId(txId);
    try {
      await api.del(`/api/transactions/${txId}?owner=${currentUser}`);
      setTxns(prev => prev.filter(t => t.id !== txId));
      onRefresh();
    } finally {
      setDeletingTxId(null);
    }
  };

  useEffect(() => {
    if (!pos) return;
    setTab('info');
    setPrices(null); setTxns(null);
    setForm({
      units: pos.units ?? 0,
      avg_buy_price: pos.avg_buy_price ?? 0,
      target_weight: pos.target_weight ?? 0,
      monthly_rate: pos.monthly_rate ?? '',
    });
    api.get(`/api/positions/${pos.id}/history`).then(setPrices).catch(() => setPrices([]));
    api.get(ownerUrl(`/api/transactions?position_id=${pos.id}`, currentUser)).then(setTxns).catch(() => setTxns([]));
  }, [pos?.id, currentUser]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(ownerUrl(`/api/positions/${pos.id}`, currentUser), {
        units: parseFloat(form.units) || 0,
        avg_buy_price: parseFloat(form.avg_buy_price) || 0,
        target_weight: parseFloat(form.target_weight) || 0,
        monthly_rate: form.monthly_rate !== '' ? parseFloat(form.monthly_rate) : null,
      });
      onRefresh();
      onClose();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const de = lang === 'de';
  const open = !!pos;

  return (
    <div className={`set-overlay ${open ? 'open' : ''}`} onClick={onClose}>
      <div className="set-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh' }}>
        <div className="set-handle" />
        <div className="set-header">
          <div>
            <h2 style={{ fontSize: 16 }}>{pos?.name}</h2>
            <div className="mono faint" style={{ fontSize: 11, marginTop: 2 }}>{pos?.ticker} · {pos?.asset_class?.toUpperCase()}</div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {/* Sub-tab bar */}
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6 }}>
          {[['info', de ? 'Info' : 'Info'], ['chart', de ? 'Verlauf' : 'Chart'], ['txn', de ? 'Transaktionen' : 'Transactions'], ['edit', de ? 'Bearbeiten' : 'Edit']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{
                fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 20,
                border: 'none', cursor: 'pointer', font: 'inherit',
                background: tab === id ? 'var(--accent)' : 'var(--bg-sunken)',
                color: tab === id ? '#fff' : 'var(--ink-muted)',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div className="set-body" style={{ paddingTop: 0 }}>
          {tab === 'info' && pos && (
            <>
              <div className="position-detail" style={{ marginBottom: 16 }}>
                <div>
                  <div className="position-detail-key">{de ? 'KURS' : 'PRICE'}</div>
                  <div className="position-detail-val">{eur2(pos.current_price)}</div>
                </div>
                <div>
                  <div className="position-detail-key">{de ? 'STÜCK' : 'UNITS'}</div>
                  <div className="position-detail-val"><span className="pv">{num(pos.units, 4)}</span></div>
                </div>
                <div>
                  <div className="position-detail-key">{de ? 'WERT' : 'VALUE'}</div>
                  <div className="position-detail-val">{eur(pos.current_value)}</div>
                </div>
                <div>
                  <div className="position-detail-key">{de ? 'RENDITE' : 'RETURN'}</div>
                  <div className="position-detail-val" style={{ color: (pos.return_pct || 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                    {pct(pos.return_pct)}
                  </div>
                </div>
                <div>
                  <div className="position-detail-key">Ø {de ? 'KAUFKURS' : 'AVG COST'}</div>
                  <div className="position-detail-val">{eur2(pos.avg_buy_price)}</div>
                </div>
                <div>
                  <div className="position-detail-key">{de ? 'ZIEL %' : 'TARGET %'}</div>
                  <div className="position-detail-val">{pos.target_weight ?? '—'}%</div>
                </div>
              </div>
            </>
          )}

          {tab === 'txn' && (
            <>
              {!txns ? <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div> : txns.length === 0
                ? <div className="mono faint" style={{ fontSize: 12, padding: '12px 0' }}>{de ? 'Keine Transaktionen' : 'No transactions'}</div>
                : <>
                  <div className="mono faint" style={{ fontSize: 10.5, marginBottom: 6 }}>{txns.length} {de ? 'Transaktionen' : 'transactions'}</div>
                  {txns.map((t) => (
                    <div key={t.id} className="activity-row" style={{ alignItems: 'center' }}>
                      <div className="activity-icon" style={{
                        background: (t.units > 0 ? 'var(--pos)' : t.units < 0 ? 'var(--neg)' : 'var(--ocean)') + '22',
                        color: t.units > 0 ? 'var(--pos)' : t.units < 0 ? 'var(--neg)' : 'var(--ocean)',
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {t.units > 0 ? 'K' : t.units < 0 ? 'V' : 'D'}
                      </div>
                      <div className="activity-text">
                        <div className="name">{fmtDate(t.date, lang)} · {Math.abs(t.units).toFixed(4)} × {eur2(t.price)}</div>
                        <div className="meta">{t.fee ? `${de ? 'Gebühr' : 'Fee'}: ${eur2(t.fee)}` : t.type}</div>
                      </div>
                      <div className="activity-amt">{eur(Math.abs(t.units) * t.price)}</div>
                      <button
                        onClick={() => handleDeleteTx(t.id)}
                        disabled={deletingTxId === t.id}
                        title={de ? 'Löschen' : 'Delete'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'var(--ink-faint)', flexShrink: 0, opacity: deletingTxId === t.id ? 0.4 : 1 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </>
              }
            </>
          )}

          {tab === 'chart' && (
            <div style={{ padding: '0 0 8px' }}>
              {!prices ? <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div>
                : <PriceChart prices={prices} txns={txns} lang={lang} />
              }
              <div className="row gap-2" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <span className="row gap-1" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pos)', display: 'inline-block' }} />
                  {de ? 'Kauf' : 'Buy'}
                </span>
                <span className="row gap-1" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neg)', display: 'inline-block' }} />
                  {de ? 'Verkauf' : 'Sell'}
                </span>
              </div>
            </div>
          )}

          {tab === 'edit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                [de ? 'Stück (Einheiten)' : 'Units', 'units', 'number', 'any'],
                [de ? 'Ø Kaufkurs (€)' : 'Avg buy price (€)', 'avg_buy_price', 'number', 'any'],
                [de ? 'Zielgewicht (%)' : 'Target weight (%)', 'target_weight', 'number', '0.1'],
                [de ? 'Monatliche Sparrate (€)' : 'Monthly savings (€)', 'monthly_rate', 'number', '1'],
              ].map(([label, field, type, step]) => (
                <div key={field}>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>{label.toUpperCase()}</div>
                  <input
                    className="input"
                    type={type}
                    step={step}
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <button
                onClick={save}
                disabled={saving}
                style={{
                  marginTop: 4, padding: '11px', borderRadius: 12, border: 'none',
                  cursor: 'pointer', background: 'var(--accent)', color: '#fff',
                  fontSize: 14, fontWeight: 500, font: 'inherit',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? '…' : (de ? 'Speichern' : 'Save')}
              </button>
              <button
                onClick={async () => {
                  if (!confirm(de ? `"${pos.name}" deaktivieren?` : `Deactivate "${pos.name}"?`)) return;
                  await api.del(`/api/positions/${pos.id}`);
                  onRefresh(); onClose();
                }}
                style={{
                  padding: '11px', borderRadius: 12, border: '1px solid var(--neg)',
                  cursor: 'pointer', background: 'transparent', color: 'var(--neg)',
                  fontSize: 13, fontWeight: 500, font: 'inherit',
                }}
              >
                {de ? 'Position deaktivieren' : 'Deactivate position'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Portfolio CSV import sheet ────────────────────────────────────────────────
function ImportPortfolioSheet({ open, onClose, currentUser, lang, onImported }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const de = lang === 'de';

  const doImport = async () => {
    if (!files.length) return;
    setLoading(true); setResult(null);
    let totalImported = 0, totalSkipped = 0;
    const allErrors = [];
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      try {
        const res = await fetch(ownerUrl('/api/transactions/import', currentUser), { method: 'POST', body: fd });
        const data = await res.json();
        totalImported += data.imported ?? 0;
        totalSkipped += data.skipped ?? 0;
        if (data.errors?.length) allErrors.push(...data.errors);
      } catch (e) {
        allErrors.push(String(e));
      }
    }
    const merged = { imported: totalImported, skipped: totalSkipped, errors: allErrors };
    setResult(merged);
    if (totalImported > 0) onImported?.();
    setLoading(false);
  };

  return (
    <div className={`set-overlay ${open ? 'open' : ''}`} onClick={onClose}>
      <div className="set-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '70vh' }}>
        <div className="set-handle" />
        <div className="set-header">
          <h2>{de ? 'Depot-Transaktionen importieren' : 'Import depot transactions'}</h2>
          <button className="icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div className="set-body">
          <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 12 }}>
            {de ? 'CSV-Dateien mit BUY/SELL-Transaktionen hochladen (Trade Republic, comdirect, etc.).'
               : 'Upload CSV files with BUY/SELL transactions (Trade Republic, comdirect, etc.).'}
          </p>
          <div style={{ background: 'var(--bg-sunken)', borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', whiteSpace: 'pre' }}>
{`datetime,date,type,name,symbol,shares,price
2025-05-23,2025-05-23,BUY,Rheinmetall,DE000...,0.05,1772.0`}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx"
            multiple
            onChange={e => { setFiles(Array.from(e.target.files)); setResult(null); }}
            style={{ marginBottom: 12, fontSize: 13, color: 'var(--ink-muted)', width: '100%' }}
          />
          {files.length > 1 && (
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 8 }}>
              {files.length} {de ? 'Dateien ausgewählt' : 'files selected'}
            </div>
          )}
          <button
            onClick={doImport}
            disabled={!files.length || loading}
            style={{
              width: '100%', padding: '11px', borderRadius: 12, border: 'none',
              cursor: 'pointer', background: 'var(--accent)', color: '#fff',
              fontSize: 14, fontWeight: 500, font: 'inherit',
              opacity: (!files.length || loading) ? 0.5 : 1,
            }}
          >
            {loading ? '…' : (de ? 'Importieren' : 'Import')}
          </button>
          {result && (
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 10,
              background: result.errors?.length ? 'var(--warn-soft, #fef3c7)' : 'var(--pos-soft)',
              border: `1px solid ${result.errors?.length ? 'var(--warn)' : 'var(--pos)'}`,
            }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>
                {result.imported ?? 0} {de ? 'importiert' : 'imported'} · {result.skipped ?? 0} {de ? 'übersprungen' : 'skipped'}
              </div>
              {result.errors?.slice(0, 3).map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>{e}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Donut + legend ───────────────────────────────────────────────────────────
function PortfolioDonut({ positions, lang, onEditPosition }) {
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('ist');
  const [legendOpen, setLegendOpen] = useState(() => window.innerWidth >= 1024);
  const total = positions.reduce((s, p) => s + (p.current_value || 0), 0);
  const targetTotal = positions.reduce((s, p) => s + (p.target_weight || 0), 0) || 100;

  const slices = positions.map((p, i) => ({
    id: p.id,
    label: p.name,
    color: CHART_COLORS[i % 7],
    value: mode === 'ist' ? (p.current_value || 0) : (p.target_weight || 0),
    pos: p,
  }));

  const sel = selected ? positions.find(p => p.id === selected) : null;

  return (
    <>
      <div className="between" style={{ marginBottom: 8 }}>
        <span className="mono faint" style={{ fontSize: 10.5 }}>
          {mode === 'ist' ? (lang === 'de' ? 'IST-VERTEILUNG' : 'CURRENT MIX') : (lang === 'de' ? 'ZIEL-VERTEILUNG' : 'TARGET MIX')}
        </span>
        <div className="seg">
          <button className={mode === 'ist' ? 'on' : ''} onClick={() => setMode('ist')}>{lang === 'de' ? 'Ist' : 'Actual'}</button>
          <button className={mode === 'soll' ? 'on' : ''} onClick={() => setMode('soll')}>{lang === 'de' ? 'Ziel' : 'Target'}</button>
        </div>
      </div>

      <div className="donut-wrap" style={{ margin: legendOpen ? '0 0 8px' : '0' }}>
        <SvgDonut
          slices={slices.map(s => ({
            ...s,
            color: selected && s.id !== selected ? s.color + '44' : s.color,
          }))}
          size={legendOpen ? 180 : 220}
          thickness={22}
          label={mode === 'ist' ? (lang === 'de' ? 'INVESTIERT' : 'INVESTED') : (lang === 'de' ? 'ZIEL' : 'TARGET')}
          value={mode === 'ist' ? eur(total) : `${targetTotal}%`}
        />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <button
          onClick={() => setLegendOpen(v => !v)}
          style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 10,
            background: legendOpen ? 'var(--accent-soft)' : 'var(--bg-sunken)',
            border: '1px solid var(--line)', color: legendOpen ? 'var(--accent-ink)' : 'var(--ink-muted)',
            cursor: 'pointer', font: 'inherit',
          }}
        >
          {legendOpen
            ? (lang === 'de' ? 'Legende ausblenden' : 'Hide legend')
            : (lang === 'de' ? 'Legende anzeigen' : 'Show legend')}
        </button>
      </div>

      {legendOpen && (
      <div className="donut-legend">
        {slices.map((s, i) => {
          const v = s.value;
          const p = mode === 'ist' ? (total > 0 ? (v / total) * 100 : 0) : v;
          return (
            <button
              key={s.id}
              className={`donut-legend-row ${selected === s.id ? 'selected' : ''}`}
              onClick={() => setSelected(selected === s.id ? null : s.id)}
            >
              <span className="swatch" style={{ background: CHART_COLORS[i % 7] }} />
              <span className="name">{s.label}</span>
              <span className="right">
                {mode === 'ist' ? eur(v) : `${v}%`}
                <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>{p.toFixed(1)}%</span>
              </span>
            </button>
          );
        })}
      </div>
      )}

      {sel && (
        <div className="position-detail rise">
          <div>
            <div className="position-detail-key">{lang === 'de' ? 'KURS' : 'PRICE'}</div>
            <div className="position-detail-val">{eur2(sel.current_price)}</div>
          </div>
          <div>
            <div className="position-detail-key">{lang === 'de' ? 'STÜCK' : 'UNITS'}</div>
            <div className="position-detail-val"><span className="pv">{num(sel.units, 4)}</span></div>
          </div>
          <div>
            <div className="position-detail-key">{lang === 'de' ? 'WERT' : 'VALUE'}</div>
            <div className="position-detail-val">{eur(sel.current_value)}</div>
          </div>
          <div>
            <div className="position-detail-key">{lang === 'de' ? 'RENDITE' : 'RETURN'}</div>
            <div className="position-detail-val" style={{ color: (sel.return_pct || 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
              {pct(sel.return_pct)}
            </div>
          </div>
          <div>
            <div className="position-detail-key">Ø {lang === 'de' ? 'KAUFKURS' : 'AVG COST'}</div>
            <div className="position-detail-val">{eur2(sel.avg_buy_price)}</div>
          </div>
          <div>
            <div className="position-detail-key">{lang === 'de' ? 'SPARRATE' : 'MONTHLY'}</div>
            <div className="position-detail-val">{sel.monthly_rate ? eur(sel.monthly_rate) : '—'}</div>
          </div>
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <button
              onClick={() => onEditPosition(sel)}
              style={{
                width: '100%', padding: '8px', borderRadius: 8,
                background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                color: 'var(--accent-ink)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', font: 'inherit',
              }}
            >
              {lang === 'de' ? 'Details & Bearbeiten' : 'Details & Edit'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Performance chart ─────────────────────────────────────────────────────────
function PortfolioPerformance({ history, lang, chartStyle, currentUser, users }) {
  const [range, setRange] = useState('6M');
  const [showMsci, setShowMsci] = useState(false);
  const [msciData, setMsciData] = useState(null);
  const [msciLoading, setMsciLoading] = useState(false);

  useEffect(() => {
    if (!showMsci || msciData !== null) return;
    setMsciLoading(true);
    const owner = users?.find(u => u.id === currentUser)?.member_ids?.[0] ?? currentUser;
    api.get(`/api/portfolio/msci-world-simulation?owner=${owner}`)
      .then(setMsciData)
      .catch(() => setMsciData([]))
      .finally(() => setMsciLoading(false));
  }, [showMsci, currentUser, msciData]);

  const ranges = [['1M', 30], ['3M', 90], ['6M', 180], ['1J', 365], ['ALL', 9999]];
  const days = ranges.find(r => r[0] === range)[1];
  const slice = history.slice(-days);
  const labels = slice.map(h => fmtDate(h.date, lang));
  const data = slice.map(h => h.total);
  const investedRaw = slice.map(h => h.invested ?? null);
  const firstIdx = investedRaw.findIndex(v => v !== null);
  const invested = firstIdx > 0
    ? investedRaw.map((v, i) => (v === null && i < firstIdx) ? investedRaw[firstIdx] : v)
    : investedRaw;
  const hasInvested = invested.some(v => v != null);
  const start = data[0] || 0;
  const last = data[data.length - 1] || 0;
  const delta = last - start;
  const deltaPct = start ? (delta / start) * 100 : 0;

  const series = [
    ...(hasInvested ? [{
      label: lang === 'de' ? 'Investiert' : 'Invested',
      data: invested,
      color: 'var(--ink-faint)',
      dashed: true,
      faint: true,
    }] : []),
    { label: lang === 'de' ? 'Depotwert' : 'Portfolio', data, color: 'var(--accent)', area: true, thick: true },
  ];

  if (showMsci && msciData && msciData.length > 0) {
    const msciMap = Object.fromEntries(msciData.map(m => [m.date, m.total]));
    const msciValues = slice.map(h => msciMap[h.date] ?? null);
    if (msciValues.some(v => v != null)) {
      series.push({
        label: 'MSCI World (fiktiv)',
        data: msciValues,
        color: 'var(--c-2)',
        dashed: true,
      });
    }
  }

  return (
    <>
      <div className="between" style={{ marginTop: 4 }}>
        <div>
          <div className="mono faint" style={{ fontSize: 10.5 }}>{lang === 'de' ? 'WERT' : 'VALUE'} · {range}</div>
          <div className="serif" style={{ fontSize: 22, letterSpacing: '-0.015em', fontVariantNumeric: 'tabular-nums' }}>
            <span className="pv">{eur(last)}</span>
          </div>
          <div className={`delta ${delta >= 0 ? 'pos' : 'neg'}`} style={{ marginTop: 2 }}>
            <span className="pv">{delta >= 0 ? '+' : ''}{eur(delta)}</span>{' · '}{deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div className="seg">
            {ranges.map(r => (
              <button key={r[0]} className={range === r[0] ? 'on' : ''} onClick={() => setRange(r[0])}>
                {r[0]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowMsci(v => !v)}
            style={{
              fontSize: 10.5, padding: '3px 8px', borderRadius: 8,
              background: showMsci ? 'var(--bg-sunken)' : 'var(--bg)',
              color: showMsci ? 'var(--ink)' : 'var(--ink-ghost)',
              border: `1px solid ${showMsci ? 'var(--line-strong)' : 'var(--line)'}`,
              cursor: 'pointer', font: 'inherit',
              opacity: msciLoading ? 0.6 : 1,
            }}
          >
            {showMsci ? '✓ ' : ''}MSCI World
          </button>
        </div>
      </div>
      <div style={{ marginTop: 10, paddingBottom: 6 }}>
        <SvgLineChart
          labels={labels}
          series={series}
          height={260}
          style={chartStyle}
        />
      </div>
    </>
  );
}

// ── Positions list ────────────────────────────────────────────────────────────
function PositionsList({ positions, lang, onEdit }) {
  const sorted = [...positions].sort((a, b) => (b.current_value || 0) - (a.current_value || 0));
  const total = positions.reduce((s, p) => s + (p.current_value || 0), 0);
  return (
    <section className="tile rise" style={{ animationDelay: '90ms' }}>
      <div className="section-label" style={{ margin: '0 0 6px' }}>
        <span>{lang === 'de' ? 'POSITIONEN' : 'POSITIONS'} · {positions.length}</span>
        <span className="faint"><span className="pv">{eur(total)}</span></span>
      </div>
      {sorted.map(p => {
        const w = total > 0 ? (p.current_value / total) * 100 : 0;
        return (
          <button
            key={p.id}
            className="activity-row"
            style={{ gridTemplateColumns: '1fr auto auto', width: '100%', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left', padding: '6px 0' }}
            onClick={() => onEdit(p)}
          >
            <div className="activity-text">
              <div className="name">{p.name}</div>
              <div className="meta">{p.ticker} · <span className="pv">{num(p.units, 2)}</span> × {eur2(p.current_price)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="activity-amt"><span className="pv">{eur(p.current_value)}</span></div>
              <div className="meta faint" style={{ fontSize: 11, marginTop: 1 }}>{w.toFixed(1)}%</div>
            </div>
            <div className="delta" style={{ minWidth: 54, textAlign: 'right', color: (p.return_pct || 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
              {pct(p.return_pct)}
            </div>
          </button>
        );
      })}
    </section>
  );
}

// ── Rebalancing ───────────────────────────────────────────────────────────────
function RebalancingTile({ positions, lang }) {
  const total = positions.reduce((s, p) => s + (p.current_value || 0), 0);
  const rows = positions.map(p => ({
    name: p.name,
    cur: total > 0 ? (p.current_value / total) * 100 : 0,
    target: p.target_weight || 0,
    diff: total > 0 ? ((p.current_value / total) * 100) - (p.target_weight || 0) : 0,
    delta_eur: ((p.target_weight || 0) / 100) * total - (p.current_value || 0),
  })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return (
    <section className="tile rise" style={{ animationDelay: '150ms' }}>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        <span>{lang === 'de' ? 'REBALANCING' : 'REBALANCING'}</span>
        <span className="faint">{lang === 'de' ? 'Vorschlag' : 'Suggested'}</span>
      </div>
      {rows.slice(0, 5).map(r => (
        <div key={r.name} className="between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
            <div className="faint mono" style={{ fontSize: 10.5 }}>{r.cur.toFixed(1)}% / {r.target}%</div>
          </div>
          <div className={`pill ${r.delta_eur >= 0 ? 'pill-pos' : 'pill-neg'}`}>
            <span className="pv">{r.delta_eur >= 0 ? '+' : ''}{eur(r.delta_eur)}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Buy/Sell form ─────────────────────────────────────────────────────────────
const EMPTY_TX = { position_id: '', type: 'buy', date: new Date().toISOString().slice(0, 10), units: '', price: '', fee: '' };

function BuySellForm({ positions, currentUser, onRefresh, lang }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_TX);
  const [saving, setSaving] = useState(false);
  const de = lang === 'de';

  const isDividend = form.type === 'dividend' || form.type === 'dividend_reinvested';
  const canSave = form.position_id && (
    isDividend ? !!form.price : (!!form.units && !!form.price)
  );

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await api.post(ownerUrl('/api/transactions', currentUser), {
        position_id: parseInt(form.position_id),
        type: form.type,
        date: form.date,
        units: isDividend ? 0 : parseFloat(form.units),
        price: parseFloat(form.price),
        fee: isDividend ? 0 : parseFloat(form.fee || 0),
      });
      setOpen(false);
      setForm(EMPTY_TX);
      onRefresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '12px 16px',
          background: 'var(--accent-soft)', border: '1px dashed var(--accent)',
          borderRadius: 14, cursor: 'pointer',
          color: 'var(--accent-ink)', fontSize: 13, fontWeight: 500,
          font: 'inherit',
        }}
      >
        + {de ? 'Transaktion erfassen' : 'Add transaction'}
      </button>
    );
  }

  return (
    <section className="tile">
      <div className="section-label" style={{ margin: '0 0 12px' }}>
        <span>{de ? 'TRANSAKTION' : 'TRANSACTION'}</span>
        <button className="icon-btn" onClick={() => setOpen(false)} style={{ width: 24, height: 24 }}>✕</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <select className="select" value={form.position_id} onChange={e => setForm(f => ({ ...f, position_id: e.target.value }))}>
          <option value="">{de ? 'Position wählen…' : 'Select position…'}</option>
          {positions.map(p => <option key={p.id} value={p.id}>{p.name}{p.ticker ? ` (${p.ticker})` : ''}</option>)}
        </select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select className="select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, units: '', price: '' }))}>
            <option value="buy">{de ? 'Kauf' : 'Buy'}</option>
            <option value="sell">{de ? 'Verkauf' : 'Sell'}</option>
            <option value="dividend">{de ? 'Dividende (ausgeschüttet)' : 'Dividend (paid out)'}</option>
            <option value="dividend_reinvested">{de ? 'Dividende (reinvestiert)' : 'Dividend (reinvested)'}</option>
          </select>
          <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>
        {isDividend ? (
          <input
            className="input" type="number" step="any" min="0"
            placeholder={de ? 'Betrag (€)' : 'Amount (€)'}
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <input className="input" type="number" placeholder={de ? 'Stück' : 'Units'} value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
            <input className="input" type="number" placeholder={de ? 'Kurs (€)' : 'Price (€)'} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            <input className="input" type="number" placeholder={de ? 'Gebühr' : 'Fee'} value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value }))} />
          </div>
        )}
        <button
          onClick={save}
          disabled={saving || !canSave}
          style={{
            padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 500,
            font: 'inherit', opacity: (saving || !canSave) ? 0.6 : 1,
          }}
        >
          {saving ? '…' : (de ? 'Speichern' : 'Save')}
        </button>
      </div>
    </section>
  );
}

// ── Realized gains tile ───────────────────────────────────────────────────────
function RealizedGains({ currentUser, users, lang }) {
  const de = lang === 'de';
  const [summary, setSummary] = useState(null);
  const [sales, setSales] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const owner = users?.find(u => u.id === currentUser)?.member_ids?.[0] ?? currentUser;
    api.get(`/api/realized-gains/summary?owner=${owner}`).then(setSummary).catch(() => {});
    api.get(`/api/realized-gains/transactions?owner=${owner}&limit=20`).then(setSales).catch(() => {});
  }, [currentUser]);

  if (!summary) return null;
  if (!summary.total_gains && !summary.total_losses) return null;

  const netColor = summary.net_gain >= 0 ? 'var(--pos)' : 'var(--neg)';
  return (
    <section className="tile rise" style={{ animationDelay: '60ms' }}>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        <span>{de ? 'REALISIERTE G/V' : 'REALIZED G/L'}</span>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8, background: 'var(--bg-sunken)', border: '1px solid var(--line)', color: 'var(--ink-muted)', cursor: 'pointer', font: 'inherit' }}
        >{open ? (de ? 'Zuklappen' : 'Collapse') : (de ? 'Details' : 'Details')}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: open ? 10 : 0 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{de ? 'GEWINNE' : 'GAINS'}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pos)', fontVariantNumeric: 'tabular-nums' }}><span className="pv">{eur(summary.total_gains)}</span></div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>{de ? 'VERLUSTE' : 'LOSSES'}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}><span className="pv">{eur(summary.total_losses)}</span></div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>NETTO</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: netColor, fontVariantNumeric: 'tabular-nums' }}><span className="pv">{eur(summary.net_gain)}</span></div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>KeSt 27.5%</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)', fontVariantNumeric: 'tabular-nums' }}><span className="pv">{eur(summary.kest_amount)}</span></div>
        </div>
      </div>
      {open && sales.map(s => (
        <div key={`${s.date}-${s.position_name}`} className="activity-row">
          <div className="mono faint" style={{ fontSize: 10.5, minWidth: 56 }}>{s.date}</div>
          <div className="activity-text">
            <div className="name">{s.position_name}</div>
            <div className="meta">{s.units_sold} St. · <span className="pv">{eur(s.cost_per_unit)}</span> → <span className="pv">{eur(s.sell_price)}</span></div>
          </div>
          <div className={`delta ${s.total_gain >= 0 ? 'pos' : 'neg'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            <span className="pv">{s.total_gain >= 0 ? '+' : ''}{eur(s.total_gain)}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────
export default function PortfolioTab({ positions, history, lang, chartStyle, currentUser, users, onRefresh }) {
  const [view, setView] = useState('line');
  const [editPos, setEditPos] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  if (!positions) return <Spinner />;
  const filtered = positions.filter(p => p.asset_class !== 'cash');

  return (
    <>
      <section className="tile rise" style={{ minHeight: 400, overflow: 'hidden', paddingBottom: 48 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <div className="section-label" style={{ margin: 0 }}>
            <span>
              {view === 'donut' ? (lang === 'de' ? 'GEWICHTUNG' : 'ALLOCATION') : (lang === 'de' ? 'ENTWICKLUNG' : 'PERFORMANCE')}
            </span>
          </div>
          <div className="row gap-1">
            <button
              onClick={() => setImportOpen(true)}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 12,
                background: 'var(--bg-sunken)', border: '1px solid var(--line)',
                color: 'var(--ink-muted)', cursor: 'pointer', font: 'inherit',
              }}
            >
              {lang === 'de' ? '↑ CSV' : '↑ CSV'}
            </button>
            <div className="seg">
              <button className={view === 'line' ? 'on' : ''} onClick={() => setView('line')}>
                {lang === 'de' ? 'Trend' : 'Trend'}
              </button>
              <button className={view === 'donut' ? 'on' : ''} onClick={() => setView('donut')}>
                {lang === 'de' ? 'Gewichtung' : 'Mix'}
              </button>
            </div>
          </div>
        </div>
        {view === 'donut'
          ? <PortfolioDonut positions={filtered} lang={lang} onEditPosition={setEditPos} />
          : <PortfolioPerformance history={history || []} lang={lang} chartStyle={chartStyle} currentUser={currentUser} users={users} />
        }
      </section>

      <PositionsList positions={filtered} lang={lang} onEdit={setEditPos} />
      <RealizedGains currentUser={currentUser} users={users} lang={lang} />
      <RebalancingTile positions={filtered} lang={lang} />
      <BuySellForm positions={filtered} currentUser={currentUser} onRefresh={onRefresh} lang={lang} />

      <PositionSheet
        pos={editPos}
        currentUser={currentUser}
        lang={lang}
        onClose={() => setEditPos(null)}
        onRefresh={onRefresh}
      />
      <ImportPortfolioSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        currentUser={currentUser}
        lang={lang}
        onImported={onRefresh}
      />
    </>
  );
}
