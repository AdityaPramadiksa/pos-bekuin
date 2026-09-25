import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout, RequireAuth } from '@/layouts/AppLayout';
import { HomeRedirect } from '@/layouts/HomeRedirect';
import { lazyPage } from '@/lib/lazy-page';

export const router = createBrowserRouter([
  { path: '/', element: <HomeRedirect /> },
  { path: '/login', element: lazyPage(() => import('@/features/auth/LoginPage'), 'LoginPage') },

  // ── Publik: pelanggan scan QR meja / buka link order online ──
  {
    path: '/m/:qrToken',
    element: lazyPage(() => import('@/features/customer/CustomerMenuPage'), 'CustomerMenuPage'),
  },
  {
    path: '/pesan/:token',
    element: lazyPage(() => import('@/features/customer/CustomerMenuPage'), 'OnlineOrderPage'),
  },
  {
    path: '/o/:publicToken',
    element: lazyPage(() => import('@/features/customer/OrderTrackingPage'), 'OrderTrackingPage'),
  },

  {
    element: <RequireAuth />,
    children: [
      {
        path: '/ganti-password',
        element: lazyPage(() => import('@/features/auth/ChangePasswordPage'), 'ChangePasswordPage'),
      },
      {
        path: '/staff',
        element: <RequireAuth roles={['STAFF']} />,
        children: [
          {
            element: <AppLayout role="STAFF" />,
            children: [
              { index: true, element: <Navigate to="order" replace /> },
              {
                path: 'order',
                element: lazyPage(
                  () => import('@/features/staff/StaffOrderPage'),
                  'StaffOrderPage',
                ),
              },
              {
                path: 'history',
                element: lazyPage(
                  () => import('@/features/staff/StaffHistoryPage'),
                  'StaffHistoryPage',
                ),
              },
              {
                path: 'dapur',
                element: lazyPage(() => import('@/features/kitchen/KitchenPage'), 'KitchenPage'),
              },
              {
                path: 'akun',
                element: lazyPage(() => import('@/features/auth/AccountPage'), 'AccountPage'),
              },
            ],
          },
        ],
      },
      {
        // Halaman cetak tanpa layout (A4)
        path: '/cetak',
        element: <RequireAuth roles={['ADMIN']} />,
        children: [
          {
            path: 'qr-meja',
            element: lazyPage(() => import('@/features/admin/tables/PrintQrPage'), 'PrintQrPage'),
          },
        ],
      },
      {
        path: '/admin',
        element: <RequireAuth roles={['ADMIN']} />,
        children: [
          {
            element: <AppLayout role="ADMIN" />,
            children: [
              {
                index: true,
                element: lazyPage(
                  () => import('@/features/admin/AdminDashboardPage'),
                  'AdminDashboardPage',
                ),
              },
              {
                path: 'approval',
                element: lazyPage(
                  () => import('@/features/admin/approval/ApprovalPage'),
                  'ApprovalPage',
                ),
              },
              {
                path: 'order',
                element: lazyPage(() => import('@/features/admin/orders/OrdersPage'), 'OrdersPage'),
              },
              {
                path: 'order/baru',
                element: lazyPage(
                  () => import('@/features/admin/orders/AdminNewOrderPage'),
                  'AdminNewOrderPage',
                ),
              },
              {
                path: 'order/dapur',
                element: lazyPage(() => import('@/features/kitchen/KitchenPage'), 'KitchenPage'),
              },
              {
                path: 'order/tempel',
                element: lazyPage(() => import('@/features/preorder/PastePage'), 'PastePage'),
              },
              {
                path: 'order/rekap',
                element: lazyPage(
                  () => import('@/features/preorder/ProductionPlanPage'),
                  'ProductionPlanPage',
                ),
              },
              {
                path: 'order/packing',
                element: lazyPage(() => import('@/features/preorder/PackingPage'), 'PackingPage'),
              },
              {
                path: 'stok',
                element: lazyPage(() => import('@/features/admin/stock/StockPage'), 'StockPage'),
              },
              {
                path: 'lainnya',
                element: lazyPage(() => import('@/features/admin/AdminMorePage'), 'AdminMorePage'),
              },
              {
                path: 'lainnya/menu',
                element: lazyPage(() => import('@/features/admin/menu/MenuPage'), 'MenuPage'),
              },
              {
                path: 'lainnya/pengguna',
                element: lazyPage(() => import('@/features/admin/users/UsersPage'), 'UsersPage'),
              },
              {
                path: 'lainnya/order-online',
                element: lazyPage(
                  () => import('@/features/admin/online/OnlineLinkPage'),
                  'OnlineLinkPage',
                ),
              },
              {
                path: 'lainnya/meja',
                element: lazyPage(() => import('@/features/admin/tables/TablesPage'), 'TablesPage'),
              },
              {
                path: 'lainnya/resep',
                element: lazyPage(
                  () => import('@/features/admin/recipes/RecipesPage'),
                  'RecipesPage',
                ),
              },
              {
                path: 'lainnya/pelanggan',
                element: lazyPage(
                  () => import('@/features/admin/customers/CustomersPage'),
                  'CustomersPage',
                ),
              },
              {
                path: 'lainnya/keuangan',
                element: lazyPage(() => import('@/features/finance/FinancePage'), 'FinancePage'),
              },
              {
                path: 'lainnya/laporan',
                element: lazyPage(() => import('@/features/reports/ReportsPage'), 'ReportsPage'),
              },
              {
                path: 'lainnya/pengaturan',
                element: lazyPage(
                  () => import('@/features/admin/settings/SettingsPage'),
                  'SettingsPage',
                ),
              },
              {
                path: 'lainnya/metode-bayar',
                element: lazyPage(
                  () => import('@/features/admin/settings/PaymentMethodsPage'),
                  'PaymentMethodsPage',
                ),
              },
              {
                path: 'lainnya/printer',
                element: lazyPage(() => import('@/features/printer/PrinterPage'), 'PrinterPage'),
              },
              {
                path: 'lainnya/akun',
                element: lazyPage(() => import('@/features/auth/AccountPage'), 'AccountPage'),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
