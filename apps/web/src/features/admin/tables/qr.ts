import QRCode from 'qrcode';

/** URL publik untuk QR meja. VITE_PUBLIC_WEB_URL (produksi) atau alamat yang sedang dipakai. */
export function tableUrl(qrToken: string) {
  const base =
    (import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined) || window.location.origin;
  return `${base.replace(/\/$/, '')}/m/${qrToken}`;
}

export function isLocalOrigin() {
  if (import.meta.env.VITE_PUBLIC_WEB_URL) return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

export const qrDataUrl = (text: string, width = 512) =>
  QRCode.toDataURL(text, {
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1c1917', light: '#ffffff' },
  });
