import { type ComponentType, lazy, Suspense } from 'react';
import { LoadingState } from '@/components/ui/states';

/**
 * Halaman dimuat saat dibuka (code-splitting per rute): pelanggan QR tidak perlu
 * mengunduh kode admin, dan layar pertama staff lebih cepat tampil.
 */
export function lazyPage<M extends Record<string, unknown>>(
  load: () => Promise<M>,
  name: keyof M & string,
) {
  const Page = lazy(async () => ({ default: (await load())[name] as ComponentType }));
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl p-4">
          <LoadingState rows={3} />
        </div>
      }
    >
      <Page />
    </Suspense>
  );
}
