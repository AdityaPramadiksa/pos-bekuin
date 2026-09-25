import ExcelJS from 'exceljs';
import {
  MOVEMENT_LABEL,
  REPORT_LABEL,
  type AmountRow,
  type CashSessionView,
  type CashflowReport,
  type DailyClosingReport,
  type ProductProfitReport,
  type ProductProfitRow,
  type ProfitLossReport,
  type QrServiceReport,
  type ReportType,
  type SalesReport,
  type StockMovementReport,
  type TopProductsReport,
} from '@bekuin/shared';

type Cell = string | number | null;
export interface Column {
  key: string;
  header: string;
  /** Format rupiah di XLSX. */
  money?: boolean;
}
export interface Sheet {
  name: string;
  columns: Column[];
  rows: Record<string, Cell>[];
}

export type ReportData =
  | SalesReport
  | ProfitLossReport
  | ProductProfitReport
  | TopProductsReport
  | CashflowReport
  | StockMovementReport
  | { sessions: CashSessionView[] }
  | QrServiceReport
  | DailyClosingReport;

const amountCols: Column[] = [
  { key: 'label', header: 'Nama' },
  { key: 'count', header: 'Jumlah' },
  { key: 'amount', header: 'Nominal', money: true },
];
const amountSheet = (name: string, rows: AmountRow[]): Sheet => ({
  name,
  columns: amountCols,
  rows: rows.map((r) => ({ label: r.label, count: r.count, amount: r.amount })),
});
const kvSheet = (name: string, pairs: [string, Cell][]): Sheet => ({
  name,
  columns: [
    { key: 'k', header: 'Keterangan' },
    { key: 'v', header: 'Nilai' },
  ],
  rows: pairs.map(([k, v]) => ({ k, v })),
});
const productCols: Column[] = [
  { key: 'productName', header: 'Produk' },
  { key: 'packs', header: 'Pack' },
  { key: 'pcs', header: 'Pcs' },
  { key: 'revenue', header: 'Omzet', money: true },
  { key: 'hpp', header: 'HPP', money: true },
  { key: 'profit', header: 'Laba kotor', money: true },
  { key: 'marginPct', header: 'Margin %' },
];
const productSheet = (name: string, rows: ProductProfitRow[]): Sheet => ({
  name,
  columns: productCols,
  rows: rows.map((r) => ({ ...r })),
});
const shiftSheet = (sessions: CashSessionView[]): Sheet => ({
  name: 'Shift',
  columns: [
    { key: 'openedAt', header: 'Buka' },
    { key: 'openedByName', header: 'Dibuka oleh' },
    { key: 'closedAt', header: 'Tutup' },
    { key: 'orders', header: 'Order' },
    { key: 'sales', header: 'Penjualan', money: true },
    { key: 'openingCash', header: 'Modal', money: true },
    { key: 'cashSales', header: 'Penjualan cash', money: true },
    { key: 'cashExpenses', header: 'Pengeluaran cash', money: true },
    { key: 'expectedCash', header: 'Kas seharusnya', money: true },
    { key: 'countedCash', header: 'Kas fisik', money: true },
    { key: 'difference', header: 'Selisih', money: true },
    { key: 'note', header: 'Catatan' },
  ],
  rows: sessions.map((s) => ({
    openedAt: s.openedAt,
    openedByName: s.openedByName,
    closedAt: s.closedAt,
    orders: s.summary.orders,
    sales: s.summary.sales,
    openingCash: s.openingCash,
    cashSales: s.summary.cashSales,
    cashExpenses: s.summary.cashExpenses,
    expectedCash: s.expectedCash ?? s.summary.expectedCash,
    countedCash: s.countedCash,
    difference: s.difference,
    note: s.note,
  })),
});

