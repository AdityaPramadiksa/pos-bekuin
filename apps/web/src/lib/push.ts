import { api } from './api';

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Service worker hanya ada di versi build (bukan `pnpm dev`). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('Browser ini tidak mendukung notifikasi push');
  const reg = await registration();
  if (!reg) {
    throw new Error('Notifikasi hanya aktif di aplikasi terpasang (HTTPS), bukan mode development');
  }
  const { data } = await api.get<{ enabled: boolean; publicKey: string | null }>(
    '/push/public-key',
  );
  if (!data.enabled || !data.publicKey) {
    throw new Error('Notifikasi push belum diaktifkan di server (VAPID key kosong)');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi ditolak di browser');
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(data.publicKey),
    }));
  await api.post('/push/subscribe', sub.toJSON());
}

/** Matikan notifikasi di perangkat ini (juga dipanggil saat keluar akun). */
export async function disablePush(): Promise<void> {
  const sub = await currentPushSubscription().catch(() => null);
  if (!sub) return;
  await api.delete('/push/subscribe', { data: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
