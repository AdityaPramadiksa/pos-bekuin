import type { OrderEvent } from '@bekuin/shared';
import { pushPlan } from './push-plan';
import { isAllowedPushEndpoint } from './push.service';

const order = (partial: Partial<OrderEvent> = {}): OrderEvent => ({
  id: 'o1',
  orderNo: 'BK-20260925-0001',
  status: 'PENDING',
  source: 'POS',
  fulfillmentStatus: 'QUEUED',
  createdById: 'staff1',
  label: 'Bu Sari · Rp42.000',
  ...partial,
});

describe('pushPlan', () => {
  it('order baru → semua admin kecuali pembuatnya', () => {
    const [t] = pushPlan('order.created', order(), 'staff1');
    expect(t).toMatchObject({ to: 'admins', exceptUserId: 'staff1' });
    expect(t.message.title).toBe('Order baru BK-20260925-0001');
    expect(t.message.body).toContain('POS');
  });

  it('order QR baru (pelanggan) → semua admin', () => {
    const [t] = pushPlan('order.created', order({ source: 'QR_TABLE', createdById: null }), null);
    expect(t).toMatchObject({ to: 'admins', exceptUserId: null });
  });

  it('approve/tolak → staff pembuat, bukan admin yang meng-approve', () => {
    expect(pushPlan('order.updated', order({ status: 'PAID' }), 'admin1')).toEqual([
      expect.objectContaining({ to: 'user', userId: 'staff1' }),
    ]);
    const [rejected] = pushPlan('order.updated', order({ status: 'REJECTED' }), 'admin1');
    expect(rejected.message.title).toContain('ditolak');
    // Admin meng-approve order buatannya sendiri: tidak perlu notifikasi.
    expect(
      pushPlan('order.updated', order({ status: 'PAID', createdById: 'admin1' }), 'admin1'),
    ).toEqual([]);
  });

  it('pelanggan kirim bukti bayar / batal → admin; perubahan lain tidak dikirim', () => {
    const qr = { source: 'QR_TABLE' as const, createdById: null };
    expect(pushPlan('order.updated', order(qr), null)[0].message.title).toContain('Bukti bayar');
    expect(
      pushPlan('order.updated', order({ ...qr, status: 'CANCELLED' }), null)[0].message.title,
    ).toContain('dibatalkan');
    expect(pushPlan('order.updated', order({ status: 'VOIDED' }), 'admin1')).toEqual([]);
  });
});

describe('isAllowedPushEndpoint', () => {
  it('menerima layanan push resmi, menolak lainnya', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(
      true,
    );
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://127.0.0.1/x')).toBe(false);
    expect(isAllowedPushEndpoint('bukan url')).toBe(false);
  });
});
