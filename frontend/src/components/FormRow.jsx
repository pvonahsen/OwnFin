export default function FormRow({ label, children }) {
  return (
    <div style={{ marginBottom: 'var(--s-4)' }}>
      <label style={{ display: 'block', color: 'var(--ink-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
