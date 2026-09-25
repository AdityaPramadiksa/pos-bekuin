import type { OrderEvent } from '@bekuin/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';
import { api } from './api';
import { createSocket, playChime } from './socket';

/**
 * Sambungan realtime untuk staff/admin yang login: event dari server hanya memicu
 * muat ulang data (TanStack Query), plus bunyi & toast untuk order baru di admin.
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (!userId) return;
    const socket = createSocket(() => useAuthStore.getState().accessToken);
    const refreshOrders = () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen'] });
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
    };

    socket.on('order.created', (e: OrderEvent) => {
      refreshOrders();
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      if (role === 'ADMIN' && e.createdById !== userId) {
        playChime();
        toast.info(`Order baru ${e.orderNo}`, { description: e.label });
      }
    });
    socket.on('order.updated', (e: OrderEvent) => {
      refreshOrders();
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      if (role === 'STAFF' && e.createdById === userId) {
        if (e.status === 'PAID')
          toast.success(`${e.orderNo} sudah dibayar`, { description: e.label });
        if (e.status === 'REJECTED')
          toast.error(`${e.orderNo} ditolak admin`, { description: e.label });
      }
      if (role === 'ADMIN' && e.source === 'QR_TABLE' && e.status === 'PENDING') playChime();
    });
    socket.on('order.fulfillment', refreshOrders);
    socket.on('finance.changed', () => {
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    });
    socket.on('stock.changed', () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    });
    // Token kedaluwarsa: panggil API sekali (interceptor me-refresh token), lalu sambung ulang.
    socket.on('connect_error', async (err) => {
      if (err.message !== 'unauthorized') return;
      await api.get('/auth/me').catch(() => undefined);
      setTimeout(() => socket.connect(), 1000);
    });
    // Tersambung ulang setelah putus: data mungkin tertinggal.
    socket.io.on('reconnect', refreshOrders);

    return () => {
      socket.disconnect();
    };
  }, [userId, role, queryClient]);
}
