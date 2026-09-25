import { useQuery } from '@tanstack/react-query';
import { qrDataUrl, tableUrl } from './qr';

export function useQrImage(qrToken: string | null, width = 512) {
  return useQuery({
    queryKey: ['qr-image', qrToken, width],
    queryFn: () => qrDataUrl(tableUrl(qrToken!), width),
    enabled: !!qrToken,
    staleTime: Infinity,
  });
}
