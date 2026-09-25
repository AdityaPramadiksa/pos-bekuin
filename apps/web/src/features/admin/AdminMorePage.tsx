import {
  BookOpen,
  ChevronRight,
  Cog,
  CreditCard,
  type LucideIcon,
  Printer,
  QrCode,
  ReceiptText,
  UserRound,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';

interface MenuLink {
  label: string;
  description: string;
  icon: LucideIcon;
  to?: string;
  sprint?: string;
}

const SECTIONS: { title: string; items: MenuLink[] }[] = [
  {
    title: 'Master Data',
    items: [
      {
        label: 'Menu & Harga',
        description: 'Kategori, produk, varian, foto, tandai habis',
        icon: UtensilsCrossed,
        to: '/admin/lainnya/menu',
      },
      {
        label: 'Metode Bayar',
        description: 'Cash, Transfer, QRIS, e-wallet',
        icon: CreditCard,
        to: '/admin/lainnya/metode-bayar',
      },
      {
        label: 'Meja & QR',
        description: 'Kelola meja, cetak QR self-order',
        icon: QrCode,
        sprint: 'Sprint 3',
      },
      {
        label: 'Bahan, Resep & HPP',
        description: 'Bahan baku, resep bertingkat, kemasan',
        icon: BookOpen,
        sprint: 'Sprint 4',
      },
      {
        label: 'Pelanggan & Alias',
        description: 'Data pelanggan, alias produk parser',
        icon: Users,
        sprint: 'Sprint 6',
      },
    ],
  },
  {
    title: 'Keuangan',
    items: [
      {
        label: 'Pengeluaran & Shift Kasir',
        description: 'Biaya operasional, buka/tutup kasir',
        icon: Wallet,
        sprint: 'Sprint 7',
      },
      {
        label: 'Laporan',
        description: 'Penjualan, laba rugi, arus kas, export',
        icon: ReceiptText,
        sprint: 'Sprint 7',
      },
    ],
  },
  {
    title: 'Sistem',
    items: [
      {
        label: 'Pengguna',
        description: 'Akun staff dan admin',
        icon: Users,
        to: '/admin/lainnya/pengguna',
      },
      {
        label: 'Pengaturan Toko',
        description: 'Info toko, struk, QRIS, jam buka, self-order',
        icon: Cog,
        to: '/admin/lainnya/pengaturan',
      },
      {
        label: 'Printer',
        description: 'Pairing printer Bluetooth 58mm, tes print',
        icon: Printer,
        to: '/admin/lainnya/printer',
      },
      {
        label: 'Akun',
        description: 'Ganti password, keluar',
        icon: UserRound,
        to: '/admin/lainnya/akun',
      },
    ],
  },
];

export function AdminMorePage() {
  return (
    <>
      <PageHeader title="Lainnya" />
      <div className="mx-auto max-w-xl space-y-5 p-4 md:p-6">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
              {section.title}
            </h2>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
              {section.items.map((item) => {
                const content = (
                  <>
                    <item.icon className="size-5 shrink-0 text-stone-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="truncate text-xs text-stone-500">{item.description}</p>
                    </div>
                    {item.to ? (
                      <ChevronRight className="size-4 text-stone-400" />
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        {item.sprint}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={item.label}>
                    {item.to ? (
                      <Link to={item.to} className="flex items-center gap-3 p-4 hover:bg-stone-50">
                        {content}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 p-4 opacity-80">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
