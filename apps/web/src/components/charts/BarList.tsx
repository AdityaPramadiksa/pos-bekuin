/** Daftar batang horizontal (besaran per kategori): label, batang, dan nilai selalu tampil. */
export function BarList({
  rows,
  format,
  empty = 'Belum ada data',
}: {
  rows: { key: string; label: string; value: number; sub?: string }[];
  format: (n: number) => string;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="py-2 text-sm text-stone-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {r.label}
              {r.sub && <span className="ml-1 text-xs text-stone-500">{r.sub}</span>}
            </span>
            <span className="font-semibold tabular-nums">{format(r.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-r bg-stone-100">
            <div
              className="bg-series-1 h-2 rounded-r"
              style={{ width: `${Math.max(0, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
