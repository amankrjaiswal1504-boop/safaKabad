// Lightweight SVG charts. Specs: 2px lines, ~10% area wash, hairline solid grid,
// bars <= 24px with rounded data-ends, crosshair tooltip on line charts, per-bar
// tooltips, text in text tokens (never the series colour), legend for >= 2
// series, and every chart has a table fallback via `summary`.
import { useMemo, useRef, useState } from 'react';
import { compact } from '../../utils/format';

const W = 640;

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function Tooltip({ x, y, children, width }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-steel-200 bg-surface px-3 py-2 text-xs shadow-lift whitespace-nowrap"
      style={{ left, top: y - 8 }}
      role="status"
    >
      {children}
    </div>
  );
}

export function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-4 text-xs text-steel-600 mb-2">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 rounded" style={{ background: `rgb(var(--${s.color}))` }} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// series: [{ key, label, color: 'viz-1' | 'viz-2', area?: boolean }]
export function LineChart({ data, x, series, height = 220, format = compact, xFormat = (v) => v, title }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const { maxY, pts } = useMemo(() => {
    const max = niceMax(Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))));
    const step = data.length > 1 ? (W - pad.l - pad.r) / (data.length - 1) : 0;
    return {
      maxY: max,
      pts: series.map((s) =>
        data.map((d, i) => [pad.l + i * step, pad.t + (H - pad.t - pad.b) * (1 - (Number(d[s.key]) || 0) / max)])
      ),
    };
  }, [data, series, H]);
  if (!data.length) return <p className="text-sm text-steel-500 py-8 text-center">No data for this period.</p>;
  const ticks = [0, 0.5, 1].map((f) => maxY * f);
  const step = data.length > 1 ? (W - pad.l - pad.r) / (data.length - 1) : 0;
  const onMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round((px - pad.l) / (step || 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  const labelEvery = Math.ceil(data.length / 6);
  return (
    <figure className="relative" aria-label={title}>
      <Legend series={series} />
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((h) => Math.min(data.length - 1, (h ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? data.length) - 1));
        }}
        onBlur={() => setHover(null)}
        role="img"
      >
        {ticks.map((t) => {
          const y = pad.t + (H - pad.t - pad.b) * (1 - t / maxY);
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="rgb(var(--viz-grid))" strokeWidth="1" />
              <text x={pad.l - 8} y={y + 4} textAnchor="end" className="fill-steel-500 text-[11px]">
                {format(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={pad.l + i * step} y={H - 6} textAnchor="middle" className="fill-steel-500 text-[11px]">
              {xFormat(d[x])}
            </text>
          ) : null
        )}
        {series.map((s, si) => {
          const line = pts[si].map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
          const base = H - pad.b;
          return (
            <g key={s.key}>
              {s.area && <path d={`${line}L${pts[si].at(-1)[0]},${base}L${pts[si][0][0]},${base}Z`} fill={`rgb(var(--${s.color}) / 0.1)`} />}
              <path d={line} fill="none" stroke={`rgb(var(--${s.color}))`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={pts[si].at(-1)[0]} cy={pts[si].at(-1)[1]} r="4" fill={`rgb(var(--${s.color}))`} stroke="rgb(var(--surface))" strokeWidth="2" />
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={pad.l + hover * step} x2={pad.l + hover * step} y1={pad.t} y2={H - pad.b} stroke="rgb(var(--steel-400))" strokeWidth="1" />
            {series.map((s, si) => (
              <circle key={s.key} cx={pts[si][hover][0]} cy={pts[si][hover][1]} r="4.5" fill={`rgb(var(--${s.color}))`} stroke="rgb(var(--surface))" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover != null && ref.current && (
        <Tooltip x={((pad.l + hover * step) / W) * ref.current.clientWidth} y={(pts[0][hover][1] / H) * ref.current.clientHeight} width={ref.current.clientWidth}>
          <div className="text-steel-500 mb-1">{xFormat(data[hover][x])}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="w-3 h-0.5 rounded" style={{ background: `rgb(var(--${s.color}))` }} aria-hidden />
              <span className="font-semibold text-steel-900 tabular">{format(data[hover][s.key])}</span>
              <span className="text-steel-500">{s.label}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </figure>
  );
}

// Min-max price band over time (rate trends).
export function RangeChart({ points, height = 200, format = (v) => `Rs. ${v}` }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const H = height;
  const pad = { l: 48, r: 12, t: 12, b: 26 };
  if (!points?.length) return <p className="text-sm text-steel-500 py-8 text-center">No price history yet.</p>;
  const t0 = new Date(points[0].date).getTime();
  const t1 = new Date(points.at(-1).date).getTime();
  const lo = Math.min(...points.map((p) => p.min));
  const hi = Math.max(...points.map((p) => p.max));
  const yMin = Math.max(0, lo - (hi - lo) * 0.25);
  const yMax = hi + (hi - lo) * 0.25 || hi + 1;
  const sx = (d) => pad.l + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
  const sy = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - yMin) / (yMax - yMin || 1));
  // Step shape: a price holds until the next change.
  const stepPath = (key) =>
    points
      .map((p, i) => {
        const x = sx(p.date);
        const y = sy(p[key]);
        if (!i) return `M${x},${y}`;
        return `H${x}V${y}`;
      })
      .join('');
  const upper = stepPath('max');
  const lowerPts = [...points].reverse();
  const lower = lowerPts.map((p, i) => (i ? `H${sx(p.date)}V${sy(p.min)}` : `L${sx(p.date)},${sy(p.min)}`)).join('');
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  return (
    <figure className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Price range over time"
        onPointerMove={(e) => {
          const rect = ref.current.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          points.forEach((p, i) => {
            if (Math.abs(sx(p.date) - px) < Math.abs(sx(points[best].date) - px)) best = i;
          });
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="rgb(var(--viz-grid))" />
            <text x={pad.l - 8} y={sy(t) + 4} textAnchor="end" className="fill-steel-500 text-[11px]">
              {format(Math.round(t))}
            </text>
          </g>
        ))}
        <path d={`${upper}${lower}Z`} fill="rgb(var(--viz-1) / 0.12)" />
        <path d={upper} fill="none" stroke="rgb(var(--viz-1))" strokeWidth="2" />
        <path d={stepPath('min')} fill="none" stroke="rgb(var(--viz-1))" strokeWidth="2" strokeOpacity="0.55" />
        {[points[0], points.at(-1)].map((p, i) => (
          <text key={i} x={sx(p.date)} y={H - 6} textAnchor={i ? 'end' : 'start'} className="fill-steel-500 text-[11px]">
            {new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </text>
        ))}
        {hover != null && <line x1={sx(points[hover].date)} x2={sx(points[hover].date)} y1={pad.t} y2={H - pad.b} stroke="rgb(var(--steel-400))" />}
      </svg>
      {hover != null && ref.current && (
        <Tooltip x={(sx(points[hover].date) / W) * ref.current.clientWidth} y={(sy(points[hover].max) / H) * ref.current.clientHeight} width={ref.current.clientWidth}>
          <div className="text-steel-500 mb-0.5">{new Date(points[hover].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <div className="font-semibold text-steel-900 tabular">
            {format(points[hover].min)} – {format(points[hover].max)}
          </div>
        </Tooltip>
      )}
    </figure>
  );
}

// Horizontal bars with the value at the tip. Good for rankings.
export function BarList({ data, label, value, format = compact, color = 'viz-1', max: maxProp }) {
  const max = maxProp || Math.max(1, ...data.map((d) => Number(d[value]) || 0));
  if (!data.length) return <p className="text-sm text-steel-500 py-6 text-center">No data yet.</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => {
        const v = Number(d[value]) || 0;
        return (
          <li key={d[label]} className="group" title={`${d[label]}: ${format(v)}`}>
            <div className="flex justify-between text-sm mb-1 gap-3">
              <span className="text-steel-700 truncate">{d[label]}</span>
              <span className="font-medium text-steel-900 tabular">{format(v)}</span>
            </div>
            <div className="h-2 rounded-full bg-steel-100">
              <div
                className="h-2 rounded-full transition-[width] group-hover:opacity-80"
                style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: `rgb(var(--${color}))` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Vertical columns (e.g. pickups per day / per slot).
export function ColumnChart({ data, label, value, height = 200, format = compact, labelFormat = (v) => v }) {
  const [hover, setHover] = useState(null);
  const H = height;
  const pad = { l: 36, r: 8, t: 16, b: 26 };
  if (!data.length) return <p className="text-sm text-steel-500 py-8 text-center">No data yet.</p>;
  const max = niceMax(Math.max(1, ...data.map((d) => Number(d[value]) || 0)));
  const band = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(24, band * 0.6);
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        {[0, 0.5, 1].map((f) => {
          const y = pad.t + (H - pad.t - pad.b) * (1 - f);
          return (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="rgb(var(--viz-grid))" />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" className="fill-steel-500 text-[11px]">
                {format(max * f)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const v = Number(d[value]) || 0;
          const h = ((H - pad.t - pad.b) * v) / max;
          const x = pad.l + i * band + (band - bw) / 2;
          const y = H - pad.b - h;
          const r = Math.min(4, h / 2, bw / 2);
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={pad.l + i * band} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${H - pad.b}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${H - pad.b}Z`}
                  fill="rgb(var(--viz-1))"
                  opacity={hover == null || hover === i ? 1 : 0.55}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="fill-steel-500 text-[11px]">
                  {labelFormat(d[label])}
                </text>
              )}
              {hover === i && (
                <text x={x + bw / 2} y={y - 5} textAnchor="middle" className="fill-steel-900 text-[11px] font-semibold">
                  {format(v)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// Conversion funnel: ordinal steps, each bar relative to the first step.
export function Funnel({ steps }) {
  const top = Math.max(1, steps[0]?.count || 0);
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => {
        const pct = (s.count / top) * 100;
        const prev = i ? steps[i - 1].count : null;
        const conv = prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <li key={s.step}>
            <div className="flex justify-between text-sm mb-1 gap-2">
              <span className="text-steel-700">{s.step}</span>
              <span className="tabular">
                <span className="font-medium text-steel-900">{s.count.toLocaleString('en-IN')}</span>
                {conv != null && <span className="text-steel-500 ml-2">{conv}% of previous</span>}
              </span>
            </div>
            <div className="h-3 rounded-full bg-steel-100">
              <div className="h-3 rounded-full" style={{ width: `${Math.max(1.5, pct)}%`, background: `rgb(var(--viz-2) / ${1 - i * 0.14})` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Table view for any chart (accessibility + exact values).
export function ChartTable({ columns, rows }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-steel-500 hover:text-steel-900 text-xs">Show as table</summary>
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-steel-500">
              {columns.map((c) => (
                <th key={c.key} className="py-1 pr-4 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-steel-100">
                {columns.map((c) => (
                  <td key={c.key} className="py-1 pr-4 tabular">
                    {c.format ? c.format(r[c.key]) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
