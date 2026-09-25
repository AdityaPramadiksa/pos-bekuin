import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminApprovalPage } from '@/features/admin/AdminApprovalPage';
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage';
import { AdminMorePage } from '@/features/admin/AdminMorePage';
import { AdminOrdersPage } from '@/features/admin/AdminOrdersPage';
import { AdminStockPage } from '@/features/admin/AdminStockPage';
import { MenuPage } from '@/features/admin/menu/MenuPage';
import { PaymentMethodsPage } from '@/features/admin/settings/PaymentMethodsPage';
import { SettingsPage } from '@/features/admin/settings/SettingsPage';
import { UsersPage } from '@/features/admin/users/UsersPage';
import { AccountPage } from '@/features/auth/AccountPage';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { CustomerMenuPage } from '@/features/customer/CustomerMenuPage';
import { OrderTrackingPage } from '@/features/customer/OrderTrackingPage';
import { PrinterPage } from '@/features/printer/PrinterPage';
import { StaffHistoryPage } from '@/features/staff/StaffHistoryPage';
import { StaffOrderPage } from '@/features/staff/StaffOrderPage';
import { AppLayout, RequireAuth } from '@/layouts/AppLayout';
import { HomeRedirect } from '@/layouts/HomeRedirect';

export const router = createBrowserRouter([
  { path: '/', element: <HomeRedirect /> },
  { path: '/login', element: <LoginPage /> },

  // ── Publik: pelanggan scan QR meja ──
  { path: '/m/:qrToken', element: <CustomerMenuPage /> },
  { path: '/o/:publicToken', element: <OrderTrackingPage /> },

  {
    element: <RequireAuth />,
    children: [
      { path: '/ganti-password', element: <ChangePasswordPage /> },
      {
        path: '/staff',
        element: <RequireAuth roles={['STAFF']} />,
        children: [
          {
            element: <AppLayout role="STAFF" />,
            children: [
              { index: true, element: <Navigate to="order" replace /> },
              { path: 'order', element: <StaffOrderPage /> },
              { path: 'history', element: <StaffHistoryPage /> },
              { path: 'akun', element: <AccountPage /> },
            ],
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
              { index: true, element: <AdminDashboardPage /> },
              { path: 'approval', element: <AdminApprovalPage /> },
              { path: 'order', element: <AdminOrdersPage /> },
              { path: 'stok', element: <AdminStockPage /> },
              { path: 'lainnya', element: <AdminMorePage /> },
              { path: 'lainnya/menu', element: <MenuPage /> },
              { path: 'lainnya/pengguna', element: <UsersPage /> },
              { path: 'lainnya/pengaturan', element: <SettingsPage /> },
              { path: 'lainnya/metode-bayar', element: <PaymentMethodsPage /> },
              { path: 'lainnya/printer', element: <PrinterPage /> },
              { path: 'lainnya/akun', element: <AccountPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
