import { APP_TIMEZONE } from './format';
import { WEEKDAYS, type OpeningHours, type Weekday } from './menu';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validasi struktur jam buka. Balikan pesan error, atau null bila valid. */
export function validateOpeningHours(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return 'Format jam buka tidak valid';
  for (const [day, range] of Object.entries(value)) {
    if (!WEEKDAYS.includes(day as Weekday)) return `Hari tidak dikenal: ${day}`;
    if (range === null) continue;
    if (
      !Array.isArray(range) ||
      range.length !== 2 ||
      !range.every((t) => typeof t === 'string' && TIME_RE.test(t))
    ) {
      return `Jam buka ${day} harus berformat ["HH:MM", "HH:MM"]`;
    }
    if (range[0] === range[1]) return `Jam buka dan tutup ${day} tidak boleh sama`;
  }
  return null;
}

/**
 * Apakah toko buka pada `date` menurut jam buka (zona WITA).
 * Jadwal kosong = selalu buka. Hari yang tidak diisi = tutup.
 * Jam tutup lebih kecil dari jam buka berarti melewati tengah malam (misal 17:00–01:00).
 */
export function isWithinOpeningHours(
  hours: OpeningHours | null | undefined,
  date: Date = new Date(),
  timeZone = APP_TIMEZONE,
): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const today = get('weekday').toLowerCase().slice(0, 3) as Weekday;
  const now = `${get('hour')}:${get('minute')}`;
  const yesterday = WEEKDAYS[(WEEKDAYS.indexOf(today) + 6) % 7];

  const todayRange = hours[today];
  if (todayRange) {
    const [open, close] = todayRange;
    if (open < close ? now >= open && now < close : now >= open) return true;
  }
  // Sisa jam kemarin yang melewati tengah malam.
  const prevRange = hours[yesterday];
  if (prevRange && prevRange[1] < prevRange[0] && now < prevRange[1]) return true;
  return false;
}
