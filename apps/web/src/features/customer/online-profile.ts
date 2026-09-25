/** Alamat antar terakhir di HP ini, supaya pelanggan tidak mengetik ulang saat pesan lagi. */
const KEY = 'bekuin-online-address';

export function loadAddress(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveAddress(address: string) {
  try {
    localStorage.setItem(KEY, address);
  } catch {
    // mode privat / penyimpanan penuh: abaikan
  }
}
