import type { Role } from '@bekuin/shared';
import {
  BarChart3,
  ChefHat,
  ClipboardCheck,
  History,
  LayoutDashboard,
  Menu,
  Package,
  ShoppingBasket,
  UserRound,
} from 'lucide-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useOrders } from '@/lib/queries';
import { useRealtime } from '@/lib/useRealtime';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { BottomNav } from './BottomNav';
import { isNavItemActive, type NavItem } from './nav';

// PRD bagian 4. Admin (v2.7): Diproses dibuka dari halaman Order, jadi tidak jadi tab sendiri.
const NAV: Record<Role, NavItem[]> = {
  STAFF: [
    { to: '/staff/order', label: 'Order Baru', icon: ShoppingBasket },
    { to: '/staff/history', label: 'History', icon: History },
    { to: '/staff/diproses', label: 'Diproses', icon: ChefHat },
    { to: '/staff/akun', label: 'Akun', icon: UserRound },
  ],
  ADMIN: [
    { to: '/admin', label: 'Beranda', icon: LayoutDashboard, end: true },
    { to: '/admin/approval', label: 'Approval', icon: ClipboardCheck },
    { to: '/admin/order', label: 'Order', icon: BarChart3, alsoActive: ['/admin/diproses'] },
    { to: '/admin/stok', label: 'Stok', icon: Package },
    { to: '/admin/lainnya', label: 'Lainnya', icon: Menu },
  ],
};

/** Pastikan sudah login (dan role cocok bila `roles` diisi). */
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/ganti-password') {
    return <Navigate to="/ganti-password" replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Jumlah order PENDING untuk badge tab Approval (admin). */
function usePendingCount(enabled: boolean) {
  const pending = useOrders({ status: 'PENDING', limit: 1 }, { refetchInterval: 60_000 });
  return enabled ? (pending.data?.total ?? 0) : 0;
}

/** Bottom tab bar di HP, sidebar di tablet/desktop (mode POS kasir). */
export function AppLayout({ role }: { role: Role }) {
  const items = NAV[role];
  const user = useAuthStore((s) => s.user);
  const { pathname } = useLocation();
  useRealtime();
  const pendingCount = usePendingCount(role === 'ADMIN');
  const activeIndex = items.findIndex((item) => isNavItemActive(item, pathname));
  const badge = (to: string, placement: 'icon' | 'circle' | 'sidebar') =>
    to === '/admin/approval' && pendingCount > 0 ? (
      <span
        className={cn(
          'min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-bold',
          placement === 'sidebar'
            ? 'bg-brand-700 ml-auto text-xs text-white'
            : placement === 'circle'
              ? 'text-brand-700 ring-brand-700 absolute -top-1 -right-1 bg-white ring-2'
              : 'bg-brand-700 absolute -top-1 -right-2 text-white',
        )}
      >
        {pendingCount}
      </span>
    ) : null;

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
        <div className="px-5 py-5">
          <p className="text-brand-700 text-lg font-bold">Bekuin POS</p>
          <p className="text-xs text-stone-500">
            {user?.name} · {role === 'ADMIN' ? 'Admin' : 'Staff'}
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item, i) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={i === activeIndex ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                i === activeIndex
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-stone-600 hover:bg-stone-100',
              )}
            >
              <item.icon className="size-5" />
              {item.label}
              {badge(item.to, 'sidebar')}
            </Link>
          ))}
        </nav>
      </aside>

      {/* pb-28: ruang untuk navbar bawah + bulatan yang menonjol di atasnya */}
      <main className="min-w-0 flex-1 pb-28 md:pb-0">
        <Outlet />
      </main>

      <BottomNav items={items} activeIndex={activeIndex} badge={badge} />
    </div>
  );
}
