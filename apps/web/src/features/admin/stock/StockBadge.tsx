import type { StockStatus } from '@bekuin/shared';
import { Badge } from '@/components/ui/badge';

export function StockBadge({ status }: { status: StockStatus }) {
  if (status === 'OUT') return <Badge tone="red">Habis</Badge>;
  if (status === 'LOW') return <Badge tone="amber">Menipis</Badge>;
  return <Badge tone="green">Aman</Badge>;
}