/** Ubah data laporan menjadi lembar tabel (dipakai CSV & XLSX). */
export function toSheets(type: ReportType, data: ReportData): Sheet[] {
  switch (type) {
    case 'sales': {
      const d = data as SalesReport;
      return [
        kvSheet('Ringkasan', [
          ['Jumlah order lunas', d.summary.orders],
          ['Omzet kotor', d.summary.grossSales],
          ['Diskon', d.summary.discount],
          ['Omzet bersih', d.summary.netSales],
          ['Rata-rata per order', d.summary.avgOrder],
          ['HPP', d.summary.hpp],
          ['Laba kotor', d.summary.grossProfit],
          ['Void (order / nominal)', `${d.excluded.voided.count} / ${d.excluded.voided.amount}`],
          ['Ditolak', d.excluded.rejected.count],
          ['Dibatalkan', d.excluded.cancelled.count],
        ]),
        {
          name: 'Per hari',
          columns: [
            { key: 'date', header: 'Tanggal' },
            { key: 'orders', header: 'Order' },
            { key: 'netSales', header: 'Omzet bersih', money: true },
            { key: 'grossProfit', header: 'Laba kotor', money: true },
          ],
          rows: d.byDay.map((r) => ({ ...r })),
        },
        amountSheet('Per metode bayar', d.byMethod),
        amountSheet('Per sumber', d.bySource),
        amountSheet('Per staff', d.byStaff),
        {
          name: 'Per jam',
          columns: [
            { key: 'hour', header: 'Jam' },
            { key: 'count', header: 'Order' },
            { key: 'amount', header: 'Omzet', money: true },
          ],
          rows: d.byHour
            .filter((h) => h.count > 0)
            .map((h) => ({ ...h, hour: `${String(h.hour).padStart(2, '0')}:00` })),
        },
      ];
    }
    case 'profit-loss': {
      const d = data as ProfitLossReport;
      const plCols: Column[] = [
        { key: 'period', header: 'Periode' },
        { key: 'netSales', header: 'Omzet bersih', money: true },
        { key: 'hpp', header: 'HPP', money: true },
        { key: 'grossProfit', header: 'Laba kotor', money: true },
        { key: 'expenses', header: 'Pengeluaran', money: true },
        { key: 'waste', header: 'Waste', money: true },
        { key: 'netProfit', header: 'Laba bersih', money: true },
      ];
      return [
        {
          name: 'Laba rugi',
          columns: plCols,
          rows: [...d.byMonth, d.total].map((r) => ({ ...r })),
        },
        kvSheet('Margin', [
          ['Margin kotor %', d.total.grossMarginPct],
          ['Margin bersih %', d.total.netMarginPct],
        ]),
        amountSheet('Pengeluaran', d.expensesByCategory),
      ];
    }
    case 'product-profit': {
      const d = data as ProductProfitReport;
      return [
        productSheet('Per produk', d.byProduct),
        productSheet('Per varian', d.byVariant),
        productSheet('Per kategori', d.byCategory),
      ];
    }
    case 'top-products': {
      const d = data as TopProductsReport;
      return [productSheet('Produk terlaris', d.rows)];
    }
    case 'cashflow': {
      const d = data as CashflowReport;
      return [
        {
          name: 'Arus kas harian',
          columns: [
            { key: 'date', header: 'Tanggal' },
            { key: 'inflow', header: 'Kas masuk', money: true },
            { key: 'outflow', header: 'Kas keluar', money: true },
            { key: 'net', header: 'Bersih', money: true },
          ],
          rows: d.byDay.map((r) => ({ ...r })),
        },
        amountSheet('Masuk per metode', d.inflow.byMethod),
        amountSheet('Keluar: pengeluaran', d.outflow.expenses),
        kvSheet('Ringkasan', [
          ['Kas masuk', d.inflow.total],
          ['Belanja bahan', d.outflow.purchases],
          ['Kas keluar total', d.outflow.total],
          ['Arus kas bersih', d.net],
          ['Jumlah shift', d.cashDrawer.sessions],
          ['Selisih kas laci', d.cashDrawer.difference],
        ]),
      ];
    }
    case 'stock-movements': {
      const d = data as StockMovementReport;
      return [
        {
          name: 'Mutasi stok',
          columns: [
            { key: 'itemName', header: 'Item' },
            { key: 'type', header: 'Tipe' },
            { key: 'count', header: 'Transaksi' },
            { key: 'qty', header: 'Qty' },
            { key: 'unit', header: 'Satuan' },
            { key: 'value', header: 'Nilai', money: true },
          ],
          rows: d.rows.map((r) => ({ ...r, type: MOVEMENT_LABEL[r.type] })),
        },
      ];
    }
    case 'shifts':
      return [shiftSheet((data as { sessions: CashSessionView[] }).sessions)];
    case 'qr-service': {
      const d = data as QrServiceReport;
      return [
        kvSheet('Ringkasan', [
          ['Order QR', d.orders],
          ['Lunas', d.paid],
          ['Ditolak', d.rejected],
          ['Dibatalkan', d.cancelled],
          ['Omzet', d.revenue],
          ['Rata-rata pesan → bayar (menit)', d.avgMinutes.orderToPaid],
          ['Rata-rata bayar → siap (menit)', d.avgMinutes.paidToReady],
          ['Rata-rata siap → diserahkan (menit)', d.avgMinutes.readyToHanded],
          ['Rata-rata total (menit)', d.avgMinutes.total],
        ]),
        {
          name: 'Per hari',
          columns: [
            { key: 'date', header: 'Tanggal' },
            { key: 'orders', header: 'Order' },
            { key: 'revenue', header: 'Omzet', money: true },
          ],
          rows: d.byDay.map((r) => ({ ...r })),
        },
      ];
    }
    case 'daily-closing': {
      const d = data as DailyClosingReport;
      return [
        kvSheet('Rekap harian', [
          ['Tanggal', d.date],
          ['Order lunas', d.summary.orders],
          ['Omzet bersih', d.summary.netSales],
          ['Diskon', d.summary.discount],
          ['HPP', d.summary.hpp],
          ['Laba kotor', d.summary.grossProfit],
          ['Pengeluaran', d.expenses.total],
          ['Waste', d.waste],
          ['Laba bersih', d.netProfit],
          ['Belanja bahan', d.purchases],
          ['Void', `${d.excluded.voided.count} / ${d.excluded.voided.amount}`],
          ['Order menunggu', d.pending],
        ]),
        amountSheet('Per metode bayar', d.byMethod),
        amountSheet('Per kategori', d.byCategory),
        amountSheet('Pengeluaran', d.expenses.byCategory),
        shiftSheet(d.shifts),
      ];
    }
  }
}

