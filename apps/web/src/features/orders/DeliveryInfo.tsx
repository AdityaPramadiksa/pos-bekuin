import { DELIVERY_METHOD_LABEL, formatRupiah, type OrderView } from '@bekuin/shared';
import { Bike, MapPin, MessageCircle, Store } from 'lucide-react';
import { formatDateKey } from './order-format';

/** "08xx" → "628xx" untuk tautan wa.me. */
const waNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
};

/** Info pesanan online untuk admin/kurir: ambil/antar, tanggal, alamat, No. WA. */
export function DeliveryInfo({ order }: { order: OrderView }) {
  if (!order.deliveryMethod) return null;
  const Icon = order.deliveryMethod === 'DELIVERY' ? Bike : Store;
  return (
    <div className="space-y-1.5 rounded-xl border border-stone-200 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="text-brand-700 size-4" />
        {DELIVERY_METHOD_LABEL[order.deliveryMethod]} · {formatDateKey(order.deliveryDate)}
        {order.deliveryFee > 0 && (
          <span className="ml-auto font-normal text-stone-600">
            Ongkir {formatRupiah(order.deliveryFee)}
          </span>
        )}
      </p>
      {order.deliveryAddress && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-2 text-stone-700 hover:underline"
        >
          <MapPin className="mt-0.5 size-4 shrink-0 text-stone-400" />
          {order.deliveryAddress}
        </a>
      )}
      {order.customerPhone && (
        <a
          href={`https://wa.me/${waNumber(order.customerPhone)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 font-medium text-green-700"
        >
          <MessageCircle className="size-4" /> {order.customerPhone}
        </a>
      )}
    </div>
  );
}
