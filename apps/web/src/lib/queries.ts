import type {
  CatalogResponse,
  PaymentMethodView,
  ProductView,
  SalesCategoryView,
  SettingsView,
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
