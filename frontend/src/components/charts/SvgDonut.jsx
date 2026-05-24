export default function SvgDonut({ slices, size = 200, thickness = 22, label, value }) {
  const total = slices.reduce((s, x) => s + (x.value || 0), 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  let cumulative = 0;

  const arcs = slices.map((s) => {
    const start = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
    cumulative += s.value || 0;
    const end = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    return {
      d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      color: s.color,
    };
  });

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      {arcs.map((a, i) => (
        <path key={i} d={a.d} stroke={a.color} strokeWidth={thickness} fill="none" strokeLinecap="butt" />
      ))}
      {label && (
        <text
          x={cx} y={cy - 6}
          textAnchor="middle"
          fontSize="10.5"
          fill="var(--ink-faint)"
          fontFamily="var(--font-mono)"
          letterSpacing="0.04em"
        >
          {label.toUpperCase()}
        </text>
      )}
      {value && (
        <text
          x={cx} y={cy + 14}
          textAnchor="middle"
          fontSize="20"
          fill="var(--ink)"
          fontFamily="var(--font-serif)"
          className="pv"
        >
          {value}
        </text>
      )}
    </svg>
  );
}
