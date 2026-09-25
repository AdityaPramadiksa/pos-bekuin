/**
 * Baca notifikasi e-wallet (DANA) yang diteruskan MacroDroid: apakah ini uang masuk, dan berapa.
 * Fungsi murni supaya mudah diuji dengan contoh teks notifikasi asli.
 */
export interface ParsedNotification {
  /** Nominal rupiah pertama yang ditemukan; null bila tidak ada. */
  amount: number | null;
  incoming: boolean;
  /** Alasan diabaikan (bahasa Indonesia), null bila bisa dicocokkan. */
  ignoreReason: string | null;
}

// "Rp25.037", "Rp 25.037,00", "IDR 25,037", "Rp25037"
const AMOUNT_RE = /(?:rp|idr)\.?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?:,\d{1,2}(?!\d))?/i;
// Uang keluar dari akun admin: jangan pernah dipakai untuk menyetujui order.
const OUTGOING_RE =
  /(kamu|anda)\s+(telah\s+|sudah\s+|berhasil\s+)?(membayar|bayar|mengirim|kirim|transfer)|berhasil\s+(membayar|bayar|mengirim|kirim|transfer)|pembayaran\s+ke\b|transfer\s+ke\b|kirim\s+(uang\s+)?ke\b|top\s?-?up|isi\s+saldo|tarik\s+tunai|penarikan|cashback|refund|pengembalian/i;
const INCOMING_RE =
  /terima|diterima|menerima|masuk|received|pembayaran\s+(qris\s+)?(dari|sebesar)|dibayar\s+oleh|qris/i;

export function parseAmount(text: string): number | null {
  const match = AMOUNT_RE.exec(text);
  if (!match) return null;
  const value = Number(match[1].replace(/[.,]/g, ''));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function parsePaymentNotification(input: {
  title?: string | null;
  text: string;
}): ParsedNotification {
  const full = [input.title, input.text].filter(Boolean).join(' · ').replace(/\s+/g, ' ');
  const amount = parseAmount(full);
  if (OUTGOING_RE.test(full)) {
    return { amount, incoming: false, ignoreReason: 'Bukan uang masuk (uang keluar / top up)' };
  }
  const incoming = INCOMING_RE.test(full);
  if (!incoming) return { amount, incoming, ignoreReason: 'Bukan notifikasi uang masuk' };
  if (amount === null) return { amount, incoming, ignoreReason: 'Nominal tidak terbaca' };
  return { amount, incoming, ignoreReason: null };
}
