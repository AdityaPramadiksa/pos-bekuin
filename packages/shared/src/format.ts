/** Zona waktu tampilan bisnis (PRD bagian 11): simpan UTC, tampilkan WITA. */
export const APP_TIMEZONE = 'Asia/Makassar';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 104000 -> "Rp104.000" (tanpa spasi, sesuai gaya struk). */
export function formatRupiah(amount: number): string {
  return rupiahFormatter.format(amount).replace(/\s/g, '');
}

/** 104000 -> "104.000" (untuk kolom angka di struk). */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount);
}

/** Tanggal (YYYY-MM-DD) di zona waktu bisnis. */
export function businessDateKey(date: Date = new Date(), timeZone = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts; // en-CA sudah berformat YYYY-MM-DD
}

/** Nomor order BK-YYYYMMDD-0001; urutan reset tiap hari (tanggal bisnis). */
export function formatOrderNo(date: Date, sequence: number, timeZone = APP_TIMEZONE): string {
  const ymd = businessDateKey(date, timeZone).replaceAll('-', '');
  return `BK-${ymd}-${String(sequence).padStart(4, '0')}`;
}

/** "  Bu  Sri " -> "bu sri" untuk pencarian pelanggan dan alias produk. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Tombol nominal cepat pembayaran cash: uang pas + pembulatan ke pecahan umum. */
export function quickCashAmounts(total: number): number[] {
  const set = new Set<number>([total]);
  for (const step of [10_000, 20_000, 50_000, 100_000]) set.add(Math.ceil(total / step) * step);
  if (total <= 100_000) set.add(100_000);
  return [...set]
    .filter((v) => v >= total)
    .sort((a, b) => a - b)
    .slice(0, 4);
}
