import type { OrderView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

/** Void order lunas: stok & kemasan dikembalikan, order tetap tercatat sebagai VOID. */
export function VoidOrderButton({ order }: { order: OrderView }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const voidOrder = useMutation({
    mutationFn: () => api.post(`/orders/${order.id}/void`, { reason }),
    onSuccess: () => {
      toast.success(`${order.orderNo} di-void, stok dikembalikan`);
      for (const key of ['orders', 'order', 'reports', 'stock', 'catalog', 'kitchen'])
        void queryClient.invalidateQueries({ queryKey: [key] });
      setOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (order.status !== 'PAID') return null;
  return (
    <>
      <Button variant="outline" className="text-red-600" onClick={() => setOpen(true)}>
        <Ban className="size-4" /> Void
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Void ${order.orderNo}?`}
        description="Stok produk & kemasan dikembalikan. Order tetap tercatat dan tidak dihitung sebagai omzet."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={voidOrder.isPending}
              onClick={() => voidOrder.mutate()}
            >
              Void order
            </Button>
          </>
        }
      >
        <Field label="Alasan (wajib)">
          <Input
            autoFocus
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Salah input, pelanggan batal, …"
          />
        </Field>
      </Dialog>
    </>
  );
}
