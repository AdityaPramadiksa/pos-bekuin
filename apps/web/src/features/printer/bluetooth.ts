/**
 * Koneksi printer thermal BLE lewat Web Bluetooth (Chrome Android/desktop, wajib HTTPS
 * atau localhost). Printer murah memakai UUID layanan yang berbeda-beda, jadi kita
 * minta semua kandidat lalu cari characteristic yang bisa ditulis.
 */
const PRINTER_SERVICES: BluetoothServiceUUID[] = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
];

// Potongan kecil + jeda singkat supaya buffer printer BLE murah tidak meluap.
const CHUNK_SIZE = 128;
const CHUNK_DELAY_MS = 20;

let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
let device: BluetoothDevice | null = null;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function connectedPrinterName(): string | null {
  return device?.gatt?.connected ? (device.name ?? 'Printer') : null;
}

async function findWritableCharacteristic(server: BluetoothRemoteGATTServer) {
  for (const uuid of PRINTER_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      for (const c of await service.getCharacteristics()) {
        if (c.properties.write || c.properties.writeWithoutResponse) return c;
      }
    } catch {
      // layanan ini tidak ada di printer tersebut, coba berikutnya
    }
  }
  throw new Error(
    'Printer terhubung, tapi tidak ditemukan jalur tulis. Printer mungkin bukan BLE.',
  );
}

export async function connectPrinter(): Promise<string> {
  if (!isBluetoothSupported()) {
    throw new Error('Browser ini belum mendukung Web Bluetooth. Pakai Chrome di Android.');
  }
  device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
  device.addEventListener('gattserverdisconnected', () => (characteristic = null));
  const server = await device.gatt!.connect();
  characteristic = await findWritableCharacteristic(server);
  localStorage.setItem('bekuin-printer-name', device.name ?? '');
  return device.name ?? 'Printer';
}

export function disconnectPrinter() {
  device?.gatt?.disconnect();
  characteristic = null;
}

export async function printBytes(data: Uint8Array) {
  if (!characteristic) throw new Error('Printer belum terhubung');
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
  }
}
