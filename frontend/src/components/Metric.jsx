export default function Metric({ label, value, sub, color }) {
  return (
    <div className="card card-pad">
      <p style={{ color: 'var(--ink-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: color ? undefined : 'var(--ink)' }} className={color || ''}>{value}</p>
      {sub && <p style={{ color: 'var(--ink-faint)', fontSize: 11, marginTop: 3 }}>{sub}</p>}
    </div>
  );
}
