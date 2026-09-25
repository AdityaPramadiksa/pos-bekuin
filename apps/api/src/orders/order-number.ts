import type { Prisma } from '@prisma/client';
import { businessDateKey, formatOrderNo } from '@bekuin/shared';

/**
 * Nomor order BK-YYYYMMDD-0001 (tanggal WITA), atomik lewat upsert baris counter.
 * Baris counter terkunci sampai transaksi selesai, jadi nomor tidak pernah kembar.
 */
export async function nextOrderNo(tx: Prisma.TransactionClient, now = new Date()): Promise<string> {
  const key = `order:${businessDateKey(now).replaceAll('-', '')}`;
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO daily_counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = daily_counters.value + 1
    RETURNING value`;
  return formatOrderNo(now, row.value);
}
