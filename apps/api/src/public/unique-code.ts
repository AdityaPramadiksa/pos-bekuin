/** Kode unik QRIS: 1–99 rupiah yang ditambahkan ke total. */
export const UNIQUE_CODE_MAX = 99;

/**
 * Pilih kode unik agar nominal (total + kode) tidak sama dengan nominal order QRIS lain yang
 * masih menunggu, sehingga admin bisa mencocokkan notifikasi uang masuk dengan pasti.
 * Balikan null bila semua kode terpakai (sangat jarang; admin mencocokkan manual).
 */
export function pickUniqueCode(
  total: number,
  takenAmounts: ReadonlySet<number>,
  random: () => number = Math.random,
): number | null {
  const free: number[] = [];
  for (let code = 1; code <= UNIQUE_CODE_MAX; code++) {
    if (!takenAmounts.has(total + code)) free.push(code);
  }
  if (free.length === 0) return null;
  return free[Math.floor(random() * free.length)];
}
