import { formatRupiah, STOCK_UNIT_LABEL } from '@bekuin/shared';
import { Copy, Factory, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { ProductionDialog } from '@/features/admin/stock/ProductionTab';
import { categoryLabel, dateKeyWita, fmtQty, formatDateKey } from '@/features/orders/order-format';
import { printBytes } from '@/features/printer/bluetooth';
import { useProductionPlan } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { copyText, planBytes, planText } from './texts';

export function ProductionPlanPage() {
  const [date, setDate] = useState(dateKeyWita(1));
  const plan = useProductionPlan(date);
  const [produce, setProduce] = useState<{ recipeId: string; batchQty: number } | null>(null);
  const p = plan.data;

  return (
    <>
      <PageHeader
        title="Rekap Produksi"
        subtitle="Dari order PENDING per tanggal kirim"
        action={
          <Input
            type="date"
            aria-label="Tanggal kirim"
            className="w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        }
      />
      <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
        {plan.isPending ? (
          <LoadingState />
        ) : plan.isError ? (
          <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
        ) : !p || p.summary.orders === 0 ? (
          <EmptyState
            title={`Belum ada pesanan untuk ${formatDateKey(date)}`}
            description="Pesanan dari Tempel Pesan / POS dengan tanggal kirim ini akan direkap di sini."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm">
                <b>{formatDateKey(p.date)}</b> · {p.summary.customers} pelanggan · {p.summary.packs}{' '}
                pack · <b>{p.summary.pcs} pcs</b> · {formatRupiah(p.summary.amount)}
              </p>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () =>
                    toast[(await copyText(planText(p))) ? 'success' : 'error']('Teks rekap disalin')
                  }
                >
                  <Copy className="size-4" /> Salin teks
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    printBytes(planBytes(p)).then(
                      () => toast.success('Rekap dicetak'),
                      (e: Error) => toast.error(e.message),
                    )
                  }
                >
                  <Printer className="size-4" /> Cetak
                </Button>
              </div>
            </div>

            <section className="overflow-x-auto rounded-2xl bg-white shadow-sm">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="bg-stone-50 text-left text-xs text-stone-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Produk</th>
                    {p.variantColumns.map((c) => (
                      <th key={c.key} className="px-2 py-2 text-right font-medium">
                        {categoryLabel(c.categoryCode)} {c.packSize}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium">Total pcs</th>
                    <th className="px-2 py-2 text-right font-medium">Stok</th>
                    <th className="px-3 py-2 text-right font-medium">Perlu dibuat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {p.products.map((row) => (
                    <tr key={row.productId}>
                      <td className="px-3 py-2 font-medium">{row.productName}</td>
                      {p.variantColumns.map((c) => (
                        <td
                          key={c.key}
                          className="px-2 py-2 text-right text-stone-600 tabular-nums"
                        >
                          {row.byVariant[c.key] ?? ''}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {row.totalPcs}
                      </td>
                      <td className="px-2 py-2 text-right text-stone-500 tabular-nums">
                        {row.stockPcs}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.toProduce > 0 && row.recipeId ? (
                          <button
                            className="bg-brand-50 text-brand-700 inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold"
                            onClick={() =>
                              setProduce({ recipeId: row.recipeId!, batchQty: row.toProduce })
                            }
                          >
                            <Factory className="size-3.5" /> {row.toProduce} pcs
                          </button>
                        ) : (
                          <span className="font-semibold text-green-700">
                            {row.toProduce === 0 ? 'Cukup' : `${row.toProduce} pcs`}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {p.semiFinished.length > 0 && (
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="mb-2 font-semibold">Adonan & bahan setengah jadi</h2>
                <ul className="space-y-2 text-sm">
                  {p.semiFinished.map((s) => {
                    const u = STOCK_UNIT_LABEL[s.baseUnit];
                    return (
                      <li key={s.ingredientId} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-stone-600">
                          butuh {fmtQty(s.need)} {u}
                          {s.stock > 0 ? ` − stok ${fmtQty(s.stock)}` : ''} = {fmtQty(s.shortfall)}{' '}
                          {u} ({fmtQty(s.shortfall / s.batchYield)} batch)
                        </span>
                        {s.batches > 0 ? (
                          <button
                            className="bg-brand-50 text-brand-700 ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold"
                            onClick={() =>
                              setProduce({ recipeId: s.recipeId, batchQty: s.batches })
                            }
                          >
                            <Factory className="size-3.5" /> Buat {s.batches} batch (
                            {fmtQty(s.willMake)} {u})
                          </button>
                        ) : (
                          <span className="ml-auto font-semibold text-green-700">Cukup</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-stone-500">
                  Buat adonan dulu, baru produksi produk (tombol di tabel atas).
                </p>
              </section>
            )}

            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-semibold">Kebutuhan bahan & daftar belanja</h2>
                <span className="text-sm">
                  Estimasi belanja <b>{formatRupiah(p.shoppingTotal)}</b>
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1 font-medium">Bahan</th>
                    <th className="py-1 text-right font-medium">Butuh</th>
                    <th className="py-1 text-right font-medium">Stok</th>
                    <th className="py-1 text-right font-medium">Beli</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {p.materials.map((m) => {
                    const u = STOCK_UNIT_LABEL[m.baseUnit];
                    return (
                      <tr key={m.ingredientId} className={cn(m.shortage > 0 && 'text-red-700')}>
                        <td className="py-1.5">
                          {m.name}
                          {m.type === 'PACKAGING' && (
                            <span className="ml-1 text-xs text-stone-400">kemasan</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {fmtQty(m.need)} {u}
                        </td>
                        <td className="py-1.5 text-right text-stone-500 tabular-nums">
                          {fmtQty(m.stock)}
                        </td>
                        <td className="py-1.5 text-right">
                          {m.shortage > 0 ? (
                            <span className="font-semibold">
                              {m.packsToBuy} {m.purchaseUnit ?? 'kemasan'} ·{' '}
                              {formatRupiah(m.estimatedCost)}
                            </span>
                          ) : (
                            <span className="text-green-700">cukup</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {p.fryList.length > 0 && (
              <section className="rounded-2xl bg-orange-50 p-4">
                <h2 className="mb-1 font-semibold text-orange-900">Digoreng hari kirim</h2>
                <ul className="text-sm text-orange-900">
                  {p.fryList.map((f) => (
                    <li key={`${f.productName}-${f.packSize}`}>
                      {f.productName} isi {f.packSize} × {f.qty}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      {produce && (
        <ProductionDialog
          initial={produce}
          onClose={() => {
            setProduce(null);
            void plan.refetch();
          }}
        />
      )}
    </>
  );
}
