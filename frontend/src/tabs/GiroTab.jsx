import { useState, useRef, useEffect } from 'react';
import Spinner from '../components/Spinner.jsx';
import { eur, eur2, fmtDateLong } from '../utils.js';
import { BUCKETS, bucketOfDynamic } from '../constants.js';
import { api } from '../api.js';

// ── Category SVG icons (Feather Icons style, 24×24) ───────────────────────────
const _IC = {
  briefcase:       '<path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  home:            '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  'shopping-cart': '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  coffee:          '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  'trending-up':   '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  archive:         '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
  'bar-chart-2':   '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  navigation:      '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  'book-open':     '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  monitor:         '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  tag:             '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  activity:        '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'credit-card':   '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  box:             '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  'dollar-sign':   '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  cpu:             '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  'map-pin':       '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  droplet:         '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  star:            '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  package:         '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  shield:          '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  film:            '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
  'help-circle':   '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
};

function CategoryIcon({ name, size = 15, color = 'currentColor' }) {
  const inner = _IC[name];
  if (!inner) return <span style={{ fontSize: Math.round(size * 0.85), lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{name?.slice(0, 1) || '·'}</span>;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}
         dangerouslySetInnerHTML={{ __html: inner }} />
  );
}

// ── Giro CSV import sheet ─────────────────────────────────────────────────────
function ImportGiroSheet({ open, onClose, currentUser, lang, onImported }) {
  const [files, setFiles] = useState([]);
  const [bank, setBank] = useState('tomorrow');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [accountWarning, setAccountWarning] = useState(null);
  const de = lang === 'de';

  const detectCsvOwner = async (f) => {
    const text = await f.text();
    if (text.includes('Partner*innenkonto')) return 'Gemeinsam';
    return null;
  };

  const doImport = async () => {
    if (!files.length) return;
    setLoading(true); setResult(null);
    let totalImported = 0, totalRows = 0, totalSkipped = 0;
    const allErrors = [];
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      try {
        const res = await fetch(`/api/banking/import?owner=${currentUser}&bank=${bank}`, { method: 'POST', body: fd });
        const data = await res.json();
        totalImported += data.imported ?? 0;
        totalRows += data.total_rows ?? ((data.imported ?? 0) + (data.skipped ?? 0));
        totalSkipped += data.skipped ?? 0;
        if (data.errors?.length) allErrors.push(...data.errors);
      } catch (e) {
        allErrors.push(String(e));
      }
    }
    const merged = { imported: totalImported, total_rows: totalRows, skipped: totalSkipped, errors: allErrors };
    setResult(merged);
    if (totalImported > 0) onImported?.();
    setLoading(false);
  };

  return (
    <div className={`set-overlay ${open ? 'open' : ''}`} onClick={onClose}>
      <div className="set-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '70vh' }}>
        <div className="set-handle" />
        <div className="set-header">
          <h2>{de ? 'Kontoumsätze importieren' : 'Import bank transactions'}</h2>
          <button className="icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div className="set-body">
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>{de ? 'BANK / FORMAT' : 'BANK / FORMAT'}</div>
            <div className="seg">
              {[['tomorrow', 'Tomorrow'], ['dkb', 'DKB'], ['comdirect', 'Comdirect'], ['generic', 'Generic CSV']].map(([id, label]) => (
                <button key={id} className={bank === id ? 'on' : ''} onClick={() => setBank(id)}>{label}</button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 12 }}>
            {bank === 'tomorrow'
              ? (de ? 'Export über Tomorrow App → Profil → Konto → Exportieren.' : 'Export via Tomorrow App → Profile → Account → Export.')
              : (de ? 'CSV-Kontoauszug importieren.' : 'Import CSV account statement.')}
          </p>
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={async e => {
              const fs = Array.from(e.target.files);
              setFiles(fs); setResult(null); setAccountWarning(null);
              if (fs.length === 1 && bank === 'tomorrow') {
                const detected = await detectCsvOwner(fs[0]);
                if (detected && detected !== currentUser) {
                  setAccountWarning({ detectedOwner: detected });
                }
              }
            }}
            style={{ marginBottom: 12, fontSize: 13, color: 'var(--ink-muted)', width: '100%' }}
          />
          {files.length > 1 && (
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 8 }}>
              {files.length} {de ? 'Dateien ausgewählt' : 'files selected'}
            </div>
          )}
          {accountWarning && (
            <div style={{
              background: 'var(--warn-soft, #fef3c7)', border: '1px solid var(--warn, #d97706)',
              borderRadius: 10, padding: '10px 12px', marginBottom: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--warn-ink, #92400e)' }}>
                {de
                  ? `Diese Datei scheint zum „${accountWarning.detectedOwner}"-Konto zu gehören. Als ${currentUser} importieren?`
                  : `This file appears to belong to the "${accountWarning.detectedOwner}" account. Import as ${currentUser}?`}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setAccountWarning(null); setFiles([]); }}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-sunken)', cursor: 'pointer', font: 'inherit', fontSize: 13 }}
                >
                  {de ? 'Abbrechen' : 'Cancel'}
                </button>
                <button
                  onClick={() => setAccountWarning(null)}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13 }}
                >
                  {de ? 'Trotzdem importieren' : 'Import anyway'}
                </button>
              </div>
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
                {result.imported ?? 0} {de ? 'von' : 'of'} {result.total_rows ?? ((result.imported ?? 0) + (result.skipped ?? 0))} {de ? 'importiert' : 'imported'}
                {(result.skipped ?? 0) > 0 && ` · ${result.skipped} ${de ? 'übersprungen' : 'skipped'}`}
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

