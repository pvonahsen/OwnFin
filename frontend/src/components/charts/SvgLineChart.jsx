import { useState, useRef, useEffect, useId } from 'react';
import { eur, abbr, smoothPath, linearPath } from '../../utils.js';

function interpolateY(points, x) {
  const sorted = [...points].filter(p => p.y != null && !isNaN(p.y)).sort((a, b) => a.x - b.x);
  if (!sorted.length) return null;
  if (x <= sorted[0].x) return sorted[0].y;
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
  const hi = sorted.findIndex(p => p.x >= x);
  if (hi <= 0) return sorted[0].y;
  const lo = hi - 1;
  const t = (x - sorted[lo].x) / (sorted[hi].x - sorted[lo].x);
  return sorted[lo].y + t * (sorted[hi].y - sorted[lo].y);
}

export default function SvgLineChart({
  series,       // [{ label, data: number[], color, dashed, area, thick, faint }]
  labels,       // x-axis labels (strings), indexed by integer x
  indexToLabel, // optional (x: number) => string — used when labels prop absent or for fractional x
  height = 200,
  goalLine,     // optional horizontal goal value
  phaseLines,   // [{ value: x-index, color, label }]
  style: chartStyle = 'soft',
  yFormat,
  showGrid = true,
}) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const [w, setW] = useState(320);
  const uid = useId().replace(/:/g, 'x');

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const fmt = yFormat || abbr;
  const padL = 42, padR = 14, padT = 14, padB = 30;
  const innerW = Math.max(40, w - padL - padR);
  const innerH = Math.max(40, height - padT - padB);

  const normSeries = series.map(s => ({
    ...s,
    points: (s.data || []).map((d, i) => typeof d === 'number' ? { x: i, y: d } : d).filter(Boolean),
  }));

  const allY = normSeries.flatMap(s => s.points.map(p => p.y).filter(v => v != null && !isNaN(v)));
  const dataMin = allY.length ? Math.min(...allY) : 0;
  const dataMax = allY.length ? Math.max(...allY) : 1;
  const yMin = goalLine != null ? Math.min(dataMin, goalLine) : dataMin;
  const yMax = goalLine != null ? Math.max(dataMax, goalLine * 1.05) : dataMax * 1.05 || 1;
  const yRange = yMax - yMin || 1;

  const allX = normSeries.flatMap(s => s.points.map(p => p.x));
  const xMin = allX.length ? Math.min(...allX) : 0;
  const xMax = allX.length ? Math.max(...allX) : labels?.length - 1 || 1;
  const xRange = xMax - xMin || 1;

  const sx = x => padL + ((x - xMin) / xRange) * innerW;
  const sy = y => padT + (1 - (y - yMin) / yRange) * innerH;

  const yTicks = [];
  for (let i = 0; i <= 4; i++) yTicks.push(yMin + (yRange * i) / 4);

  const xTickCount = Math.min(6, (labels?.length) || 6);
  const xTickIdx = [];
  if (labels?.length > 1) {
    for (let i = 0; i < xTickCount; i++) {
      xTickIdx.push(Math.round((labels.length - 1) * i / (xTickCount - 1)));
    }
  }

  const pathFn = chartStyle === 'soft' ? smoothPath : linearPath;

  const tooltipLeft = hover != null ? Math.min(w - 190, Math.max(0, sx(hover) - 90)) : 0;

  const getLabel = x => {
    if (indexToLabel) return indexToLabel(x);
    if (labels) return labels[Math.round(x)];
    return null;
  };

  const tooltipVisible = hover != null && normSeries.some(s => interpolateY(s.points, hover) != null);

  return (
    <div
      ref={ref}
      style={{ width: '100%', position: 'relative' }}
      onMouseLeave={() => setHover(null)}
      onTouchEnd={() => setHover(null)}
    >
      <svg
        width={w} height={height}
        style={{ display: 'block', overflow: 'hidden' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < padL || x > w - padR) { setHover(null); return; }
          const frac = ((x - padL) / innerW) * xRange + xMin;
          setHover(Math.max(xMin, Math.min(xMax, frac)));
        }}
      >
        {/* Gradient defs — one per area series */}
        <defs>
          {normSeries.map((s, i) => {
            if (!s.area) return null;
            const color = s.color || `var(--c-${(i % 7) + 1})`;
            return (
              <linearGradient key={i} id={`${uid}ag${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color} stopOpacity="0.30" />
                <stop offset="70%"  stopColor={color} stopOpacity="0.07" />
                <stop offset="100%" stopColor={color} stopOpacity="0"    />
              </linearGradient>
            );
          })}
        </defs>

        {/* Y grid */}
        {showGrid && yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={padL} x2={w - padR} y1={sy(v)} y2={sy(v)}
              stroke="var(--line)" strokeWidth="1"
              strokeDasharray={i === 0 ? '0' : '2 4'}
            />
            <text x={padL - 6} y={sy(v) + 4} fontSize="10" fill="var(--ink-faint)" textAnchor="end" fontFamily="var(--font-mono)" className="pv">
              {fmt(v)}
            </text>
          </g>
        ))}

        {/* Phase lines */}
        {phaseLines?.map((p, i) => (
          <g key={`pl${i}`}>
            <line
              x1={sx(p.value)} x2={sx(p.value)} y1={padT} y2={padT + innerH}
              stroke={p.color || 'var(--line-strong)'} strokeWidth="1" strokeDasharray="2 3" opacity="0.5"
            />
            {p.label && (
              <text x={sx(p.value) + 3} y={padT + 10} fontSize="9.5" fill={p.color || 'var(--ink-faint)'}>
                {p.label}
              </text>
            )}
          </g>
        ))}

        {/* Goal line */}
        {goalLine != null && (
          <g>
            <line
              x1={padL} x2={w - padR} y1={sy(goalLine)} y2={sy(goalLine)}
              stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7"
            />
            <text x={w - padR - 2} y={sy(goalLine) - 5} fontSize="10" fill="var(--accent)" textAnchor="end" className="pv">
              {eur(goalLine)}
            </text>
          </g>
        )}

        {/* Series */}
        {normSeries.map((s, i) => {
          const pts = s.points.filter(p => p.y != null && !isNaN(p.y)).map(p => [sx(p.x), sy(p.y)]);
          if (pts.length < 2) return null;
          const path = pathFn(pts);
          const areaPath = `${path} L ${pts[pts.length - 1][0]},${padT + innerH} L ${pts[0][0]},${padT + innerH} Z`;
          const color = s.color || `var(--c-${(i % 7) + 1})`;
          return (
            <g key={s.label || i}>
              {s.area && (
                <path d={areaPath} fill={`url(#${uid}ag${i})`} />
              )}
              <path
                d={path}
                stroke={color}
                strokeWidth={s.thick ? 2.25 : 1.5}
                fill="none"
                strokeDasharray={s.dashed ? '4 3' : ''}
                opacity={s.faint ? 0.45 : 1}
                strokeLinecap="round" strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* Hover crosshair + dots */}
        {hover != null && (
          <g>
            <line
              x1={sx(hover)} x2={sx(hover)} y1={padT} y2={padT + innerH}
              stroke="var(--ink)" strokeWidth="1" opacity="0.15"
            />
            {normSeries.map((s, i) => {
              const y = interpolateY(s.points, hover);
              if (y == null) return null;
              const color = s.color || `var(--c-${(i % 7) + 1})`;
              return (
                <circle key={i} cx={sx(hover)} cy={sy(y)} r="4"
                  fill="var(--bg-elev)"
                  stroke={color}
                  strokeWidth="1.75"
                />
              );
            })}
          </g>
        )}

        {/* X labels */}
        {labels && xTickIdx.map(i => (
          <text key={i} x={sx(i)} y={padT + innerH + 18} fontSize="10" fill="var(--ink-faint)" textAnchor="middle" fontFamily="var(--font-mono)">
            {labels[i]}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hover != null && tooltipVisible && (
        <div style={{
          position: 'absolute',
          top: padT,
          left: tooltipLeft,
          pointerEvents: 'none',
          width: 'fit-content', maxWidth: 210,
          background: 'var(--bg-elev)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)',
          padding: '7px 10px',
          boxShadow: 'var(--shadow-md)',
          fontSize: 12, zIndex: 10,
        }}>
          <div style={{ color: 'var(--ink-faint)', fontSize: 10.5, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
            {getLabel(hover)}
          </div>
          {normSeries.map((s, i) => {
            const y = interpolateY(s.points, hover);
            if (y == null) return null;
            const color = s.color || `var(--c-${(i % 7) + 1})`;
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, background: color, borderRadius: 2, flexShrink: 0 }} />
                  <span style={{ color: 'var(--ink-muted)' }}>{s.label}</span>
                </span>
                <span className="pv" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(y)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
