import type { Role } from '@bekuin/shared';
import {
  BarChart3,
  ClipboardCheck,
  History,
  LayoutDashboard,
  type LucideIcon,
  Menu,
  Package,
  ShoppingBasket,
  UserRound,
} from 'lucide-react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOrders } from '@/lib/queries';
import { useRealtime } from '@/lib/useRealtime';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// PRD bagian 4: Staff 3 tab, Admin 5 tab.
const NAV: Record<Role, NavItem[]> = {
  STAFF: [
    { to: '/staff/order', label: 'Order Baru', icon: ShoppingBasket },
    { to: '/staff/history', label: 'History', icon: History },
    { to: '/staff/akun', label: 'Akun', icon: UserRound },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/approval', label: 'Approval', icon: ClipboardCheck },
    { to: '/admin/order', label: 'Order', icon: BarChart3 },
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

/** Bottom tab bar di HP, sidebar di tablet/desktop (mode POS kasir). */
/** Jumlah order PENDING untuk badge tab Approval (admin). */
function usePendingCount(enabled: boolean) {
  const pending = useOrders({ status: 'PENDING', limit: 1 }, { refetchInterval: 60_000 });
  return enabled ? (pending.data?.total ?? 0) : 0;
}

export function AppLayout({ role }: { role: Role }) {
  const items = NAV[role];
  const user = useAuthStore((s) => s.user);
  useRealtime();
  const pendingCount = usePendingCount(role === 'ADMIN');
  const badge = (to: string) =>
    to === '/admin/approval' && pendingCount > 0 ? (
      <span className="bg-brand-700 absolute -top-1 -right-2 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-bold text-white md:static md:ml-auto md:text-xs">
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
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:bg-stone-100',
                )
              }
            >
              <item.icon className="size-5" />
              {item.label}
              {badge(item.to)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white md:hidden">
        <ul className="flex">
          {items.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                    isActive ? 'text-brand-700' : 'text-stone-500',
                  )
                }
              >
                <span className="relative">
                  <item.icon className="size-5" />
                  {badge(item.to)}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
