import QRCode from 'qrcode';

/** URL publik untuk QR meja. VITE_PUBLIC_WEB_URL (produksi) atau alamat yang sedang dipakai. */
export function publicWebUrl(path: string) {
  const base =
    (import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined) || window.location.origin;
  return `${base.replace(/\/$/, '')}${path}`;
}

export const tableUrl = (qrToken: string) => publicWebUrl(`/m/${qrToken}`);

/** Link order online toko untuk dibagikan ke WhatsApp/Instagram. */
export const onlineOrderUrl = (token: string) => publicWebUrl(`/pesan/${token}`);

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
