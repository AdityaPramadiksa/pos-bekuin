import { toast } from 'sonner';
import { PosScreen } from '@/features/pos/PosScreen';

export function StaffOrderPage() {
  return (
    <PosScreen
      onSubmitted={(order) =>
        toast.success(`Order ${order.orderNo} terkirim ke admin`, {
          description: order.customerName ?? undefined,
        })
      }
    />
  );
}
