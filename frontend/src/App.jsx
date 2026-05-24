import { useState, useEffect, useCallback } from 'react';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Spinner from './components/Spinner.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import { L, ACCENT_OPTIONS } from './constants.js';
import { api } from './api.js';
import UbersichtTab  from './tabs/UbersichtTab.jsx';
import PortfolioTab  from './tabs/PortfolioTab.jsx';
import GiroTab       from './tabs/GiroTab.jsx';
import ProjektionTab from './tabs/ProjektionTab.jsx';

// ── Nav icons ───────────────────────────────────────────────────────────────
const NAV_ICONS = {
  ubersicht: active => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
      <path d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" strokeLinejoin="round"/>
    </svg>
  ),
  portfolio: active => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="8" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.15 : 1}/>
      <path d="M12 4 A8 8 0 0 1 20 12 L 12 12 Z" fill={active ? 'currentColor' : 'none'}/>
    </svg>
  ),
  giro: active => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2" fillOpacity={active ? 0.18 : 0}/>
      <path d="M3 10h18M7 15h3" strokeLinecap="round"/>
    </svg>
  ),
  projektion: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17 L9 11 L13 14 L21 6"/>
      <path d="M15 6h6v6"/>
    </svg>
  ),
};

// ── Color helpers ────────────────────────────────────────────────────────────
function userColor(users, userId) {
  return users.find(u => u.id === userId)?.color ?? 'var(--accent)';
}

function userDotStyle(users, userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return { background: 'var(--accent)' };
  if (user.is_aggregate && user.member_ids?.length >= 2) {
    const c1 = userColor(users, user.member_ids[0]);
    const c2 = userColor(users, user.member_ids[1]);
    return { background: `linear-gradient(90deg, ${c1} 50%, ${c2} 50%)` };
  }
  return { background: user.color };
}

// ── Setup wizard ─────────────────────────────────────────────────────────────
const PALETTE = ['#4D78B8','#C2806A','#22c55e','#f97316','#8b5cf6','#ec4899','#14b8a6','#eab308'];

function SetupWizard({ lang, onDone }) {
  const de = lang === 'de';
  const [users, setUsers] = useState([{ name: '', color: PALETTE[0] }]);
  const [withAggregate, setWithAggregate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const addUser = () => {
    if (users.length >= 4) return;
    setUsers(prev => [...prev, { name: '', color: PALETTE[prev.length % PALETTE.length] }]);
  };

  const updateUser = (i, field, val) =>
    setUsers(prev => prev.map((u, idx) => idx === i ? { ...u, [field]: val } : u));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const named = users.filter(u => u.name.trim());
    if (!named.length) { setErr(de ? 'Mindestens ein Name benötigt.' : 'At least one name required.'); return; }
    setSubmitting(true);
    try {
      for (const u of named) {
        const id = u.name.trim();
        await api.post('/api/users', { id, display_name: id, color: u.color });
      }
      if (withAggregate && named.length >= 2) {
        const id = de ? 'Gemeinsam' : 'Together';
        await api.post('/api/users', {
          id, display_name: id, color: '#6366f1',
          is_aggregate: true, member_ids: named.map(u => u.name.trim()),
        });
      }
      onDone();
    } catch (ex) {
      setErr(ex.message);
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 28, padding: 24,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
          Finance Tracker
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontStyle: 'italic', color: 'var(--ink)' }}>
          {de ? 'Einrichten' : 'Setup'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-faint)', marginTop: 6 }}>
          {de ? 'Wer nutzt diesen Tracker?' : 'Who uses this tracker?'}
        </div>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 340 }}>
        {users.map((u, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="color" value={u.color}
              onChange={e => updateUser(i, 'color', e.target.value)}
              style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2 }}
            />
            <input
              value={u.name} onChange={e => updateUser(i, 'name', e.target.value)}
              placeholder={de ? `Person ${i + 1}` : `Person ${i + 1}`}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontFamily: 'var(--font-sans)', fontSize: 15, background: 'var(--bg)', color: 'var(--ink)' }}
            />
          </div>
        ))}
        {users.length < 4 && (
          <button type="button" onClick={addUser}
            style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 13 }}>
            + {de ? 'Person hinzufügen' : 'Add person'}
          </button>
        )}
        {users.filter(u => u.name.trim()).length >= 2 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-faint)', cursor: 'pointer' }}>
            <input type="checkbox" checked={withAggregate} onChange={e => setWithAggregate(e.target.checked)} />
            {de ? 'Kombinierte Ansicht erstellen' : 'Create combined view'}
          </label>
        )}
        {err && <div style={{ color: 'var(--neg)', fontSize: 13 }}>{err}</div>}
        <button type="submit" disabled={submitting}
          style={{ padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-serif)', fontSize: 16, fontStyle: 'italic', cursor: 'pointer' }}>
          {submitting ? '…' : (de ? 'Loslegen →' : 'Get started →')}
        </button>
      </form>
    </div>
  );
}

