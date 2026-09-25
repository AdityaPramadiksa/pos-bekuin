import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApproveDialog } from '@/features/admin/approval/ApproveDialog';
import { PosScreen } from '@/features/pos/PosScreen';
import { PasteImport } from '@/features/preorder/PasteImport';
import { ModeToggle } from '@/features/staff/StaffOrderPage';

/** Admin jualan langsung: order dibuat lalu langsung ke layar bayar. */
export function AdminNewOrderPage() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [mode, setMode] = useState<'quick' | 'paste'>('quick');
  return (
    <>
      <div className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 md:hidden">
        <Link to="/admin/order" className="flex items-center gap-1 text-sm text-stone-600">
          <ArrowLeft className="size-4" /> Order
        </Link>
      </div>
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === 'quick' ? (
        <PosScreen onSubmitted={(order) => setOrderId(order.id)} />
      ) : (
        <PasteImport onSaved={() => setMode('quick')} />
      )}
      <ApproveDialog orderId={orderId} onClose={() => setOrderId(null)} />
    </>
  );
}
