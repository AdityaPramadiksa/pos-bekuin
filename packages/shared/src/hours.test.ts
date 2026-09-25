import { describe, expect, it } from 'vitest';
import { isWithinOpeningHours, validateOpeningHours } from './hours';

// 2026-09-25 adalah hari Jumat. 02:00 UTC = 10:00 WITA.
const at = (wita: string) => new Date(`2026-09-25T${wita}:00+08:00`);

describe('jam buka', () => {
  it('jadwal kosong berarti selalu buka', () => {
    expect(isWithinOpeningHours(null, at('03:00'))).toBe(true);
    expect(isWithinOpeningHours({}, at('03:00'))).toBe(true);
  });

  it('memakai waktu WITA', () => {
    const hours = { fri: ['09:00', '21:00'] as [string, string] };
    expect(isWithinOpeningHours(hours, at('08:59'))).toBe(false);
    expect(isWithinOpeningHours(hours, at('09:00'))).toBe(true);
    expect(isWithinOpeningHours(hours, at('20:59'))).toBe(true);
    expect(isWithinOpeningHours(hours, at('21:00'))).toBe(false);
  });

  it('hari yang tidak diisi atau null berarti tutup', () => {
    expect(isWithinOpeningHours({ mon: ['09:00', '21:00'] }, at('10:00'))).toBe(false);
    expect(isWithinOpeningHours({ fri: null, mon: ['09:00', '21:00'] }, at('10:00'))).toBe(false);
  });

  it('mendukung jam lewat tengah malam', () => {
    const hours = { thu: ['17:00', '01:00'] as [string, string] };
    expect(isWithinOpeningHours(hours, at('00:30'))).toBe(true); // Jumat dini hari, sisa Kamis
    expect(isWithinOpeningHours(hours, at('01:30'))).toBe(false);
  });

  it('memvalidasi format', () => {
    expect(validateOpeningHours({ mon: ['09:00', '21:00'], sun: null })).toBeNull();
    expect(validateOpeningHours({ senin: ['09:00', '21:00'] })).toMatch(/Hari tidak dikenal/);
    expect(validateOpeningHours({ mon: ['9:00', '21:00'] })).toMatch(/HH:MM/);
    expect(validateOpeningHours([])).toMatch(/tidak valid/);
  });
});