// ── Splash screen ───────────────────────────────────────────────────────────
function SplashScreen({ lang, users, onSelect }) {
  const de = lang === 'de';
  const regularUsers = users.filter(u => !u.is_aggregate);
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'var(--bg)', backdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 36, padding: 24,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
          Finance Tracker
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 34, fontStyle: 'italic', letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.1 }}>
          {de ? 'Wer bist du?' : 'Who are you?'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        {regularUsers.map(user => (
          <button
            key={user.id}
            onClick={() => onSelect(user.id)}
            style={{
              width: 116, height: 116, borderRadius: '50%',
              border: 'none', cursor: 'pointer',
              background: user.color,
              color: '#fff', fontFamily: 'var(--font-serif)', fontSize: 24,
              fontStyle: 'italic', letterSpacing: '-0.01em',
              boxShadow: 'var(--shadow-lg)',
              transition: 'transform 0.15s var(--ease)',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {user.display_name[0]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
        {de ? 'Gespeichert auf diesem Gerät' : 'Saved on this device'}
      </div>
    </div>
  );
}

// ── Password modal ──────────────────────────────────────────────────────────
function PwModal({ user, users = [], error, onSubmit, onDismiss }) {
  const [pw, setPw] = useState('');
  const dotBg = userColor(users, user);
  return (
    <div className="pw-overlay" onClick={onDismiss}>
      <div className="pw-dialog" onClick={e => e.stopPropagation()}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: dotBg, margin: '0 auto 14px', opacity: 0.9 }} />
        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, textAlign: 'center', color: 'var(--ink)' }}>{user}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>Passwort eingeben</p>
        <form onSubmit={e => { e.preventDefault(); onSubmit(pw); }}>
          <input className="pw-input" type="password" value={pw} autoFocus placeholder="••••••••"
            onChange={e => setPw(e.target.value)} />
          {error && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--neg)', textAlign: 'center' }}>{error}</p>}
          <button type="submit" className="pw-btn">Weiter →</button>
        </form>
      </div>
    </div>
  );
}

// ── User dot ─────────────────────────────────────────────────────────────────
function UserDot({ user, users = [], size = 14 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
      ...userDotStyle(users, user),
    }} />
  );
}

