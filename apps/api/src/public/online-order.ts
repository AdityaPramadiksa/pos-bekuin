import { addDays } from '../common/dates';

/** Pesanan online bisa dipesan paling jauh 14 hari ke depan (pre-order). */
export const ONLINE_MAX_DAYS_AHEAD = 14;
/** Maksimal pesanan online menunggu per nomor WA (pengganti batas per meja). */
export const MAX_PENDING_PER_PHONE = 3;

/**
 * Rentang tanggal kirim/ambil untuk link order online (WITA). Toko sedang buka → boleh hari
 * ini; di luar jam buka atau toko tutup → paling cepat besok (pesanan tetap bisa masuk).
 */
export function onlineDateWindow(today: string, openNow: boolean) {
  return {
    earliestDate: openNow ? today : addDays(today, 1),
    latestDate: addDays(today, ONLINE_MAX_DAYS_AHEAD),
  };
}

/** Samakan format No. WA: hanya angka, awalan 62/+62 menjadi 0. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('62') ? `0${digits.slice(2)}` : digits;
}
