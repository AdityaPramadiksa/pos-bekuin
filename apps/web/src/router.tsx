import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage';
import { AdminMorePage } from '@/features/admin/AdminMorePage';
import { ApprovalPage } from '@/features/admin/approval/ApprovalPage';
import { CustomersPage } from '@/features/admin/customers/CustomersPage';
import { MenuPage } from '@/features/admin/menu/MenuPage';
import { RecipesPage } from '@/features/admin/recipes/RecipesPage';
import { PrintQrPage } from '@/features/admin/tables/PrintQrPage';
import { TablesPage } from '@/features/admin/tables/TablesPage';
import { KitchenPage } from '@/features/kitchen/KitchenPage';
import { PackingPage } from '@/features/preorder/PackingPage';
import { PastePage } from '@/features/preorder/PastePage';
import { ProductionPlanPage } from '@/features/preorder/ProductionPlanPage';
import { AdminNewOrderPage } from '@/features/admin/orders/AdminNewOrderPage';
import { OrdersPage } from '@/features/admin/orders/OrdersPage';
import { StockPage } from '@/features/admin/stock/StockPage';
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
              { path: 'dapur', element: <KitchenPage /> },
              { path: 'akun', element: <AccountPage /> },
            ],
          },
        ],
      },
      {
        // Halaman cetak tanpa layout (A4)
        path: '/cetak',
        element: <RequireAuth roles={['ADMIN']} />,
        children: [{ path: 'qr-meja', element: <PrintQrPage /> }],
      },
      {
        path: '/admin',
        element: <RequireAuth roles={['ADMIN']} />,
        children: [
          {
            element: <AppLayout role="ADMIN" />,
            children: [
              { index: true, element: <AdminDashboardPage /> },
              { path: 'approval', element: <ApprovalPage /> },
              { path: 'order', element: <OrdersPage /> },
              { path: 'order/baru', element: <AdminNewOrderPage /> },
              { path: 'order/dapur', element: <KitchenPage /> },
              { path: 'order/tempel', element: <PastePage /> },
              { path: 'order/rekap', element: <ProductionPlanPage /> },
              { path: 'order/packing', element: <PackingPage /> },
              { path: 'stok', element: <StockPage /> },
              { path: 'lainnya', element: <AdminMorePage /> },
              { path: 'lainnya/menu', element: <MenuPage /> },
              { path: 'lainnya/pengguna', element: <UsersPage /> },
              { path: 'lainnya/meja', element: <TablesPage /> },
              { path: 'lainnya/resep', element: <RecipesPage /> },
              { path: 'lainnya/pelanggan', element: <CustomersPage /> },
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