// ── Bucket calculation ────────────────────────────────────────────────────────
function bucketsForRange(txns, fromDate, toDate, categories = []) {
  const inWindow = txns.filter(tx => {
    const d = new Date(tx.date);
    return d >= fromDate && d < toDate && !tx.is_transfer;
  });

  // Include ALL is_transfer transactions for invest/goals categories (not just negative)
  // We use the Giro-side perspective: negative = sending to pocket (saving), positive = receiving from pocket (withdrawal = negative saving)
  // Exclude Pocket-account-side transactions to avoid double counting
  const savingsTransfers = txns.filter(tx => {
    const d = new Date(tx.date);
    if (d < fromDate || d >= toDate) return false;
    if (!tx.is_transfer) return false;
    // Exclude pocket-account side (identified by account_name containing "pockets")
    if ((tx.account_name || '').toLowerCase().includes('pockets')) return false;
    const cat = tx.custom_category || tx.original_category || '';
    const b = bucketOfDynamic(cat, categories);
    return b === 'invest' || b === 'goals';
  });

  // Only categories explicitly tagged as income type count as income
  const incomeCatNames = new Set(categories.filter(c => c.type === 'income').map(c => c.name));

  const catAmounts = {};
  inWindow.forEach(tx => {
    const cat = tx.custom_category || tx.original_category || 'Sonstiges';
    catAmounts[cat] = (catAmounts[cat] || 0) + tx.amount;
  });

  let income = 0;
  const bucketTotals = { fix: 0, invest: 0, goals: 0, guilt: 0 };

  savingsTransfers.forEach(tx => {
    const cat = tx.custom_category || tx.original_category || '';
    const b = bucketOfDynamic(cat, categories);
    if (tx.amount < 0) {
      // Giro sends to pocket = saving
      bucketTotals[b] += Math.abs(tx.amount);
    } else {
      // Giro receives from pocket = withdrawal from savings = negative saving
      bucketTotals[b] -= tx.amount;
    }
  });

  Object.entries(catAmounts).forEach(([cat, net]) => {
    if (incomeCatNames.has(cat)) {
      if (net > 0) income += net;
    } else {
      // Expense category: net within period (refunds reduce spend); only count net outflow
      if (net < 0) {
        const b = bucketOfDynamic(cat, categories);
        bucketTotals[b] = (bucketTotals[b] || 0) + Math.abs(net);
      }
    }
  });

  return { income, buckets: bucketTotals };
}

