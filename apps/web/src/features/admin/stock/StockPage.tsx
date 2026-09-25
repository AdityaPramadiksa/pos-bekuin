import { INGREDIENT_TYPE_LABEL, MOVEMENT_LABEL, STOCK_UNIT_LABEL } from '@bekuin/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { formatDateTime } from '@/features/orders/order-format';
import { Chips } from '@/components/ui/chips';
import { useIngredientStock, useProductStock, useStockMovements } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { AdjustStockDialog, type AdjustTarget } from './AdjustStockDialog';
import { fmtQty } from '@/features/orders/order-format';
import { StockBadge } from './StockBadge';

export type StockTab = 'products' | 'ingredients' | 'movements';

export function StockPage({
  extraTabs = [],
  renderExtra,
}: {
  extraTabs?: { key: string; label: string }[];
  renderExtra?: (tab: string) => React.ReactNode;
}) {
  const [tab, setTab] = useState<string>('products');
  const [target, setTarget] = useState<AdjustTarget | null>(null);
  return (
    <>
      <PageHeader title="Stok" subtitle="Stok produk, bahan, dan riwayat mutasi" />
      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { key: 'products', label: 'Produk' },
            { key: 'ingredients', label: 'Bahan & Kemasan' },
            ...extraTabs,
            { key: 'movements', label: 'Riwayat Mutasi' },
          ]}
        />
        {tab === 'products' && <ProductStock onAdjust={setTarget} />}
        {tab === 'ingredients' && <IngredientStock onAdjust={setTarget} />}
        {tab === 'movements' && <Movements />}
        {renderExtra?.(tab)}
      </div>
      <AdjustStockDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function ProductStock({ onAdjust }: { onAdjust: (t: AdjustTarget) => void }) {
  const stock = useProductStock();
  if (stock.isPending) return <LoadingState />;
  if (stock.isError) return <ErrorState error={stock.error} onRetry={() => stock.refetch()} />;
  if (stock.data.length === 0) return <EmptyState title="Belum ada produk" />;
  return (
    <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
      {stock.data.map((p) => (
        <li key={p.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-stone-500">min. {p.minStockPcs} pcs</p>
          </div>
          <StockBadge status={p.status} />
          <span
            className={cn(
              'w-20 text-right font-bold tabular-nums',
              p.status === 'OUT' && 'text-red-600',
            )}
          >
            {p.stockPcs} pcs
          </span>
          <button
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
            onClick={() =>
              onAdjust({
                itemType: 'PRODUCT',
                id: p.id,
                name: p.name,
                unit: 'pcs',
                current: p.stockPcs,
              })
            }
          >
            Atur
          </button>
        </li>
      ))}
    </ul>
  );
}

function IngredientStock({ onAdjust }: { onAdjust: (t: AdjustTarget) => void }) {
  const [type, setType] = useState('');
  const stock = useIngredientStock(type || undefined);
  return (
    <div className="space-y-3">
      <Chips
        value={type}
        onChange={setType}
        options={[
          { key: '', label: 'Semua' },
          ...Object.entries(INGREDIENT_TYPE_LABEL).map(([key, label]) => ({ key, label })),
        ]}
      />
      {stock.isPending ? (
        <LoadingState />
      ) : stock.isError ? (
        <ErrorState error={stock.error} onRetry={() => stock.refetch()} />
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {stock.data.map((i) => {
            const unit = STOCK_UNIT_LABEL[i.baseUnit];
            return (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-stone-500">
                    {INGREDIENT_TYPE_LABEL[i.type]} · min. {fmtQty(i.minStock)} {unit}
                  </p>
                </div>
                <StockBadge status={i.status} />
                <span className="w-24 text-right font-bold tabular-nums">
                  {fmtQty(i.stockQty)} {unit}
                </span>
                <button
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
                  onClick={() =>
                    onAdjust({
                      itemType: 'INGREDIENT',
                      id: i.id,
                      name: i.name,
                      unit,
                      current: i.stockQty,
                    })
                  }
                >
                  Atur
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Movements() {
  const movements = useStockMovements({ limit: '200' });
  if (movements.isPending) return <LoadingState />;
  if (movements.isError)
    return <ErrorState error={movements.error} onRetry={() => movements.refetch()} />;
  if (movements.data.length === 0) return <EmptyState title="Belum ada mutasi stok" />;
  return (
    <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
      {movements.data.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{m.itemName}</p>
            <p className="truncate text-xs text-stone-500">
              {MOVEMENT_LABEL[m.type]} · {m.userName} · {formatDateTime(m.createdAt)}
              {m.note ? ` · ${m.note}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                'font-semibold tabular-nums',
                m.qtyChange < 0 ? 'text-red-600' : 'text-green-700',
              )}
            >
              {m.qtyChange > 0 ? '+' : ''}
              {fmtQty(m.qtyChange)} {m.unit}
            </p>
            <p className="text-xs text-stone-500">saldo {fmtQty(m.balanceAfter)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
