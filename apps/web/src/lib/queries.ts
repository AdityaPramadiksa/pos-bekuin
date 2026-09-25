import type {
  CashSessionView,
  ExpenseCategoryView,
  ExpenseView,
  ReportType,
  CatalogResponse,
  CustomerView,
  ProductAliasView,
  ProductionPlanView,
  ProcessingView,
  OpnameView,
  ProductionView,
  PurchaseView,
  IngredientView,
  RecipeView,
  IngredientStockView,
  OrderListResponse,
  OrderView,
  ProductStockView,
  StockMovementView,
  TodaySummary,
  PaymentMethodView,
  ProductView,
  SalesCategoryView,
  SettingsView,
  TableView,
  UserView,
} from '@bekuin/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const queryKeys = {
  settings: ['settings'] as const,
  categories: ['sales-categories'] as const,
  products: ['products'] as const,
  catalog: ['catalog'] as const,
  paymentMethods: ['payment-methods'] as const,
  users: ['users'] as const,
};

const get = async <T>(url: string) => (await api.get<T>(url)).data;

export const useSettings = () =>
  useQuery({ queryKey: queryKeys.settings, queryFn: () => get<SettingsView>('/settings') });

export const useCategories = () =>
  useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => get<SalesCategoryView[]>('/sales-categories?includeInactive=true'),
  });

export const useProducts = () =>
  useQuery({
    queryKey: queryKeys.products,
    queryFn: () => get<ProductView[]>('/products?includeInactive=true'),
  });

export const useCatalog = () =>
  useQuery({ queryKey: queryKeys.catalog, queryFn: () => get<CatalogResponse>('/catalog') });

export const usePaymentMethods = (includeInactive = false) =>
  useQuery({
    queryKey: [...queryKeys.paymentMethods, includeInactive],
    queryFn: () => get<PaymentMethodView[]>(`/payment-methods?includeInactive=${includeInactive}`),
  });

export const useUsers = () =>
  useQuery({ queryKey: queryKeys.users, queryFn: () => get<UserView[]>('/users') });

export interface OrderFilters {
  status?: string;
  source?: string;
  dateField?: 'created' | 'delivery' | 'approved';
  from?: string;
  to?: string;
  q?: string;
  mine?: boolean;
  sort?: 'newest' | 'oldest';
  fulfillment?: string;
  paymentMethodId?: string;
  limit?: number;
}

export function useOrders(filters: OrderFilters, options: { refetchInterval?: number } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
  }
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => get<OrderListResponse>(`/orders?${params}`),
    refetchInterval: options.refetchInterval,
  });
}

export const useOrder = (id: string | null) =>
  useQuery({
    queryKey: ['order', id],
    queryFn: () => get<OrderView>(`/orders/${id}`),
    enabled: !!id,
  });

export const useTodaySummary = () =>
  useQuery({
    queryKey: ['reports', 'today'],
    queryFn: () => get<TodaySummary>('/reports/today'),
    refetchInterval: 60_000,
  });

export const useProductStock = () =>
  useQuery({
    queryKey: ['stock', 'products'],
    queryFn: () => get<ProductStockView[]>('/stock/products'),
  });

export const useIngredientStock = (type?: string) =>
  useQuery({
    queryKey: ['stock', 'ingredients', type ?? 'all'],
    queryFn: () => get<IngredientStockView[]>(`/stock/ingredients${type ? `?type=${type}` : ''}`),
  });

export const useStockMovements = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  );
  return useQuery({
    queryKey: ['stock', 'movements', params],
    queryFn: () => get<StockMovementView[]>(`/stock/movements?${search}`),
  });
};

export const useTables = () =>
  useQuery({ queryKey: ['tables'], queryFn: () => get<TableView[]>('/tables') });

export const useIngredients = () =>
  useQuery({
    queryKey: ['ingredients'],
    queryFn: () => get<IngredientView[]>('/ingredients?includeInactive=true'),
  });

export const useRecipes = () =>
  useQuery({ queryKey: ['recipes'], queryFn: () => get<RecipeView[]>('/recipes') });

export const usePurchases = () =>
  useQuery({ queryKey: ['stock', 'purchases'], queryFn: () => get<PurchaseView[]>('/purchases') });
export const useProductions = () =>
  useQuery({
    queryKey: ['stock', 'productions'],
    queryFn: () => get<ProductionView[]>('/productions'),
  });
export const useOpnames = () =>
  useQuery({ queryKey: ['stock', 'opnames'], queryFn: () => get<OpnameView[]>('/opnames') });

export const useCustomers = (q: string) =>
  useQuery({
    queryKey: ['customers', q],
    queryFn: () => get<CustomerView[]>(`/customers?q=${encodeURIComponent(q)}`),
  });

export const useCustomerSuggest = (q: string) =>
  useQuery({
    queryKey: ['customers', 'suggest', q],
    queryFn: () =>
      get<{ id: string; name: string; phone: string | null }[]>(
        `/customers/suggest?q=${encodeURIComponent(q)}`,
      ),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });

export const useAliases = () =>
  useQuery({ queryKey: ['aliases'], queryFn: () => get<ProductAliasView[]>('/product-aliases') });

export const useProductionPlan = (date: string) =>
  useQuery({
    queryKey: ['orders', 'plan', date],
    queryFn: () => get<ProductionPlanView>(`/reports/production-plan?date=${date}`),
  });

export const useExpenseCategories = (all = false) =>
  useQuery({
    queryKey: ['finance', 'expense-categories', all],
    queryFn: () => get<ExpenseCategoryView[]>(`/expense-categories?all=${all}`),
  });

export const useExpenses = (from: string, to: string) =>
  useQuery({
    queryKey: ['finance', 'expenses', from, to],
    queryFn: () => get<ExpenseView[]>(`/expenses?from=${from}&to=${to}`),
  });

export const useCurrentShift = () =>
  useQuery({
    queryKey: ['finance', 'shift', 'current'],
    queryFn: () => get<CashSessionView | null>('/cash-sessions/current'),
  });

export const useShifts = (from: string, to: string) =>
  useQuery({
    queryKey: ['finance', 'shifts', from, to],
    queryFn: () => get<CashSessionView[]>(`/cash-sessions?from=${from}&to=${to}`),
  });

/** Laporan per jenis; `date` khusus rekap harian. */
export const useReport = <T>(type: ReportType, params: { from: string; to: string }) =>
  useQuery({
    queryKey: ['reports', type, params.from, params.to],
    queryFn: () =>
      get<T>(
        type === 'daily-closing'
          ? `/reports/daily-closing?date=${params.from}`
          : `/reports/${type}?from=${params.from}&to=${params.to}`,
      ),
    // Saat ganti periode, tampilan lama tetap (redup) sampai data baru datang — hanya untuk jenis yang sama.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === type ? prev : undefined),
  });

/** Order yang sedang diproses + yang selesai hari ini (halaman Diproses). */
export const useProcessing = () =>
  useQuery({
    queryKey: ['processing'],
    queryFn: async () => (await api.get<ProcessingView>('/processing')).data,
    refetchInterval: 60_000, // cadangan bila koneksi realtime putus
  });
