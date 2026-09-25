import { BadRequestException } from '@nestjs/common';
import { APP_TIMEZONE, businessDateKey } from '@bekuin/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WITA_OFFSET = '+08:00'; // Asia/Makassar tidak memakai DST

export function assertDateKey(value: string, field = 'tanggal'): string {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`Format ${field} harus YYYY-MM-DD`);
  }
  return value;
}

/** Awal hari (00:00 WITA) dalam UTC. */
export function startOfBusinessDay(dateKey: string): Date {
  return new Date(`${assertDateKey(dateKey)}T00:00:00${WITA_OFFSET}`);
}

/** Rentang [from 00:00, to+1 00:00) WITA untuk query createdAt/approvedAt. */
export function businessRange(from?: string, to?: string): { gte: Date; lt: Date } {
  const fromKey = from ?? businessDateKey();
  const toKey = to ?? fromKey;
  const end = startOfBusinessDay(toKey);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: startOfBusinessDay(fromKey), lt: end };
}

/** Tanggal (kolom @db.Date) dari kunci YYYY-MM-DD. */
export function dateOnly(dateKey: string): Date {
  return new Date(`${assertDateKey(dateKey)}T00:00:00Z`);
}

export function addDays(dateKey: string, days: number): string {
  const d = dateOnly(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const todayKey = () => businessDateKey(new Date(), APP_TIMEZONE);
