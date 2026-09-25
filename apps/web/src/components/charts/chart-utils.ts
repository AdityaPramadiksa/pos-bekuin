/** Nilai maksimum sumbu yang "bulat" (1, 2, 2.5, 5 × 10^n) dan tiknya. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** Rupiah ringkas untuk sumbu: 450 rb, 1,2 jt. */
export function compactRupiah(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  if (abs >= 1_000_000_000) return `${fmt(n / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} jt`;
  if (abs >= 1_000) return `${fmt(n / 1_000)} rb`;
  return fmt(n);
}
