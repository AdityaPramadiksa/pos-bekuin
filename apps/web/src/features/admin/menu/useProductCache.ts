import type { ProductView } from '@bekuin/shared';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queries';

/** Simpan produk hasil mutasi ke cache daftar produk tanpa refetch. */
export function useProductCache() {
  const queryClient = useQueryClient();
  return (product: ProductView) => {
    queryClient.setQueryData<ProductView[]>(queryKeys.products, (list) => {
      if (!list) return [product];
      return list.some((p) => p.id === product.id)
        ? list.map((p) => (p.id === product.id ? product : p))
        : [...list, product];
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
  };
}
