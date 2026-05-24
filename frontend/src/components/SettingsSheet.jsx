import { useState, useEffect } from 'react';
import { ACCENT_OPTIONS } from '../constants.js';
import { eur } from '../utils.js';
import { targetDateToMonths, monthsToTargetDate } from '../calculations.js';
import { api, ownerUrl } from '../api.js';

const ICN = {
  globe:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>,
  moon:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>,
  sun:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M18.66 5.34l1.41-1.41"/></svg>,
  monitor: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  layout:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg>,
  palette: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/><circle cx="10" cy="14" r="1.5" fill="currentColor"/><circle cx="14" cy="14" r="1.5" fill="currentColor"/></svg>,
  chart:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17 L9 11 L13 14 L21 6"/></svg>,
  sync:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>,
  target:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>,
  chevron: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>,
};

function Group({ label, children }) {
  return (
    <div className="set-group">
      <div className="set-group-label">{label}</div>
      <div className="set-group-body">{children}</div>
    </div>
  );
}

function Row({ icon, label, sublabel, value, onClick, last, danger }) {
  return (
    <button type="button" className={`set-row ${last ? 'last' : ''} ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span className="set-row-ic">{icon}</span>
      <span className="set-row-main">
        <span className="set-row-lab">{label}</span>
        {sublabel && <span className="set-row-sub">{sublabel}</span>}
      </span>
      <span className="set-row-val">
        {value && <span className="set-row-val-txt">{value}</span>}
        {ICN.chevron}
      </span>
    </button>
  );
}

// ── Slider row ────────────────────────────────────────────────────────────────
function SliderRow({ label, value, min, max, step, format, onChange, disabled }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', opacity: disabled ? 0.4 : 1 }}
      />
    </div>
  );
}

// ── Projektion settings section ───────────────────────────────────────────────
const DEFAULT_PHASE = { name: '', duration_months: 12, monthly_savings: 500 };

function ProjektionSettings({ settings, currentUser, lang, onSaved, isGemeinsam }) {
  const [s, setS] = useState(null);
  const [phases, setPhases] = useState([]);
  const [saving, setSaving] = useState(false);
  const de = lang === 'de';

  useEffect(() => {
    if (!settings) return;
    const copy = { ...settings };
    if (!copy.target_date && copy.ref_month && copy.totalMo) {
      copy.target_date = monthsToTargetDate(copy.totalMo, copy.ref_month);
    }
    if (copy.rate_ph3 == null) copy.rate_ph3 = 2.5;
    setS(copy);
    const loaded = Array.isArray(settings.phases) && settings.phases.length > 0
      ? settings.phases.map(p => ({ ...p }))
      : [{ phase_index: 0, name: '', duration_months: null, monthly_savings: 0 }];
    setPhases(loaded);
  }, [settings?.goal, settings?.totalMo, settings?.rate, settings?.phases]);

  if (!s) return <div style={{ padding: 14, color: 'var(--ink-faint)', fontSize: 13 }}>{de ? 'Keine Einstellungen geladen.' : 'No settings loaded.'}</div>;

  const set = (k, v) => setS(prev => ({ ...prev, [k]: v }));
  const setPhase = (i, field, value) => setPhases(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  const addPhase = () => {
    if (phases.length >= 4) return;
    setPhases(prev => {
      const next = prev.map((p, i) => i === prev.length - 1 ? { ...p, duration_months: 12 } : p);
      return [...next, { phase_index: next.length, name: '', duration_months: null, monthly_savings: 0 }];
    });
  };
  const removePhase = (i) => {
    if (phases.length <= 1) return;
    setPhases(prev => {
      const next = prev.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, phase_index: idx }));
      if (next.length > 0) next[next.length - 1] = { ...next[next.length - 1], duration_months: null };
      return next;
    });
  };

  const save = async () => {
    if (isGemeinsam) return;
    setSaving(true);
    try {
      await api.post(ownerUrl('/api/settings', currentUser), s);
      await api.post(ownerUrl('/api/phases', currentUser), phases);
      onSaved?.();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const inputStyle = { background: 'var(--bg-sunken)', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px', fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--font-mono)' };

  return (
    <div>
      {isGemeinsam && (
        <div style={{ padding: '10px 14px', background: 'var(--accent-soft)', borderRadius: 8, margin: '0 0 8px', fontSize: 12, color: 'var(--ink-muted)' }}>
          {de ? 'Im Gemeinsam-Modus nicht editierbar.' : 'Not editable in shared mode.'}
        </div>
      )}

      {/* Goal */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 13 }}>{de ? 'Zielkapital' : 'Target amount'}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>{eur(s.goal)}</span>
        </div>
        <input type="range" min={50000} max={500000} step={5000} value={s.goal || 100000}
          disabled={isGemeinsam}
          onChange={e => set('goal', parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)' }} />
      </div>

      {/* Target date */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13 }}>{de ? 'Zieldatum' : 'Target date'}</span>
        <input
          type="month"
          disabled={isGemeinsam}
          value={s.target_date || ''}
          onChange={e => {
            const td = e.target.value;
            const mo = targetDateToMonths(td, s.ref_month || '');
            setS(prev => ({ ...prev, target_date: td, totalMo: mo }));
          }}
          style={inputStyle}
        />
      </div>

      <SliderRow label={de ? 'ETF-Rendite p.a.' : 'ETF return p.a.'} value={s.rate ?? 6.5} min={2} max={12} step={0.5} format={v => `${v}%`} onChange={v => set('rate', v)} disabled={isGemeinsam} />
      <SliderRow label={de ? 'Geldmarkt/Cash-Rendite' : 'Cash rate p.a.'} value={s.rate_ph3 ?? 2.5} min={0.5} max={6} step={0.25} format={v => `${v}%`} onChange={v => set('rate_ph3', v)} disabled={isGemeinsam} />

      {/* Phases editor */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{de ? 'Sparphasen' : 'Savings phases'}</span>
          {!isGemeinsam && phases.length < 4 && (
            <button onClick={addPhase} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-sunken)', color: 'var(--ink)', cursor: 'pointer', font: 'inherit' }}>
              + {de ? 'Phase' : 'Phase'}
            </button>
          )}
        </div>
        {phases.map((ph, i) => {
          const isLast = i === phases.length - 1;
          return (
            <div key={i} style={{ borderRadius: 10, border: '1px solid var(--line)', padding: '10px 12px', marginBottom: 8, background: 'var(--bg-sunken)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-faint)', minWidth: 18 }}>{i + 1}.</span>
                <input
                  placeholder={de ? `Phase ${i + 1} Name` : `Phase ${i + 1} name`}
                  value={ph.name}
                  disabled={isGemeinsam}
                  onChange={e => setPhase(i, 'name', e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                {!isGemeinsam && phases.length > 1 && (
                  <button onClick={() => removePhase(i)} style={{ fontSize: 13, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'none', color: 'var(--neg)', cursor: 'pointer' }}>✕</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {!isLast ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 3 }}>{de ? 'Dauer (Monate)' : 'Duration (months)'}</div>
                    <input
                      type="number" min={1} max={240}
                      value={ph.duration_months ?? ''}
                      disabled={isGemeinsam}
                      onChange={e => setPhase(i, 'duration_months', parseInt(e.target.value) || 1)}
                      style={{ ...inputStyle, width: '100%' }}
                    />
                  </div>
                ) : (
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--ink-faint)', paddingTop: 16 }}>
                    {de ? '(Läuft bis Ziel)' : '(Runs to goal)'}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 3 }}>{de ? 'Sparrate / Mo' : 'Savings / mo'}</div>
                  <input
                    type="number" min={0} max={10000} step={50}
                    value={ph.monthly_savings}
                    disabled={isGemeinsam}
                    onChange={e => setPhase(i, 'monthly_savings', parseFloat(e.target.value) || 0)}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isGemeinsam && (
        <div style={{ padding: '12px 14px' }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              width: '100%', padding: '11px', borderRadius: 12, border: 'none',
              cursor: 'pointer', background: 'var(--accent)', color: '#fff',
              fontSize: 14, fontWeight: 500, font: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '…' : (de ? 'Einstellungen speichern' : 'Save settings')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Giro settings section ─────────────────────────────────────────────────────
const BUCKET_LABELS = {
  fix:    { de: 'Fixkosten-Ziel', en: 'Fixed costs target' },
  invest: { de: 'Investieren-Ziel', en: 'Investments target' },
  goals:  { de: 'Sparziele-Ziel', en: 'Savings goals target' },
  guilt:  { de: 'Guilt-free-Ziel', en: 'Guilt-free target' },
};

function GiroSettings({ settings, currentUser, lang, onSaved, isGemeinsam }) {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const de = lang === 'de';

  useEffect(() => {
    if (!settings) return;
    setS({
      target_pct_fix:    settings.target_pct_fix    ?? 50,
      target_pct_invest: settings.target_pct_invest ?? 20,
      target_pct_goals:  settings.target_pct_goals  ?? 10,
      target_pct_guilt:  settings.target_pct_guilt  ?? 20,
      shared_account_share: settings.shared_account_share ?? 50,
    });
  }, [settings]);

  if (!s) return null;

  const set = (k, v) => setS(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.post(ownerUrl('/api/settings', currentUser), { ...settings, ...s });
      onSaved?.();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {['fix', 'invest', 'goals', 'guilt'].map(k => (
        <SliderRow
          key={k}
          label={de ? BUCKET_LABELS[k].de : BUCKET_LABELS[k].en}
          value={s[`target_pct_${k}`]}
          min={0} max={80} step={5}
          format={v => `${v}%`}
          onChange={v => set(`target_pct_${k}`, v)}
          disabled={isGemeinsam}
        />
      ))}
      <SliderRow
        label={de ? 'Gemeinsam-Anteil' : 'Shared account share'}
        value={s.shared_account_share}
        min={0} max={100} step={5}
        format={v => `${v}%`}
        onChange={v => set('shared_account_share', v)}
        disabled={isGemeinsam}
      />
      {!isGemeinsam && (
        <div style={{ padding: '12px 14px' }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              width: '100%', padding: '11px', borderRadius: 12, border: 'none',
              cursor: 'pointer', background: 'var(--accent)', color: '#fff',
              fontSize: 14, fontWeight: 500, font: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '…' : (de ? 'Speichern' : 'Save')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Password settings ─────────────────────────────────────────────────────────
function PasswordSettings({ currentUser, settings, lang }) {
  const [pw, setPw]           = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null); // { text, ok }
  const de = lang === 'de';

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1.5px solid var(--line)', background: 'var(--bg-sunken)',
    color: 'var(--ink)', font: 'inherit', fontSize: 14, boxSizing: 'border-box',
  };

  const save = async () => {
    if (pw !== confirm) {
      setMsg({ text: de ? 'Passwörter stimmen nicht überein' : 'Passwords do not match', ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.post(ownerUrl('/api/settings', currentUser), { ...settings, password: pw });
      if (pw) {
        localStorage.setItem(`auth_${currentUser}`, '1');
      } else {
        localStorage.removeItem(`auth_${currentUser}`);
      }
      setPw(''); setConfirm('');
      setMsg({ text: de ? 'Gespeichert' : 'Saved', ok: true });
    } catch (e) {
      setMsg({ text: e.message, ok: false });
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 10 }}>
          {de ? 'Leer lassen, um das Passwort zu entfernen.' : 'Leave blank to remove password.'}
        </div>
        <input type="password" style={inputStyle} placeholder={de ? 'Neues Passwort' : 'New password'}
          value={pw} onChange={e => { setPw(e.target.value); setMsg(null); }} />
        <input type="password" style={{ ...inputStyle, marginTop: 8 }} placeholder={de ? 'Bestätigen' : 'Confirm'}
          value={confirm} onChange={e => { setConfirm(e.target.value); setMsg(null); }} />
        {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? 'var(--pos)' : 'var(--neg)' }}>{msg.text}</div>}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <button onClick={save} disabled={saving} style={{
          width: '100%', padding: 11, borderRadius: 12, border: 'none',
          background: 'var(--accent)', color: '#fff', font: 'inherit',
          fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? '…' : (de ? 'Passwort speichern' : 'Save password')}
        </button>
      </div>
    </div>
  );
}

// ── Main sheet ────────────────────────────────────────────────────────────────
export default function SettingsSheet({
  open, onClose,
  currentUser,
  lang, onLangToggle,
  theme, onThemeCycle,
  density, onDensityChange,
  accent, onAccentChange,
  chartStyle, onChartStyleToggle,
  auroraIntensity, onAuroraIntensityChange,
  settings, onSettingsSaved,
  syncing, lastSync, onSyncPrices,
  appVersion,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const de = lang === 'de';
  const isGemeinsam = currentUser === 'Gemeinsam';

  const themeLabel = theme === 'dark' ? (de ? 'Dunkel' : 'Dark')
    : theme === 'system' ? (de ? 'System' : 'System')
    : (de ? 'Hell' : 'Light');
  const themeIcon = theme === 'dark' ? ICN.moon : theme === 'system' ? ICN.monitor : ICN.sun;

  const densityLabel = density === 'compact' ? (de ? 'Kompakt' : 'Compact')
    : density === 'cozy' ? (de ? 'Gemütlich' : 'Cozy')
    : (de ? 'Normal' : 'Regular');

  const syncLabel = lastSync
    ? new Date(lastSync).toLocaleString(de ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : (de ? 'Noch kein Sync' : 'Never synced');

  return (
    <div className={`set-overlay ${open ? 'open' : ''}`} onClick={onClose}>
      <div className="set-sheet" onClick={e => e.stopPropagation()}>
        <div className="set-handle" />
        <div className="set-header">
          <h2>{de ? 'Einstellungen' : 'Settings'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>

        <div className="set-body">

          {/* ── Darstellung ── */}
          <Group label={de ? 'Darstellung' : 'Appearance'}>
            <Row
              icon={ICN.globe}
              label={de ? 'Sprache' : 'Language'}
              value={de ? 'Deutsch' : 'English'}
              onClick={onLangToggle}
            />
            <Row
              icon={themeIcon}
              label={de ? 'Erscheinungsbild' : 'Theme'}
              sublabel={de ? 'Hell / Dunkel / System' : 'Light / Dark / System'}
              value={themeLabel}
              onClick={onThemeCycle}
            />
            <Row
              icon={ICN.layout}
              label={de ? 'Dichte' : 'Density'}
              value={densityLabel}
              onClick={() => {
                const next = density === 'regular' ? 'compact' : density === 'compact' ? 'cozy' : 'regular';
                onDensityChange(next);
              }}
            />
            <Row
              icon={ICN.chart}
              label={de ? 'Diagramm-Stil' : 'Chart style'}
              value={chartStyle === 'soft' ? (de ? 'Weich' : 'Soft') : (de ? 'Scharf' : 'Sharp')}
              onClick={onChartStyleToggle}
            />
            <SliderRow
              label={de ? 'Hintergrund-Intensität' : 'Background intensity'}
              value={auroraIntensity ?? 20}
              min={0}
              max={100}
              step={5}
              format={v => `${Math.round(v)}%`}
              onChange={onAuroraIntensityChange}
            />
            {auroraIntensity !== 20 && (
              <div style={{ padding: '4px 14px 10px', textAlign: 'right' }}>
                <button
                  onClick={() => onAuroraIntensityChange(20)}
                  style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {de ? 'Zurücksetzen' : 'Reset to default'}
                </button>
              </div>
            )}
            {/* Accent swatches */}
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{de ? 'Akzentfarbe' : 'Accent color'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ACCENT_OPTIONS.map(opt => (
                  <button
                    key={opt.accent}
                    onClick={() => onAccentChange(opt)}
                    title={opt.label}
                    style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: opt.accent,
                      border: `2.5px solid ${accent === opt.accent ? 'var(--ink)' : 'transparent'}`,
                      cursor: 'pointer', outline: 'none',
                      boxShadow: accent === opt.accent ? `0 0 0 3px var(--bg-elev), 0 0 0 5px ${opt.accent}` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>
          </Group>

          {/* ── Projektion ── */}
          <Group label={de ? 'Projektion & Phasenmodell' : 'Projection & phase model'}>
            <ProjektionSettings
              settings={settings}
              currentUser={currentUser}
              lang={lang}
              onSaved={onSettingsSaved}
              isGemeinsam={isGemeinsam}
            />
          </Group>

          {/* ── Giro & Haushalt ── */}
          <Group label={de ? 'Giro & Haushalt' : 'Giro & Household'}>
            <GiroSettings
              settings={settings}
              currentUser={currentUser}
              lang={lang}
              onSaved={onSettingsSaved}
              isGemeinsam={isGemeinsam}
            />
          </Group>

          {/* ── Kursdaten ── */}
          <Group label={de ? 'Kursdaten' : 'Price data'}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13 }}>{de ? 'Letzter Sync' : 'Last sync'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{syncLabel}</div>
              </div>
              <button
                onClick={onSyncPrices}
                disabled={syncing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 10,
                  background: syncing ? 'var(--bg-sunken)' : 'var(--accent)',
                  border: 'none', cursor: syncing ? 'default' : 'pointer',
                  color: syncing ? 'var(--ink-faint)' : '#fff',
                  fontSize: 12, fontWeight: 500, font: 'inherit',
                }}
              >
                {syncing
                  ? <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</span>
                  : ICN.sync
                }
                <span>{syncing ? (de ? 'Läuft…' : 'Running…') : (de ? 'Synchronisieren' : 'Sync now')}</span>
              </button>
            </div>
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--ink-faint)' }}>
              {de ? 'Automatischer täglicher Sync um 20:00 Uhr.' : 'Automatic daily sync at 20:00.'}
            </div>
          </Group>

          {/* ── Zugriffsschutz ── */}
          {!isGemeinsam && (
            <Group label={de ? 'Zugriffsschutz' : 'Access protection'}>
              <PasswordSettings
                currentUser={currentUser}
                settings={settings}
                lang={lang}
              />
            </Group>
          )}

          <div className="set-footer">Finanzen · v{appVersion ?? '…'} · Made with ♥</div>
        </div>
      </div>
    </div>
  );
}
