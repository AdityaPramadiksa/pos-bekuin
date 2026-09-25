import { useEffect, useState } from 'react';

/** Waktu sekarang yang diperbarui berkala (untuk label "5 mnt lalu") tanpa memanggil Date.now() saat render. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
