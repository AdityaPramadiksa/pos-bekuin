import { parseAmount, parsePaymentNotification } from './parse-notification';

describe('parseAmount', () => {
  it.each([
    ['Rp25.037', 25037],
    ['Rp 25.037,00', 25037],
    ['IDR 25,037', 25037],
    ['Rp25037', 25037],
    ['Rp1.250.012 masuk', 1250012],
    ['sebesar Rp. 35.021 dari', 35021],
  ])('%s → %d', (text, amount) => expect(parseAmount(text)).toBe(amount));

  it('tanpa Rp → null', () => {
    expect(parseAmount('Kamu menerima 25.037')).toBeNull();
    expect(parseAmount('Rp0')).toBeNull();
  });
});

describe('parsePaymentNotification', () => {
  it('uang masuk dari QRIS / transfer → nominal', () => {
    for (const text of [
      'Kamu menerima Rp25.037 dari SITI AMINAH',
      'Pembayaran QRIS Rp25.037 berhasil diterima',
      'Dana masuk Rp 25.037,00',
      'Yeay! Ada uang masuk sebesar Rp25.037 ke saldo DANA kamu',
    ]) {
      expect(parsePaymentNotification({ text })).toEqual({
        amount: 25037,
        incoming: true,
        ignoreReason: null,
      });
    }
  });

  it('judul ikut dibaca', () => {
    expect(
      parsePaymentNotification({ title: 'Pembayaran diterima', text: 'Rp35.021 · BUDI' }),
    ).toMatchObject({ amount: 35021, ignoreReason: null });
  });

  it('uang keluar / top up / promo diabaikan', () => {
    for (const text of [
      'Kamu berhasil membayar Rp25.037 ke Toko Sebelah',
      'Pembayaran ke Warung Kopi Rp25.037 berhasil',
      'Top Up saldo Rp50.000 berhasil diterima',
      'Transfer ke BCA Rp100.000 berhasil',
      'Cashback Rp5.000 masuk ke saldo kamu',
    ]) {
      const r = parsePaymentNotification({ text });
      expect(r.ignoreReason).toMatch(/Bukan uang masuk/);
    }
  });

  it('notifikasi lain / tanpa nominal diabaikan', () => {
    expect(parsePaymentNotification({ text: 'Promo spesial hari ini Rp10.000' }).ignoreReason).toBe(
      'Bukan notifikasi uang masuk',
    );
    expect(parsePaymentNotification({ text: 'Kamu menerima pembayaran' }).ignoreReason).toBe(
      'Nominal tidak terbaca',
    );
  });
});
