export default function Modal({ title, onClose, children, wide = false }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 50, paddingTop: 48, paddingLeft: 16, paddingRight: 16 }} onClick={onClose}>
      <div
        style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: wide ? 672 : 448, maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--s-5)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--bg-elev)', zIndex: 10 }}>
          <h2 style={{ fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--ink-muted)', background: 'none', border: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>&times;</button>
        </div>
        <div style={{ padding: 'var(--s-5)' }}>{children}</div>
      </div>
    </div>
  );
}
