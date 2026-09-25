import { describe, expect, it } from 'vitest';
import { parseQris, QrisError, qrisCrc16, qrisInfo, qrisWithAmount } from './qris';

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;
const withCrc = (body: string) => body + '6304' + qrisCrc16(body + '6304');

// QRIS statis sintetis (bentuk sama dengan QRIS e-wallet: tag 26 penyelenggara, 51 NMID).
const STATIC = withCrc(
  tlv('00', '01') +
    tlv('01', '11') +
    tlv(
      '26',
      tlv('00', 'ID.CO.DANA.WWW') + tlv('01', '936009150000000001') + tlv('02', '000000000001'),
    ) +
    tlv('51', tlv('00', 'ID.CO.QRIS.WWW') + tlv('02', 'ID1026600000001') + tlv('03', 'UMI')) +
    tlv('52', '5812') +
    tlv('53', '360') +
    tlv('58', 'ID') +
    tlv('59', 'BEKUIN FROZEN FOOD') +
    tlv('60', 'DENPASAR') +
    tlv('61', '80111'),
);

describe('qrisCrc16', () => {
  it('CRC-16/CCITT-FALSE sesuai nilai acuan', () => {
    expect(qrisCrc16('123456789')).toBe('29B1');
  });
});

describe('parseQris & qrisInfo', () => {
  it('membaca nama toko, kota, NMID, dan jenis statis', () => {
    expect(qrisInfo(STATIC)).toEqual({
      merchantName: 'BEKUIN FROZEN FOOD',
      merchantCity: 'DENPASAR',
      nmid: 'ID1026600000001',
      isStatic: true,
    });
  });

  it('menolak CRC salah, awalan salah, dan data terpotong', () => {
    const badCrc = STATIC.slice(0, -4) + (STATIC.endsWith('0000') ? '1111' : '0000');
    expect(() => parseQris(badCrc)).toThrow(QrisError);
    expect(() => parseQris('https://bukan-qris.id')).toThrow(/Bukan kode QRIS/);
    expect(() => parseQris(STATIC.slice(0, 40))).toThrow(QrisError);
  });
});

describe('qrisWithAmount', () => {
  it('jadi QRIS dinamis bernominal dengan CRC baru yang valid', () => {
    const dynamic = qrisWithAmount(STATIC, 99013);
    const tags = parseQris(dynamic); // CRC valid
    const ids = tags.map((t) => t.id);
    expect(tags.find((t) => t.id === '01')?.value).toBe('12');
    expect(tags.find((t) => t.id === '54')?.value).toBe('99013');
    // Tag 54 berada setelah 53 (mata uang) dan sebelum 58 (negara); 63 paling akhir.
    expect(ids.indexOf('54')).toBe(ids.indexOf('53') + 1);
    expect(ids.indexOf('58')).toBe(ids.indexOf('54') + 1);
    expect(ids[ids.length - 1]).toBe('63');
    // Data toko tidak berubah.
    expect(qrisInfo(dynamic)).toMatchObject({
      merchantName: 'BEKUIN FROZEN FOOD',
      isStatic: false,
    });
  });

  it('nominal lama diganti, bukan ditumpuk', () => {
    const twice = qrisWithAmount(qrisWithAmount(STATIC, 20000), 42013);
    const tags = parseQris(twice);
    expect(tags.filter((t) => t.id === '54')).toEqual([{ id: '54', value: '42013' }]);
  });

  it('menolak nominal tidak valid', () => {
    expect(() => qrisWithAmount(STATIC, 0)).toThrow(/Nominal/);
    expect(() => qrisWithAmount(STATIC, 1.5)).toThrow(/Nominal/);
  });
});
