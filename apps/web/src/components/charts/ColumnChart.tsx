import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { compactRupiah, niceTicks } from './chart-utils';

export interface ChartPoint {
  key: string;
  /** Label sumbu X (singkat). */
  label: string;
  value: number;
  /** Judul tooltip (mis. tanggal lengkap). */
  title: string;
  /** Baris tambahan tooltip: nilai dulu, lalu keterangan. */
  details?: { label: string; value: string }[];
}

const PAD = { top: 20, right: 8, bottom: 22, left: 44 };
const MAX_BAR = 24;

/** Lebar kontainer (px) yang mengikuti ukuran layar. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Path kolom: ujung data membulat 4px, alas persegi. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Grafik satu seri: kolom bila ≤ 31 titik, garis + area tipis bila lebih.
 * Hover/fokus menampilkan tooltip; tombol "Tabel" menampilkan semua nilai tanpa hover.
 */
export function ColumnChart({
  data,
  format,
  height = 180,
  ariaLabel,
  labelLast = true,
}: {
  data: ChartPoint[];
  format: (n: number) => string;
  height?: number;
  ariaLabel: string;
  /** Label nilai langsung di titik terakhir (mis. hari ini). */
  labelLast?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const n = data.length;
  const asLine = n > 31;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const ticks = niceTicks(Math.max(...data.map((d) => d.value), 0));
  const top = ticks[ticks.length - 1] || 1;
  const band = n ? innerW / n : 0;
  const barW = Math.max(2, Math.min(MAX_BAR, band - 2, band * 0.7));
  const xCenter = (i: number) => PAD.left + band * i + band / 2;
  const yOf = (v: number) => PAD.top + innerH - (Math.max(0, v) / top) * innerH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, innerW / 44)));
  const activePoint = active !== null ? data[active] : null;
  const last = data[n - 1];

  const linePath = data.map((d, i) => `${i ? 'L' : 'M'}${xCenter(i)},${yOf(d.value)}`).join('');
  const areaPath = n
    ? `${linePath}L${xCenter(n - 1)},${PAD.top + innerH}L${xCenter(0)},${PAD.top + innerH}Z`
    : '';

  return (
    <div>
      <div
        ref={ref}
        className="relative"
        style={{ height }}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => {
          if (!asLine || !band) return;
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left;
          setActive(Math.min(n - 1, Math.max(0, Math.floor(x / band))));
        }}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={yOf(t)}
                  y2={yOf(t)}
                  className="stroke-stone-200"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 6}
                  y={yOf(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-stone-500 text-[10px] tabular-nums"
                >
                  {compactRupiah(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text
                  key={d.key}
                  x={xCenter(i)}
                  y={height - 6}
                  textAnchor="middle"
                  className={cn(
                    'text-[10px]',
                    active === i ? 'fill-stone-900 font-semibold' : 'fill-stone-500',
                  )}
                >
                  {d.label}
                </text>
              ) : null,
            )}

            {asLine ? (
              <>
                <path d={areaPath} className="fill-series-1-wash" />
                <path
                  d={linePath}
                  fill="none"
                  className="stroke-series-1"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {activePoint && active !== null && (
                  <>
                    <line
                      x1={xCenter(active)}
                      x2={xCenter(active)}
                      y1={PAD.top}
                      y2={PAD.top + innerH}
                      className="stroke-stone-400"
                      strokeWidth={1}
                    />
                    <circle
                      cx={xCenter(active)}
                      cy={yOf(activePoint.value)}
                      r={4}
                      className="fill-series-1 stroke-white"
                      strokeWidth={2}
                    />
                  </>
                )}
              </>
            ) : (
              data.map((d, i) => {
                const y = yOf(d.value);
                const h = PAD.top + innerH - y;
                return (
                  <g
                    key={d.key}
                    tabIndex={0}
                    role="button"
                    aria-label={`${d.title}: ${format(d.value)}`}
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="outline-none"
                  >
                    {/* Area sentuh selebar pita & setinggi grafik, lebih besar dari batangnya. */}
                    <rect
                      x={PAD.left + band * i}
                      y={PAD.top}
                      width={band}
                      height={innerH}
                      fill="transparent"
                    />
                    {h > 0 && (
                      <path
                        d={columnPath(xCenter(i) - barW / 2, y, barW, h)}
                        className={cn(
                          'fill-series-1 transition-opacity',
                          active !== null && active !== i && 'opacity-50',
                        )}
                      />
                    )}
                  </g>
                );
              })
            )}

            {labelLast && last && last.value > 0 && active === null && (
              <text
                x={Math.min(xCenter(n - 1), width - PAD.right)}
                y={yOf(last.value) - 6}
                textAnchor={asLine ? 'end' : 'middle'}
                className="fill-stone-800 text-[10px] font-semibold"
              >
                {compactRupiah(last.value)}
              </text>
            )}
          </svg>
        )}

        {activePoint && active !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(0, xCenter(active) - 72), Math.max(0, width - 150)),
            }}
          >
            <p className="text-stone-500">{activePoint.title}</p>
            <p className="flex items-center gap-1.5 text-sm font-bold tabular-nums">
              <span className="bg-series-1 inline-block h-0.5 w-3 rounded" />
              {format(activePoint.value)}
            </p>
            {activePoint.details?.map((row) => (
              <p key={row.label} className="tabular-nums">
                <b>{row.value}</b> <span className="text-stone-500">{row.label}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <button
        className="mt-1 text-xs font-medium text-stone-500 underline-offset-2 hover:underline"
        onClick={() => setShowTable((v) => !v)}
      >
        {showTable ? 'Sembunyikan tabel' : 'Lihat tabel'}
      </button>
      {showTable && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-stone-100">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-stone-100">
              {data.map((d) => (
                <tr key={d.key}>
                  <td className="px-2 py-1.5 text-stone-600">{d.title}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                    {format(d.value)}
                  </td>
                  {d.details?.map((row) => (
                    <td key={row.label} className="px-2 py-1.5 text-right tabular-nums">
                      {row.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