function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Cegah formula injection saat dibuka di spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof value === 'string' ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV UTF-8 (dengan BOM agar Excel membaca huruf dengan benar); tiap lembar dipisah baris kosong. */
export function toCsv(sheets: Sheet[]): string {
  const blocks = sheets.map((sheet) =>
    [
      ...(sheets.length > 1 ? [csvCell(sheet.name)] : []),
      sheet.columns.map((c) => csvCell(c.header)).join(','),
      ...sheet.rows.map((row) => sheet.columns.map((c) => csvCell(row[c.key])).join(',')),
    ].join('\r\n'),
  );
  return `${'\uFEFF'}${blocks.join('\r\n\r\n')}\r\n`;
}

export async function toXlsx(type: ReportType, sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bekuin POS';
  wb.title = REPORT_LABEL[type];
  for (const sheet of sheets) {
    // Nama sheet Excel maksimal 31 karakter & tanpa karakter khusus.
    const ws = wb.addWorksheet(sheet.name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31));
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.max(12, c.header.length + 4),
      style: c.money ? { numFmt: '"Rp"#,##0;[Red]-"Rp"#,##0' } : {},
    }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of sheet.rows) ws.addRow(row);
    const first = sheet.columns[0];
    if (first) ws.getColumn(first.key).width = 28;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
