/**
 * QRIS (EMVCo Merchant-Presented QR) — fungsi murni, dipakai API & web.
 *
 * QRIS statis toko (misal dari DANA) bisa diberi nominal per order: tag 01 diubah menjadi
 * "12" (dinamis), tag 54 (nominal) disisipkan, lalu CRC (tag 63) dihitung ulang. Pelanggan
 * yang scan tidak perlu mengetik nominal lagi. Uang tetap masuk ke akun QRIS toko yang sama.
 */

export interface QrisTag {
  id: string;
  value: string;
}

export interface QrisInfo {
  merchantName: string | null;
  merchantCity: string | null;
  /** National Merchant ID (ID…), bila tercantum. */
  nmid: string | null;
  isStatic: boolean;
}

export class QrisError extends Error {}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 digit hex huruf besar. */
export function qrisCrc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function parseTlv(data: string): QrisTag[] {
  const tags: QrisTag[] = [];
  let i = 0;
  while (i < data.length) {
    const id = data.slice(i, i + 2);
    const lenText = data.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenText)) {
      throw new QrisError('Format QRIS tidak dikenali');
    }
    const len = Number(lenText);
    const value = data.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new QrisError('Data QRIS terpotong');
    tags.push({ id, value });
    i += 4 + len;
  }
  return tags;
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** Urai payload QRIS dan pastikan CRC-nya benar. */
export function parseQris(payload: string): QrisTag[] {
  const text = payload.trim();
  if (!text.startsWith('000201')) throw new QrisError('Bukan kode QRIS (awalan tidak sesuai)');
  const tags = parseTlv(text);
  const crc = tags[tags.length - 1];
  if (crc?.id !== '63' || crc.value.length !== 4) {
    throw new QrisError('Kode QRIS tidak punya CRC');
  }
  if (qrisCrc16(text.slice(0, -4)) !== crc.value.toUpperCase()) {
    throw new QrisError('CRC QRIS tidak cocok (kode rusak atau salah baca)');
  }
  return tags;
}

/** Informasi toko dari payload QRIS (untuk konfirmasi di Pengaturan). */
export function qrisInfo(payload: string): QrisInfo {
  const tags = parseQris(payload);
  const get = (id: string) => tags.find((t) => t.id === id)?.value ?? null;
  let nmid: string | null = null;
  for (const t of tags) {
    const n = Number(t.id);
    if (n < 26 || n > 51) continue;
    try {
      const sub = parseTlv(t.value).find((s) => s.id === '02' && /^ID\w+/.test(s.value));
      if (sub) nmid = sub.value;
    } catch {
      // sub-tag tidak standar, lewati
    }
  }
  return {
    merchantName: get('59'),
    merchantCity: get('60'),
    nmid,
    isStatic: get('01') !== '12',
  };
}

/** Payload QRIS dengan nominal (rupiah bulat) — hasil scan langsung terisi jumlahnya. */
export function qrisWithAmount(payload: string, amount: number): string {
  if (!Number.isInteger(amount) || amount < 1 || amount > 9_999_999_999) {
    throw new QrisError('Nominal QRIS tidak valid');
  }
  const tags = parseQris(payload)
    .filter((t) => t.id !== '63' && t.id !== '54')
    .map((t) => (t.id === '01' ? { id: '01', value: '12' } : t));
  if (!tags.some((t) => t.id === '01')) tags.splice(1, 0, { id: '01', value: '12' });
  // Tag disusun urut; nominal masuk sebelum tag pertama yang nomornya > 54.
  const at = tags.findIndex((t) => Number(t.id) > 54);
  tags.splice(at === -1 ? tags.length : at, 0, { id: '54', value: String(amount) });
  const body = tags.map((t) => tlv(t.id, t.value)).join('') + '6304';
  return body + qrisCrc16(body);
}