// ── Giro hero (income + 4 buckets) ───────────────────────────────────────────
function GiroHero({ txns, lang, period, onPeriodChange, monthOffset, onMonthOffsetChange, categories, activeBucket, onBucketClick, targets, monthlyIncome, onSettingsOpen, showShared, onToggleShared, bucketColors }) {
  const today = new Date();
  let from, to, label;
  if (period === 'month') {
    from = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
    to   = new Date(today.getFullYear(), today.getMonth() - monthOffset + 1, 1);
    label = from.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { month: 'long', year: 'numeric' });
  } else {
    from = new Date(today.getFullYear() - monthOffset, 0, 1);
    to   = new Date(today.getFullYear() - monthOffset + 1, 0, 1);
    label = String(from.getFullYear());
  }

  const { income, buckets } = bucketsForRange(txns, from, to, categories);

  const prevFrom = period === 'month'
    ? new Date(today.getFullYear(), today.getMonth() - monthOffset - 1, 1)
    : new Date(today.getFullYear() - monthOffset - 1, 0, 1);
  const prev = bucketsForRange(txns, prevFrom, from, categories);
  const deltas = {};
  ['fix', 'invest', 'goals', 'guilt'].forEach(k => {
    const a = prev.buckets[k], b = buckets[k];
    deltas[k] = a > 0 ? ((b - a) / a) * 100 : 0;
  });

  const totalSpend = buckets.fix + buckets.invest + buckets.goals + buckets.guilt;
  // Use configured monthly income as the budget baseline when set — actual income
  // transactions arrive at month-end and would show €0 for most of the month.
  const budgetBase = (monthlyIncome || 0) > 0 ? monthlyIncome : income;
  const remaining = Math.max(0, budgetBase - totalSpend);
  const order = ['fix', 'invest', 'goals', 'guilt'];
  const canForward = monthOffset > 0;

  return (
    <section className="tile rise">
      {/* Navigation header */}
      <div className="giro-income">
        <div style={{ minWidth: 0 }}>
          <div className="row gap-1">
            <button className="icon-btn" style={{ width: 26, height: 26 }}
              onClick={() => onMonthOffsetChange(monthOffset + 1)} aria-label="prev">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span className="mono" style={{ fontSize: 11.5, minWidth: 110, textAlign: 'center' }}>{label}</span>
            <button className="icon-btn" style={{ width: 26, height: 26, opacity: canForward ? 1 : 0.3 }}
              disabled={!canForward} onClick={() => onMonthOffsetChange(Math.max(0, monthOffset - 1))} aria-label="next">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div className="seg">
            <button className={period === 'month' ? 'on' : ''} onClick={() => { onPeriodChange('month'); onMonthOffsetChange(0); }}>
              {lang === 'de' ? 'Monat' : 'Month'}
            </button>
            <button className={period === 'year' ? 'on' : ''} onClick={() => { onPeriodChange('year'); onMonthOffsetChange(0); }}>
              {lang === 'de' ? 'Jahr' : 'Year'}
            </button>
          </div>
          <div className="row gap-1">
            {onToggleShared && (
              <button
                onClick={onToggleShared}
                style={{
                  fontSize: 10.5, padding: '3px 8px', borderRadius: 8,
                  background: showShared ? 'var(--accent-soft)' : 'var(--bg-sunken)',
                  color: showShared ? 'var(--accent-ink)' : 'var(--ink-muted)',
                  border: `1px solid ${showShared ? 'var(--accent)' : 'var(--line)'}`,
                  cursor: 'pointer', font: 'inherit',
                }}
              >
                {lang === 'de' ? 'Gemeinsam' : 'Shared'}
              </button>
            )}
            {onSettingsOpen && (
              <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={onSettingsOpen} title={lang === 'de' ? 'Einstellungen' : 'Settings'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Einkommen & Ausgaben headline */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', marginBottom: 3, letterSpacing: '0.05em' }}>
            {(monthlyIncome || 0) > 0 ? 'BUDGET' : (lang === 'de' ? 'EINKOMMEN' : 'INCOME')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--pos)', fontVariantNumeric: 'tabular-nums' }}>
            <span className="pv">{eur(budgetBase)}</span>
          </div>
          {(monthlyIncome || 0) > 0 && income > 0 && (
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>
              {eur(income)} {lang === 'de' ? 'erhalten' : 'received'}
            </div>
          )}
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', marginBottom: 3, letterSpacing: '0.05em' }}>
            {lang === 'de' ? 'AUSGABEN' : 'SPENDING'}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            <span className="pv">{eur(totalSpend)}</span>
          </div>
        </div>
      </div>

      {/* Stacked bar — based on totalSpend so segments sum to 100% */}
      <div className="giro-bar">
        {order.map(k => {
          const v = buckets[k];
          const pct = totalSpend > 0 ? (v / totalSpend) * 100 : 0;
          if (pct < 1) return null;
          return (
            <div key={k} style={{ flex: pct, background: bucketColors?.[k] || BUCKETS[k].color }}
              title={`${BUCKETS[k][lang === 'de' ? 'de' : 'en']} · ${pct.toFixed(0)}%`} />
          );
        })}
      </div>
      {/* Percentage labels below bar */}
      <div style={{ display: 'flex', marginTop: 5 }}>
        {order.map(k => {
          const v = buckets[k];
          const pct = totalSpend > 0 ? (v / totalSpend) * 100 : 0;
          if (pct < 5) return null;
          return (
            <div key={k} style={{
              flex: pct, fontSize: 9.5, fontFamily: 'var(--font-mono)',
              color: bucketColors?.[k] || BUCKETS[k].color,
              textAlign: 'center', lineHeight: 1,
            }}>
              {pct.toFixed(0)}%
            </div>
          );
        })}
      </div>

      {activeBucket && (
        <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2, textAlign: 'center' }}>
          {lang === 'de' ? 'Klick auf gleiche Karte zum Aufheben' : 'Click same card to clear filter'}
        </div>
      )}

      {/* 2×2 bucket cards */}
      <div className="giro-grid">
        {order.map(k => {
          const v = buckets[k];
          const pctOfSpend = totalSpend > 0 ? (v / totalSpend) * 100 : 0;
          const target = (targets && targets[k] != null) ? targets[k] : BUCKETS[k].target;
          const meta = BUCKETS[k];
          const delta = deltas[k];
          const hasIncome = (monthlyIncome || 0) > 0;
          const targetEur = hasIncome ? monthlyIncome * target / 100 : null;
          const overTarget = hasIncome ? v > targetEur : pctOfSpend > target;
          const progPct = hasIncome
            ? Math.min(100, targetEur > 0 ? (v / targetEur) * 100 : 0)
            : Math.min(100, target > 0 ? (pctOfSpend / target) * 100 : 0);
          const isActive = activeBucket === k;
          const dimmed = activeBucket && !isActive;
          return (
            <div
              key={k}
              className="bucket-card"
              onClick={() => onBucketClick(k)}
              style={{
                cursor: 'pointer',
                opacity: dimmed ? 0.4 : 1,
                outline: isActive ? `2px solid ${bucketColors?.[k] || meta.color}` : 'none',
                outlineOffset: 2,
                transition: 'opacity 0.15s',
              }}
            >
              <div className="bucket-head">
                <span className="bucket-dot" style={{ background: bucketColors?.[k] || meta.color }} />
                <span className="bucket-name">{lang === 'de' ? meta.de : meta.en}</span>
              </div>
              <div className="bucket-hint">{lang === 'de' ? meta.en : meta.de}</div>
              <div className="bucket-amount">
                <span className="pv">{eur(v)}</span>
                {targetEur != null && (
                  <span className="faint" style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>/ {eur(targetEur)}</span>
                )}
              </div>
              <div className="bucket-meta">
                {hasIncome ? (
                  <span style={{ color: overTarget ? 'var(--neg)' : 'inherit' }}>
                    {pctOfSpend.toFixed(0)}%<span className="faint"> / {target}%</span>
                  </span>
                ) : (
                  <span>{pctOfSpend.toFixed(0)}%<span className="faint"> / {target}%</span></span>
                )}
                <span className={`delta ${delta < 0 ? 'pos' : 'neg'}`}>
                  {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
                </span>
              </div>
              <div className="bucket-prog">
                <i style={{ width: `${progPct}%`, background: bucketColors?.[k] || meta.color, opacity: overTarget ? 1 : 0.65 }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Spending trend (stacked bar SVG) ─────────────────────────────────────────
function BucketTrend({ txns, lang, period, categories, bucketColors, selectedOffset, onSelectedOffsetChange }) {
  const today = new Date();
  const order = ['fix', 'invest', 'goals', 'guilt'];
  const ref = useRef(null);
  const [w, setW] = useState(320);
  const [hoverIdx, setHoverIdx] = useState(null);
  const setSelectedOffset = onSelectedOffsetChange;
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // Window of 6 periods: up to 2 after selected, selected, rest before
  const afterCount = Math.min(2, selectedOffset);
  const beforeCount = 5 - afterCount;
  const windowStartOffset = selectedOffset + beforeCount; // oldest (highest offset)
  const windowEndOffset = selectedOffset - afterCount;    // most recent (lowest offset)

  const periods = (() => {
    const arr = [];
    for (let off = windowStartOffset; off >= windowEndOffset; off--) {
      let from, to, lbl;
      if (period === 'month') {
        from = new Date(today.getFullYear(), today.getMonth() - off, 1);
        to   = new Date(today.getFullYear(), today.getMonth() - off + 1, 1);
        lbl  = from.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { month: 'short', year: '2-digit' });
      } else {
        from = new Date(today.getFullYear() - off, 0, 1);
        to   = new Date(today.getFullYear() - off + 1, 0, 1);
        lbl  = String(from.getFullYear());
      }
      arr.push({ ...bucketsForRange(txns, from, to, categories), label: lbl, isSelected: off === selectedOffset });
    }
    return arr;
  })();

  const max = Math.max(1, ...periods.map(p => Math.max(
    p.income,
    p.buckets.fix + p.buckets.invest + p.buckets.goals + p.buckets.guilt
  )));
  const padL = 40, padR = 8, padT = 8, padB = 22;
  const innerW = Math.max(40, w - padL - padR);
  const innerH = 110;
  const groupW = innerW / periods.length;
  const barW = Math.min(20, groupW * 0.28);
  const gap = 3;

  const yTicks = [0, max / 2, max];

  const hovP = hoverIdx != null ? periods[hoverIdx] : null;
  const hovTotal = hovP ? (hovP.buckets.fix + hovP.buckets.invest + hovP.buckets.goals + hovP.buckets.guilt) : 0;

  // Label for the selected period shown in the header
  const selLabel = (() => {
    if (period === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth() - selectedOffset, 1);
      return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { month: 'short', year: 'numeric' });
    }
    return String(today.getFullYear() - selectedOffset);
  })();

  return (
    <section className="tile rise" style={{ animationDelay: '60ms', position: 'relative' }}>
      <div className="section-label" style={{ margin: '0 0 6px' }}>
        <span>{lang === 'de' ? 'AUSGABEN-TREND' : 'SPENDING TREND'}</span>
        <div className="row gap-1" style={{ alignItems: 'center' }}>
          <button className="icon-btn" style={{ width: 26, height: 26 }}
            onClick={() => setSelectedOffset(o => o + 1)} aria-label="previous period">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="faint" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', minWidth: 72, textAlign: 'center' }}>{selLabel}</span>
          <button className="icon-btn" style={{ width: 26, height: 26, opacity: selectedOffset === 0 ? 0.3 : 1 }}
            disabled={selectedOffset === 0}
            onClick={() => setSelectedOffset(o => Math.max(0, o - 1))} aria-label="next period">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}
        onMouseLeave={() => setHoverIdx(null)}>
        <svg width={w} height={innerH + padT + padB} style={{ display: 'block' }}
          onMouseMove={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left - padL;
            if (x < 0 || x > innerW) { setHoverIdx(null); return; }
            setHoverIdx(Math.floor(x / groupW));
          }}
        >
          {/* Y-axis ticks */}
          {yTicks.map((v, i) => {
            const y = padT + (1 - v / max) * innerH;
            return (
              <g key={i}>
                <line x1={padL} x2={padL + innerW} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '2 4'} />
                <text x={padL - 4} y={y + 4} fontSize="9" fill="var(--ink-faint)" textAnchor="end" fontFamily="var(--font-mono)" className="pv">
                  {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
                </text>
              </g>
            );
          })}
          {periods.map((p, i) => {
            const cx = padL + i * groupW + groupW / 2;
            let yCursor = padT + innerH;
            const isHover = i === hoverIdx;
            const isSel = p.isSelected;
            const expX = cx - gap / 2 - barW;
            const incH = p.income > 0 ? (p.income / max) * innerH : 0;
            const barOpacity = isSel ? 1 : isHover ? 1 : 0.55;
            return (
              <g key={i}>
                {(isHover || isSel) && (
                  <rect x={padL + i * groupW} y={padT} width={groupW} height={innerH}
                    fill="var(--bg-sunken)" opacity={isSel ? 0.7 : 0.5} />
                )}
                {order.map(k => {
                  const v = p.buckets[k];
                  const h = (v / max) * innerH;
                  yCursor -= h;
                  return (
                    <rect key={k} x={expX} y={yCursor} width={barW} height={h}
                      fill={bucketColors?.[k] || BUCKETS[k].color} opacity={barOpacity} rx="2" />
                  );
                })}
                {incH > 0 && (
                  <rect x={cx + gap / 2} y={padT + innerH - incH} width={barW} height={incH}
                    fill="var(--pos)" opacity={isSel ? 0.9 : isHover ? 0.9 : 0.55} rx="2" />
                )}
                <text x={cx} y={padT + innerH + 14} fontSize="10" textAnchor="middle"
                  fill={isSel ? 'var(--ink-muted)' : 'var(--ink-faint)'}
                  fontWeight={isSel ? 600 : 400} fontFamily="var(--font-mono)">
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
        {/* Hover tooltip */}
        {hovP && hoverIdx != null && (
          <div style={{
            position: 'absolute',
            top: padT,
            left: Math.min(w - 150, Math.max(0, padL + hoverIdx * groupW + groupW / 2 - 70)),
            pointerEvents: 'none',
            background: 'var(--bg-elev)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', padding: '6px 10px',
            boxShadow: 'var(--shadow-md)', fontSize: 11, zIndex: 10, minWidth: 120,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', marginBottom: 4 }}>{hovP.label}</div>
            {hovP.income > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid var(--line)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 1, background: 'var(--pos)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--ink-muted)' }}>{lang === 'de' ? 'Einnahmen' : 'Income'}</span>
                </span>
                <span className="pv" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: 'var(--pos)' }}>{eur2(hovP.income)}</span>
              </div>
            )}
            {order.map(k => {
              const v = hovP.buckets[k];
              const pct = hovTotal > 0 ? (v / hovTotal * 100).toFixed(0) : 0;
              return (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 1, background: bucketColors?.[k] || BUCKETS[k].color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--ink-muted)' }}>{lang === 'de' ? BUCKETS[k].de : BUCKETS[k].en}</span>
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                    <span className="pv">{eur2(v)}</span> <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="row gap-3" style={{ flexWrap: 'wrap', marginTop: 4 }}>
        <span className="row gap-1" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--pos)' }} />
          {lang === 'de' ? 'Einnahmen' : 'Income'}
        </span>
        {order.map(k => (
          <span key={k} className="row gap-1" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: bucketColors?.[k] || BUCKETS[k].color }} />
            {lang === 'de' ? BUCKETS[k].de : BUCKETS[k].en}
          </span>
        ))}
      </div>
    </section>
  );
}

// ── Account strip ─────────────────────────────────────────────────────────────
function AccountStrip({ accounts, lang }) {
  if (!accounts?.length) return null;
  return (
    <section className="rise" style={{ animationDelay: '80ms' }}>
      <div className="section-label" style={{ margin: '0 0 6px' }}>
        <span>{lang === 'de' ? 'KONTEN' : 'ACCOUNTS'} · {accounts.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {accounts.map(a => (
          <div key={a.id} className="tile" style={{ minWidth: 160, padding: 12, flexShrink: 0 }}>
            <div className="mono faint" style={{ fontSize: 10 }}>{a.bank} · {a.account_type}</div>
            <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{a.name}</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginTop: 6, fontVariantNumeric: 'tabular-nums', color: (a.balance || 0) >= 0 ? 'var(--ink)' : 'var(--neg)' }}>
              <span className="pv">{eur(a.balance)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Transaction feed ──────────────────────────────────────────────────────────
function TransactionFeed({ txns, categories, lang, onImport, onCategoryChange, activeBucket, fromDate, toDate, bucketColors }) {
  const [editingTx, setEditingTx] = useState(null);
  const [learnPrompt, setLearnPrompt] = useState(null);

  const inPeriod = txns.filter(tx => {
    const d = new Date(tx.date);
    return d >= fromDate && d < toDate;
  });

  let displayTxns;
  if (activeBucket) {
    displayTxns = inPeriod
      .filter(tx => {
        const cat = tx.custom_category || tx.original_category || 'Sonstiges';
        return bucketOfDynamic(cat, categories) === activeBucket;
      })
      .slice(0, 2000);
  } else {
    displayTxns = inPeriod.slice(0, 2000);
  }

  const byDate = {};
  displayTxns.forEach(tx => {
    if (!byDate[tx.date]) byDate[tx.date] = [];
    byDate[tx.date].push(tx);
  });

  const changeCategory = async (txId, newCat, counterparty, description) => {
    setEditingTx(null);
    await api.patch(`/api/banking/transactions/${txId}`, { custom_category: newCat });
    const label = counterparty || description;
    if (label) setLearnPrompt({ txId, label, newCat });
    onCategoryChange?.();
  };

  return (
    <section className="tile rise" style={{ animationDelay: '120ms' }}>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        <span>
          {lang === 'de' ? 'TRANSAKTIONEN' : 'TRANSACTIONS'}
          {activeBucket && (
            <span style={{ marginLeft: 6, fontSize: 10, color: bucketColors?.[activeBucket] || BUCKETS[activeBucket]?.color, fontWeight: 600 }}>
              · {lang === 'de' ? BUCKETS[activeBucket]?.de : BUCKETS[activeBucket]?.en} ({displayTxns.length})
            </span>
          )}
        </span>
        <button
          onClick={onImport}
          style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--accent)', fontSize: 12, fontWeight: 500, padding: '2px 6px', borderRadius: 6 }}
        >
          {lang === 'de' ? '↑ Importieren' : '↑ Import'}
        </button>
      </div>
      {displayTxns.length === 0 && (
        <div style={{ color: 'var(--ink-faint)', fontSize: 13, padding: '8px 0' }}>
          {lang === 'de' ? 'Keine Transaktionen' : 'No transactions'}
        </div>
      )}
      {Object.entries(byDate).map(([date, list]) => (
        <div key={date}>
          <div className="mono faint" style={{ fontSize: 10.5, padding: '6px 0 2px' }}>
            {fmtDateLong(date, lang)}
          </div>
          {list.map(tx => {
            const catName = tx.custom_category || tx.original_category || '—';
            const cat = categories?.find(c => c.name === catName);
            const bucketKey = tx.amount < 0 ? bucketOfDynamic(catName, categories) : null;
            const iconColor = (bucketKey && (bucketColors?.[bucketKey] || BUCKETS[bucketKey]?.color)) || cat?.color || 'var(--ink-faint)';
            const isEditing = editingTx === tx.id;
            return (
              <div key={tx.id} className="activity-row">
                <div className="activity-icon" style={{ background: iconColor + '22', color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CategoryIcon name={cat?.icon} size={14} color={iconColor} />
                </div>
                <div className="activity-text">
                  <div className="name">{tx.counterparty || tx.description || '—'}</div>
                  <div className="meta">
                    {isEditing ? (
                      <select
                        autoFocus
                        className="input"
                        style={{ fontSize: 11, padding: '2px 4px', height: 22, minWidth: 140 }}
                        defaultValue={catName}
                        onBlur={() => setEditingTx(null)}
                        onChange={e => changeCategory(tx.id, e.target.value, tx.counterparty, tx.description)}
                      >
                        {(categories || []).map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        onClick={() => setEditingTx(tx.id)}
                        title={lang === 'de' ? 'Klicken zum Ändern' : 'Click to change'}
                        style={{ cursor: 'pointer', borderBottom: '1px dashed var(--line)', paddingBottom: 1 }}
                      >
                        {catName}
                      </span>
                    )}
                    {!isEditing && tx.is_transfer ? ` · ${lang === 'de' ? 'Übertrag' : 'Transfer'}` : ''}
                  </div>
                </div>
                <div className="activity-amt" style={{ color: tx.amount > 0 ? 'var(--pos)' : 'var(--ink)' }}>
                  <span className="pv">{tx.amount > 0 ? '+' : ''}{eur2(tx.amount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {learnPrompt && (
        <div style={{ position: 'fixed', bottom: 72, left: 0, right: 0, zIndex: 100, padding: '0 12px' }}>
          <div style={{
            background: 'var(--bg-elev)', border: '1px solid var(--line)',
            borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
              {lang === 'de'
                ? `Soll diese Regel für alle Transaktionen von „${learnPrompt.label}" gespeichert werden?`
                : `Save a rule for all transactions from "${learnPrompt.label}"?`}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  const p = learnPrompt;
                  setLearnPrompt(null);
                  try {
                    await api.post('/api/banking/rules', {
                      keyword: p.label,
                      field: 'counterparty',
                      match_type: 'contains',
                      category: p.newCat,
                      priority: 10,
                    });
                    if (confirm(lang === 'de'
                      ? 'Auch bestehende Transaktionen dieses Empfängers aktualisieren?'
                      : 'Also update existing transactions from this counterparty?')) {
                      await api.post('/api/banking/rules/apply?overwrite=false', {});
                      onCategoryChange?.();
                    }
                  } catch (e) { alert(e.message); }
                }}
                style={{
                  flex: 1, padding: '9px', borderRadius: 10, border: 'none',
                  background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                  font: 'inherit', fontSize: 13, fontWeight: 500,
                }}
              >
                {lang === 'de' ? 'Ja, Regel speichern' : 'Save rule'}
              </button>
              <button
                onClick={() => setLearnPrompt(null)}
                style={{
                  padding: '9px 14px', borderRadius: 10, border: '1px solid var(--line)',
                  background: 'var(--bg-sunken)', cursor: 'pointer', font: 'inherit', fontSize: 13,
                }}
              >
                {lang === 'de' ? 'Nur diese Transaktion' : 'Just this one'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Bucket config (category → bucket assignment) ──────────────────────────────
function BucketConfig({ categories, lang, onRefresh, bucketColors, onSaveColor }) {
  const de = lang === 'de';
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(null);

  const expenseCats = (categories || []).filter(c => c.type !== 'income');
  const bucketOrder = ['fix', 'invest', 'goals', 'guilt'];
  const sorted = [...expenseCats].sort((a, b) => {
    const ai = bucketOrder.indexOf(a.bucket || 'guilt');
    const bi = bucketOrder.indexOf(b.bucket || 'guilt');
    return ai !== bi ? ai - bi : a.name.localeCompare(b.name);
  });

  const setBucket = async (catName, bucket) => {
    setSaving(catName);
    try {
      await api.patch(`/api/banking/categories/${encodeURIComponent(catName)}/bucket?bucket=${encodeURIComponent(bucket)}`);
      onRefresh?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="tile rise" style={{ animationDelay: '90ms' }}>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        <span>{de ? 'BUCKET-ZUORDNUNG' : 'BUCKET MAPPING'}</span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 8,
            border: '1px solid var(--line)', background: 'var(--bg-sunken)',
            cursor: 'pointer', font: 'inherit', color: 'var(--ink-muted)',
          }}
        >{open ? (de ? 'Schließen' : 'Close') : (de ? 'Bearbeiten' : 'Edit')}</button>
      </div>

      {/* Summary when closed */}
      {!open && (
        <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
          {bucketOrder.map(k => {
            const count = expenseCats.filter(c => (c.bucket || 'guilt') === k).length;
            return (
              <span key={k} className="row gap-1" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: bucketColors?.[k] || BUCKETS[k].color, flexShrink: 0 }} />
                {de ? BUCKETS[k].de : BUCKETS[k].en}: {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Edit list when open */}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.map(cat => {
            const currentBucket = cat.bucket || 'guilt';
            return (
              <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <span style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CategoryIcon name={cat.icon} size={15} color="var(--ink-muted)" /></span>
                <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cat.name}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: bucketColors?.[currentBucket] || BUCKETS[currentBucket].color, flexShrink: 0 }} />
                <select
                  className="input"
                  style={{ width: 130, fontSize: 12, padding: '4px 6px', flexShrink: 0 }}
                  value={currentBucket}
                  disabled={saving === cat.name}
                  onChange={e => setBucket(cat.name, e.target.value)}
                >
                  {bucketOrder.map(k => (
                    <option key={k} value={k}>{de ? BUCKETS[k].de : BUCKETS[k].en}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {/* Bucket color customization */}
      <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', marginBottom: 8 }}>
          {de ? 'BUCKET-FARBEN' : 'BUCKET COLORS'}
        </div>
        {['fix', 'invest', 'goals', 'guilt'].map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: bucketColors?.[k] || BUCKETS[k].color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, flex: 1 }}>{de ? BUCKETS[k].de : BUCKETS[k].en}</span>
            <input
              type="color"
              value={bucketColors?.[k] || BUCKETS[k].color}
              onChange={e => onSaveColor?.(k, e.target.value)}
              style={{ width: 32, height: 24, padding: 0, border: '1px solid var(--line)', borderRadius: 4, cursor: 'pointer', background: 'none' }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Auto-categorization rule editor ──────────────────────────────────────────
const EMPTY_RULE = { keyword: '', field: 'description', match_type: 'contains', category: '', priority: 0 };

function CatRuleEditor({ categories, lang }) {
  const de = lang === 'de';
  const [rules, setRules] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_RULE);
  const [editId, setEditId] = useState(null);
  const [applyMsg, setApplyMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadRules = () => api.get('/api/banking/rules').then(setRules).catch(() => {});
  useEffect(() => { loadRules(); }, []);

  const openCreate = () => { setEditId(null); setForm(EMPTY_RULE); setOpen(true); };
  const openEdit = r => { setEditId(r.id); setForm({ keyword: r.keyword, field: r.field, match_type: r.match_type, category: r.category, priority: r.priority }); setOpen(true); };
  const closeForm = () => { setOpen(false); setEditId(null); };

  const save = async () => {
    if (!form.keyword || !form.category) return;
    setSaving(true);
    try {
      if (editId != null) await api.put(`/api/banking/rules/${editId}`, form);
      else await api.post('/api/banking/rules', form);
      closeForm();
      loadRules();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const del = async id => {
    if (!confirm(de ? 'Regel löschen?' : 'Delete rule?')) return;
    await api.del(`/api/banking/rules/${id}`);
    loadRules();
  };

  const applyAll = async (overwrite) => {
    try {
      const r = await api.post(`/api/banking/rules/apply?overwrite=${overwrite}`);
      setApplyMsg(`${r.updated} ${de ? 'Transaktionen aktualisiert' : 'transactions updated'}`);
      setTimeout(() => setApplyMsg(null), 4000);
    } catch (e) { alert(e.message); }
  };

  const fieldOptions = [
    { v: 'description', l: de ? 'Beschreibung' : 'Description' },
    { v: 'counterparty', l: de ? 'Empfänger' : 'Counterparty' },
    { v: 'booking_type', l: de ? 'Buchungsart' : 'Booking type' },
  ];
  const matchOptions = [
    { v: 'contains', l: de ? 'enthält' : 'contains' },
    { v: 'startswith', l: de ? 'beginnt mit' : 'starts with' },
    { v: 'exact', l: de ? 'exakt' : 'exact' },
  ];
  const catOptions = (Array.isArray(categories) ? categories : []).map(c => c.name);

  return (
    <section className="tile rise" style={{ animationDelay: '60ms' }}>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        <span>{de ? 'AUTO-KATEGORISIERUNG' : 'AUTO-CATEGORIZE'}</span>
        <div className="row gap-1">
          <button
            onClick={() => applyAll(false)}
            style={{
              fontSize: 10.5, padding: '3px 8px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--bg-sunken)', border: '1px solid var(--line)',
              color: 'var(--ink-muted)', font: 'inherit',
            }}
          >{de ? 'Anwenden' : 'Apply'}</button>
          <button
            onClick={() => applyAll(true)}
            style={{
              fontSize: 10.5, padding: '3px 8px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--bg-sunken)', border: '1px solid var(--line)',
              color: 'var(--ink-muted)', font: 'inherit',
            }}
          >{de ? 'Alle überschreiben' : 'Overwrite all'}</button>
          <button
            className="pill pill-accent"
            style={{ border: 0, cursor: 'pointer', font: 'inherit' }}
            onClick={open && editId == null ? closeForm : openCreate}
          >
            {open && editId == null ? '✕' : '+ Regel'}
          </button>
        </div>
      </div>

      {applyMsg && (
        <div style={{ fontSize: 12, color: 'var(--pos)', background: 'var(--pos-soft)', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
          {applyMsg}
        </div>
      )}

      {open && (
        <div style={{ background: 'var(--bg-sunken)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>KEYWORD</div>
              <input className="input" type="text" placeholder={de ? 'Suchbegriff…' : 'Keyword…'} value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{de ? 'KATEGORIE' : 'CATEGORY'}</div>
              <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">{de ? 'Wählen…' : 'Select…'}</option>
                {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{de ? 'FELD' : 'FIELD'}</div>
              <select className="input" value={form.field} onChange={e => setForm(f => ({ ...f, field: e.target.value }))}>
                {fieldOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{de ? 'MATCH-TYP' : 'MATCH TYPE'}</div>
              <select className="input" value={form.match_type} onChange={e => setForm(f => ({ ...f, match_type: e.target.value }))}>
                {matchOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{de ? 'PRIO' : 'PRIO'}</div>
              <input className="input" type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={save}
              disabled={saving || !form.keyword || !form.category}
              style={{
                flex: 1, padding: '8px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: '#fff', cursor: 'pointer', font: 'inherit',
                fontSize: 13, opacity: (saving || !form.keyword || !form.category) ? 0.5 : 1,
              }}
            >{saving ? '…' : (de ? 'Speichern' : 'Save')}</button>
            <button onClick={closeForm} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-sunken)', cursor: 'pointer', font: 'inherit', fontSize: 13 }}>{de ? 'Abbrechen' : 'Cancel'}</button>
          </div>
        </div>
      )}

      {rules.length === 0 && !open && (
        <div style={{ color: 'var(--ink-faint)', fontSize: 13, padding: '4px 0' }}>
          {de ? 'Noch keine Regeln' : 'No rules yet'}
        </div>
      )}
      {rules.map(r => (
        <div key={r.id} className="activity-row" style={{ gridTemplateColumns: 'auto 1fr auto auto', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', minWidth: 36 }}>P{r.priority}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>"{r.keyword}"</div>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{r.field} · {r.match_type} → <b>{r.category}</b></div>
          </div>
          <button onClick={() => openEdit(r)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-sunken)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={() => del(r.id)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-sunken)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neg)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      ))}
    </section>
  );
}

// ── Own accounts editor ───────────────────────────────────────────────────────
function OwnAccountsEditor({ lang }) {
  const de = lang === 'de';
  const [accounts, setAccounts] = useState([]);
  const [iban, setIban] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');

  const load = () => api.get('/api/banking/own-accounts').then(setAccounts).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async () => {
    const trimmed = iban.trim();
    if (!trimmed) { setErr(de ? 'IBAN erforderlich' : 'IBAN required'); return; }
    try {
      await api.post('/api/banking/own-accounts', { iban: trimmed, label: label.trim() });
      setIban(''); setLabel(''); setErr('');
      load();
    } catch {
      setErr(de ? 'Fehler beim Speichern' : 'Save failed');
    }
  };

  const del = async (id) => {
    await api.del(`/api/banking/own-accounts/${id}`);
    load();
  };

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        {de ? 'Eigene Konten (Transfer-Erkennung)' : 'Own accounts (transfer detection)'}
      </h3>
      <p style={{ fontSize: 12, color: 'var(--c-text-2)', marginBottom: 12 }}>
        {de
          ? 'Transaktionen an diese IBANs werden automatisch als Überweisung markiert.'
          : 'Transactions to these IBANs are automatically marked as transfers.'}
      </p>
      {accounts.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 13, flex: 1 }}>{a.iban}</span>
          {a.label && <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{a.label}</span>}
          <button className="icon-btn" onClick={() => del(a.id)} title={de ? 'Löschen' : 'Delete'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          value={iban} onChange={e => setIban(e.target.value)}
          placeholder="DE00 1234 ..."
          style={{ flex: '2 1 160px', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-bg-2)', color: 'var(--c-text)' }}
        />
        <input
          value={label} onChange={e => setLabel(e.target.value)}
          placeholder={de ? 'Bezeichnung (optional)' : 'Label (optional)'}
          style={{ flex: '1 1 120px', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-bg-2)', color: 'var(--c-text)' }}
        />
        <button className="pill-btn" onClick={add}>{de ? 'Hinzufügen' : 'Add'}</button>
      </div>
      {err && <p style={{ color: 'var(--c-red)', fontSize: 12, marginTop: 6 }}>{err}</p>}
    </div>
  );
}


// ── Giro settings modal (bucket config + rule editor) ─────────────────────────
function GiroSettingsModal({ open, onClose, categories, lang, onRefresh, bucketColors, onSaveColor }) {
  return (
    <div className={`set-overlay ${open ? 'open' : ''}`} onClick={onClose}>
      <div className="set-sheet" onClick={e => e.stopPropagation()}>
        <div className="set-handle" />
        <div className="set-header">
          <h2>{lang === 'de' ? 'Giro-Einstellungen' : 'Bank settings'}</h2>
          <button className="icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div className="set-body">
          <BucketConfig categories={categories} lang={lang} onRefresh={onRefresh} bucketColors={bucketColors} onSaveColor={onSaveColor} />
          <CatRuleEditor categories={categories} lang={lang} />
          <OwnAccountsEditor lang={lang} />
        </div>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function GiroTab({
  lang,
  bankingAccounts,
  bankingTxns,
  bankingCategories,
  onBankingRefresh,
  onRefresh,
  currentUser,
  settings,
}) {
  const [period, setPeriod] = useState('month');
  const [monthOffset, setMonthOffset] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [activeBucket, setActiveBucket] = useState(null);
  const [giroSettingsOpen, setGiroSettingsOpen] = useState(false);
  const [showShared, setShowShared] = useState(false);

  const share = (settings?.shared_account_share ?? 50) / 100;
  const targets = {
    fix:    settings?.target_pct_fix    ?? BUCKETS.fix.target,
    invest: settings?.target_pct_invest ?? BUCKETS.invest.target,
    goals:  settings?.target_pct_goals  ?? BUCKETS.goals.target,
    guilt:  settings?.target_pct_guilt  ?? BUCKETS.guilt.target,
  };

  const bucketColors = {
    fix:    settings?.bucket_colors?.fix    || BUCKETS.fix.color,
    invest: settings?.bucket_colors?.invest || BUCKETS.invest.color,
    goals:  settings?.bucket_colors?.goals  || BUCKETS.goals.color,
    guilt:  settings?.bucket_colors?.guilt  || BUCKETS.guilt.color,
  };

  const saveBucketColor = async (bucket, color) => {
    const newColors = { ...(settings?.bucket_colors || {}), [bucket]: color };
    try {
      // GET current settings, merge bucket_colors, then POST full object
      const current = await api.get(`/api/settings?owner=${currentUser}`);
      await api.post(`/api/settings?owner=${currentUser}`, { ...current, bucket_colors: newColors });
      onRefresh?.();
    } catch (e) { alert(e.message); }
  };

  const categories = bankingCategories || [];

  const isGemeinsamUser = currentUser === 'Gemeinsam';

  const txns = (bankingTxns || []).map(tx => {
    if (tx.owner === 'Gemeinsam') {
      if (isGemeinsamUser) return tx;  // full 100% in Gemeinsam view
      return showShared ? { ...tx, amount: tx.amount * share } : null;
    }
    if (isGemeinsamUser) return null;  // Gemeinsam view: only shared-account txns
    if (tx.owner && tx.owner !== currentUser) return null;
    return tx;
  }).filter(Boolean);

  const accounts = (() => {
    if (isGemeinsamUser) return (bankingAccounts || []).filter(a => a.owner === 'Gemeinsam');
    const personal = (bankingAccounts || []).filter(a => !a.owner || a.owner === currentUser);
    if (!showShared) return personal;
    return [...personal, ...(bankingAccounts || []).filter(a => a.owner === 'Gemeinsam')];
  })();

  const today = new Date();
  const fromDate = period === 'month'
    ? new Date(today.getFullYear(), today.getMonth() - monthOffset, 1)
    : new Date(today.getFullYear() - monthOffset, 0, 1);
  const toDate = period === 'month'
    ? new Date(today.getFullYear(), today.getMonth() - monthOffset + 1, 1)
    : new Date(today.getFullYear() - monthOffset + 1, 0, 1);

  const handleBucketClick = key => setActiveBucket(prev => prev === key ? null : key);

  const hasSharedAccounts = (bankingAccounts || []).some(a => a.owner === 'Gemeinsam');

  if (!bankingTxns) return <Spinner />;

  return (
    <>
      <GiroHero
        txns={txns}
        lang={lang}
        period={period}
        onPeriodChange={p => { setPeriod(p); setMonthOffset(0); }}
        monthOffset={monthOffset}
        onMonthOffsetChange={setMonthOffset}
        categories={categories}
        activeBucket={activeBucket}
        onBucketClick={handleBucketClick}
        targets={targets}
        monthlyIncome={settings?.monthly_income ?? 0}
        onSettingsOpen={() => setGiroSettingsOpen(true)}
        showShared={showShared}
        onToggleShared={hasSharedAccounts && !isGemeinsamUser ? () => setShowShared(v => !v) : null}
        bucketColors={bucketColors}
      />
      <BucketTrend txns={txns} lang={lang} period={period} categories={categories} bucketColors={bucketColors} selectedOffset={monthOffset} onSelectedOffsetChange={setMonthOffset} />
      <AccountStrip accounts={accounts} lang={lang} />
      <TransactionFeed
        txns={txns}
        categories={categories}
        lang={lang}
        onImport={() => setImportOpen(true)}
        onCategoryChange={() => onBankingRefresh?.()}
        activeBucket={activeBucket}
        fromDate={fromDate}
        toDate={toDate}
        bucketColors={bucketColors}
      />
      <ImportGiroSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        currentUser={currentUser}
        lang={lang}
        onImported={() => { onBankingRefresh?.(); setImportOpen(false); }}
      />
      <GiroSettingsModal
        open={giroSettingsOpen}
        onClose={() => setGiroSettingsOpen(false)}
        categories={bankingCategories}
        lang={lang}
        onRefresh={onBankingRefresh}
        bucketColors={bucketColors}
        onSaveColor={saveBucketColor}
      />
    </>
  );
}