// ── Top bar ─────────────────────────────────────────────────────────────────
function TopBar({ title, currentUser, users = [], onUserSelect, onSettings, onSync, syncing, lang, privacyMode, onPrivacyToggle, switchableUsers = [] }) {
  return (
    <header className="topbar">
      <h1>{title}</h1>
      <div className="tb-right row gap-1">
        <div className="seg">
          {switchableUsers.map(u => (
            <button key={u} className={u === currentUser ? 'on' : ''}
              onClick={() => { if (u !== currentUser) onUserSelect(u); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserDot user={u} users={users} size={10} />
              {users.find(usr => usr.id === u)?.display_name ?? u}
            </button>
          ))}
        </div>
        <button
          className="icon-btn"
          onClick={onSync}
          title={lang === 'de' ? 'Kurse aktualisieren' : 'Refresh prices'}
          style={{ opacity: syncing ? 0.5 : 1 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            style={syncing ? { animation: 'spin 1s linear infinite' } : {}}>
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
        <button
          className="icon-btn"
          onClick={onPrivacyToggle}
          title={privacyMode ? (lang === 'de' ? 'Zahlen einblenden' : 'Show values') : (lang === 'de' ? 'Zahlen ausblenden' : 'Hide values')}
          style={{ opacity: privacyMode ? 1 : 0.45 }}
          aria-label={privacyMode ? 'Privacy on' : 'Privacy off'}
        >
          {privacyMode ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
        <button className="icon-btn" onClick={onSettings} aria-label="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
          </svg>
        </button>
      </div>
    </header>
  );
}

// ── Bottom nav ───────────────────────────────────────────────────────────────
function BottomNav({ active, onChange, lang }) {
  const t = L[lang];
  const items = [
    { id: 'ubersicht',  label: t.dashboard },
    { id: 'portfolio',  label: t.portfolio },
    { id: 'giro',       label: lang === 'de' ? 'Giro' : 'Bank' },
    { id: 'projektion', label: t.projection },
  ];
  return (
    <nav className="botnav">
      {items.map(it => {
        const on = active === it.id;
        return (
          <button key={it.id} className={`botnav-item ${on ? 'on' : ''}`} onClick={() => onChange(it.id)}>
            {NAV_ICONS[it.id](on)}
            <span>{it.label}</span>
            <span className="indicator" />
          </button>
        );
      })}
    </nav>
  );
}

// ── Mobile greeting header ───────────────────────────────────────────────────
function EHeader({ currentUser, users = [], lang, onCycleUser, onSettings, privacyMode, onPrivacyToggle }) {
  const user = users.find(u => u.id === currentUser);
  const displayName = user?.display_name ?? currentUser ?? '';
  const greet = lang === 'de'
    ? (user?.is_aggregate ? `${displayName}.` : `Servus, ${displayName}.`)
    : (user?.is_aggregate ? `${displayName}.` : `Hi, ${displayName}.`);
  const initial = displayName[0] ?? '?';
  const dotStyle = userDotStyle(users, currentUser);
  const avatarStyle = user?.is_aggregate
    ? dotStyle
    : { background: `linear-gradient(135deg, ${user?.color ?? 'var(--accent)'}, color-mix(in oklab, ${user?.color ?? 'var(--accent)'} 70%, #000))` };
  return (
    <header className="e-header">
      <div className="greet">{greet}</div>
      <div className="right">
        <button className="icon-btn" onClick={onPrivacyToggle}
          title={privacyMode ? (lang === 'de' ? 'Zahlen einblenden' : 'Show values') : (lang === 'de' ? 'Zahlen ausblenden' : 'Hide values')}
          style={{ opacity: privacyMode ? 1 : 0.45 }}
          aria-label={privacyMode ? 'Privacy on' : 'Privacy off'}>
          {privacyMode ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
        <button className="icon-btn" onClick={onSettings} aria-label="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
          </svg>
        </button>
        <button className="e-user" onClick={onCycleUser} title="Switch user" style={{ border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span className="e-avatar" style={avatarStyle}>{initial}</span>
        </button>
      </div>
    </header>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // Persisted preferences
  const [lang, setLang]       = useState(() => localStorage.getItem('lang') || 'de');
  const [theme, setTheme]     = useState(() => localStorage.getItem('theme') || 'light');
  const [density, setDensity] = useState(() => localStorage.getItem('density') || 'regular');
  const [accentKey, setAccentKey] = useState(() => localStorage.getItem('accent') || ACCENT_OPTIONS[0].accent);
  const [chartStyle, setChartStyle] = useState(() => localStorage.getItem('chartStyle') || 'soft');
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem('privacy') === 'true');
  const [auroraIntensity, setAuroraIntensity] = useState(() => {
    const v = localStorage.getItem('pref.auroraIntensity');
    return v !== null ? parseFloat(v) : 20;
  });

  const [users, setUsers] = useState([]);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [tab, setTab]             = useState(() => localStorage.getItem('tab') || 'ubersicht');
  const [baseUser, setBaseUser]   = useState(() => localStorage.getItem('baseUser'));
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('baseUser') || null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pwModal, setPwModal]     = useState(null); // { user, isInitial }
  const [pwError, setPwError]     = useState('');

  // ── Apply theme (supports dark / light / system) ──
  useEffect(() => {
    const apply = t => { document.documentElement.dataset.theme = t; };
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches ? 'dark' : 'light');
      const h = e => apply(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', h);
      return () => mq.removeEventListener('change', h);
    } else {
      apply(theme);
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem('density', density);
  }, [density]);

  useEffect(() => {
    const opt = ACCENT_OPTIONS.find(o => o.accent === accentKey) || ACCENT_OPTIONS[0];
    const root = document.documentElement;
    root.style.setProperty('--accent', opt.accent);
    root.style.setProperty('--accent-soft', opt.soft);
    root.style.setProperty('--accent-ink', opt.ink);
    localStorage.setItem('accent', accentKey);
  }, [accentKey]);

  useEffect(() => { localStorage.setItem('tab', tab); }, [tab]);
  useEffect(() => { localStorage.setItem('lang', lang); }, [lang]);
  useEffect(() => { localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('chartStyle', chartStyle); }, [chartStyle]);

  useEffect(() => {
    const root = document.documentElement;
    const t = auroraIntensity / 100;
    root.style.setProperty('--aurora-alpha', t);
    root.style.setProperty('--aurora-stop', `${40 + t * 60}%`);
    root.style.setProperty('--aurora-saturate', 1 + t * 4);
    localStorage.setItem('pref.auroraIntensity', auroraIntensity);
  }, [auroraIntensity]);

  // Load users once on mount
  useEffect(() => {
    api.get('/api/users').then(list => {
      const arr = Array.isArray(list) ? list : [];
      setUsers(arr);
      setNeedsSetup(arr.filter(u => !u.is_aggregate).length === 0);
      // Set --user-primary to the base user's color for CSS
      if (arr.length > 0) {
        const primary = arr.find(u => u.id === localStorage.getItem('baseUser') && !u.is_aggregate)
          ?? arr.find(u => !u.is_aggregate);
        if (primary) {
          document.documentElement.style.setProperty('--user-primary', primary.color);
        }
      }
    }).catch(() => setNeedsSetup(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update --user-primary when base user changes
  useEffect(() => {
    if (!baseUser || !users.length) return;
    const u = users.find(usr => usr.id === baseUser);
    if (u?.color) document.documentElement.style.setProperty('--user-primary', u.color);
  }, [baseUser, users]);

  useEffect(() => {
    document.documentElement.setAttribute('data-privacy', privacyMode ? 'on' : 'off');
    localStorage.setItem('privacy', privacyMode);
  }, [privacyMode]);

  // ── API data ──
  const [d, setD] = useState({
    settings: null, positions: null, checkins: null, sparplans: null,
    dividends: null, portfolioSummary: null, history: [],
    lastSync: null, syncing: false, baseline: null, performance: null, benchmark: null,
    appVersion: null,
  });
  const [bankingData, setBankingData] = useState({ accounts: [], txns: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    if (!currentUser) return;
    try {
      const q = `?owner=${currentUser}`;
      const [settings, positions, checkins, sparplans, dividends, portfolioSummary, sync, history, baseline, performance, benchmark, versionRes] = await Promise.all([
        api.get(`/api/settings${q}`),
        api.get(`/api/positions${q}`),
        api.get(`/api/checkins${q}`),
        api.get(`/api/sparplans${q}`),
        api.get(`/api/dividends${q}`),
        api.get(`/api/portfolio/summary${q}`),
        api.get('/api/prices/last-sync'),
        api.get(`/api/portfolio/history${q}&days=3650`).catch(() => []),
        api.get(`/api/baselines${q}`).catch(() => null),
        api.get(`/api/portfolio/performance${q}`).catch(() => null),
        api.get(`/api/portfolio/benchmark${q}`).catch(() => null),
        api.get('/api/version').catch(() => null),
      ]);
      setD({
        settings,
        positions: Array.isArray(positions) ? positions : [],
        checkins:  Array.isArray(checkins)  ? checkins  : [],
        sparplans: sparplans?.sparplans ?? (Array.isArray(sparplans) ? sparplans : []),
        dividends: Array.isArray(dividends) ? dividends : [],
        portfolioSummary,
        history: Array.isArray(history) ? history : [],
        lastSync: sync?.last_sync, syncing: sync?.syncing ?? false,
        baseline: baseline && Object.keys(baseline).length ? baseline : null,
        performance: (performance?.irr_pct != null || performance?.irr_note) ? performance : null,
        benchmark: (benchmark?.benchmark_irr_pct ?? benchmark?.benchmark_cagr_pct) != null ? benchmark : null,
        appVersion: versionRes?.version ?? null,
      });
      setError(null);
    } catch (e) {
      setError(`Fehler: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const loadBanking = useCallback(async () => {
    try {
      const [accounts, txns, categories] = await Promise.all([
        api.get('/api/banking/accounts?owner=all').catch(() => []),
        api.get('/api/banking/transactions?owner=all&limit=0').catch(() => []),
        api.get('/api/banking/categories').catch(() => []),
      ]);
      setBankingData({
        accounts: Array.isArray(accounts) ? accounts : [],
        txns: Array.isArray(txns) ? txns : [],
        categories: Array.isArray(categories) ? categories : [],
      });
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { setLoading(true); loadAll(); loadBanking(); }, [loadAll, loadBanking]);

  // Poll sync status while syncing
  useEffect(() => {
    if (!d.syncing) return;
    const t = setInterval(async () => {
      try {
        const sync = await api.get('/api/prices/last-sync');
        if (!(sync?.syncing)) {
          setD(prev => ({ ...prev, syncing: false, lastSync: sync?.last_sync }));
          clearInterval(t);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [d.syncing]);

  const triggerSync = async () => {
    if (d.syncing) return;
    setD(prev => ({ ...prev, syncing: true }));
    try { await api.get('/api/prices/sync'); }
    catch {}
  };

  // On mount / after splash: prompt for password if baseUser has one and device hasn't authenticated
  useEffect(() => {
    if (!baseUser) return;
    if (localStorage.getItem(`auth_${baseUser}`) === '1') return;
    api.get(`/api/auth/has-password?owner=${baseUser}`)
      .then(r => { if (r.has_password) setPwModal({ user: baseUser, isInitial: true }); })
      .catch(() => {});
  }, [baseUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadUsers = useCallback(async () => {
    const list = await api.get('/api/users').catch(() => []);
    const arr = Array.isArray(list) ? list : [];
    setUsers(arr);
    setNeedsSetup(arr.filter(u => !u.is_aggregate).length === 0);
    return arr;
  }, []);

  const handleSplashSelect = (userId) => {
    localStorage.setItem('baseUser', userId);
    setBaseUser(userId);
    setCurrentUser(userId);
    const u = users.find(usr => usr.id === userId);
    if (u?.color) document.documentElement.style.setProperty('--user-primary', u.color);
  };

  const handleSelectUser = async (user) => {
    if (localStorage.getItem(`auth_${user}`) === '1') {
      setCurrentUser(user);
      return;
    }
    try {
      const r = await api.get(`/api/auth/has-password?owner=${user}`);
      if (!r.has_password) {
        setCurrentUser(user);
      } else {
        setPwError('');
        setPwModal({ user, isInitial: false });
      }
    } catch {
      setCurrentUser(user); // fail open
    }
  };

  const handlePwSubmit = async (pw) => {
    try {
      await api.post('/api/auth/verify', { owner: pwModal.user, password: pw });
      localStorage.setItem(`auth_${pwModal.user}`, '1');
      setCurrentUser(pwModal.user);
      setPwModal(null);
      setPwError('');
    } catch {
      setPwError('Falsches Passwort');
    }
  };

  const { settings, positions, checkins, sparplans, dividends, portfolioSummary,
          history, lastSync, syncing, baseline, performance, benchmark, appVersion } = d;

  const t = L[lang];
  const tabTitles = {
    ubersicht: t.dashboard,
    portfolio: t.portfolio,
    giro: lang === 'de' ? 'Giro' : 'Bank',
    projektion: t.projection,
  };

  const commonProps = {
    currentUser, users, lang, chartStyle, onRefresh: loadAll,
    settings, positions, portfolioSummary, history,
    sparplans, checkins, dividends, baseline, performance, benchmark,
    syncing, lastSync, privacyMode,
  };

  // The set of users shown in the switcher: base user + all aggregate users
  const aggregateUser = users.find(u => u.is_aggregate && u.member_ids?.includes(baseUser));
  const switchableUsers = baseUser
    ? [baseUser, ...(aggregateUser ? [aggregateUser.id] : [])]
    : users.filter(u => !u.is_aggregate).map(u => u.id);

  return (
    <div className="app-shell" key={`${currentUser}-${lang}`}>
      {needsSetup && <SetupWizard lang={lang} onDone={async () => { const arr = await reloadUsers(); if (arr.length) setNeedsSetup(false); }} />}
      {!needsSetup && !baseUser && <SplashScreen lang={lang} users={users} onSelect={handleSplashSelect} />}
      {pwModal && (
        <PwModal
          user={pwModal.user}
          users={users}
          error={pwError}
          onSubmit={handlePwSubmit}
          onDismiss={pwModal.isInitial ? undefined : () => { setPwModal(null); setPwError(''); }}
        />
      )}

      {/* Mobile greeting header — hidden on desktop via CSS */}
      <EHeader
        currentUser={currentUser || baseUser || ''}
        users={users}
        lang={lang}
        onCycleUser={() => {
          if (!baseUser) return;
          if (aggregateUser && currentUser !== aggregateUser.id) {
            handleSelectUser(aggregateUser.id);
          } else {
            handleSelectUser(baseUser);
          }
        }}
        onSettings={() => setSettingsOpen(true)}
        privacyMode={privacyMode}
        onPrivacyToggle={() => setPrivacyMode(v => !v)}
      />

      {/* Desktop shell wrapper — on mobile, this is just a column */}
      <div className="e-shell">
        {/* TopBar — on mobile: hidden via CSS; on desktop: shows page title + controls */}
        <TopBar
          title={tabTitles[tab]}
          currentUser={currentUser || baseUser || ''}
          users={users}
          onUserSelect={handleSelectUser}
          onSettings={() => setSettingsOpen(true)}
          onSync={triggerSync}
          syncing={syncing}
          lang={lang}
          privacyMode={privacyMode}
          onPrivacyToggle={() => setPrivacyMode(v => !v)}
          switchableUsers={switchableUsers}
        />

        <main className="content" key={tab}>
          {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
          {error && !loading && (
            <div style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', borderRadius: 14, padding: 16, color: 'var(--neg)' }}>
              {error}{' '}
              <button onClick={loadAll} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit' }}>
                {lang === 'de' ? 'Nochmal versuchen' : 'Retry'}
              </button>
            </div>
          )}
          {!loading && !error && (
            <ErrorBoundary key={`${tab}-${currentUser}`}>
              {tab === 'ubersicht'  && <UbersichtTab  {...commonProps} onCheckin={() => setTab('projektion')} />}
              {tab === 'portfolio'  && <PortfolioTab  {...commonProps} />}
              {tab === 'giro'       && <GiroTab       {...commonProps} bankingAccounts={bankingData.accounts} bankingTxns={bankingData.txns} bankingCategories={bankingData.categories} onBankingRefresh={loadBanking} onRefresh={loadAll} />}
              {tab === 'projektion' && <ProjektionTab {...commonProps} />}
            </ErrorBoundary>
          )}
        </main>
      </div>

      {/* Bottom nav — becomes sidebar on desktop via CSS */}
      <BottomNav active={tab} onChange={setTab} lang={lang} />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentUser={currentUser}
        lang={lang}
        onLangToggle={() => setLang(v => v === 'de' ? 'en' : 'de')}
        theme={theme}
        onThemeCycle={() => setTheme(v => v === 'light' ? 'dark' : v === 'dark' ? 'system' : 'light')}
        density={density}
        onDensityChange={setDensity}
        accent={accentKey}
        onAccentChange={opt => setAccentKey(opt.accent)}
        chartStyle={chartStyle}
        onChartStyleToggle={() => setChartStyle(v => v === 'soft' ? 'sharp' : 'soft')}
        auroraIntensity={auroraIntensity}
        onAuroraIntensityChange={setAuroraIntensity}
        settings={settings}
        appVersion={appVersion}
        onSettingsSaved={loadAll}
        syncing={syncing}
        lastSync={lastSync}
        onSyncPrices={triggerSync}
        onBackfillPrices={() => api.post('/api/prices/backfill', {}).catch(e => alert(e.message))}
      />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
