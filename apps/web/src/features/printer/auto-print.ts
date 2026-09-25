import type { OrderView, SettingsView } from '@bekuin/shared';
import { api } from '@/lib/api';
import { isPrinterConnected, printReceipt } from './receipt';

const KEY = 'bekuin-auto-print-qris';

/** Cetak otomatis struk QRIS yang terdeteksi di perangkat ini (default: ya). */
export function isAutoPrintEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutoPrintEnabled(enabled: boolean) {
  try {
    localStorage.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    // penyimpanan diblokir: pengaturan hanya berlaku sampai halaman dimuat ulang
  }
}

/**
 * Order QRIS yang disetujui otomatis: cetak struknya bila perangkat ini punya printer terhubung.
 * Balikan true bila tercetak.
 */
export async function autoPrintOrder(orderId: string): Promise<boolean> {
  if (!isAutoPrintEnabled() || !isPrinterConnected()) return false;
  const [order, settings] = await Promise.all([
    api.get<OrderView>(`/orders/${orderId}`),
    api.get<SettingsView>('/settings'),
  ]);
  await printReceipt(order.data, settings.data);
  return true;
}
