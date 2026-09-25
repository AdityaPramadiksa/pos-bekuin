import { type AutoApprovedEvent, formatRupiah, type OrderEvent } from '@bekuin/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { autoPrintOrder } from '@/features/printer/auto-print';
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
      void queryClient.invalidateQueries({ queryKey: ['processing'] });
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
          toast.success(`${e.orderNo} disetujui, sedang diproses`, { description: e.label });
        if (e.status === 'REJECTED')
          toast.error(`${e.orderNo} ditolak admin`, { description: e.label });
      }
      if (role === 'ADMIN' && e.source === 'QR_TABLE' && e.status === 'PENDING') playChime();
    });
    socket.on('order.fulfillment', refreshOrders);
    // QRIS terdeteksi dari notifikasi DANA → order otomatis diproses: bunyi + cetak struk.
    socket.on('order.autoApproved', async (e: AutoApprovedEvent) => {
      refreshOrders();
      if (role !== 'ADMIN') return;
      playChime();
      setTimeout(playChime, 600);
      const title = `QRIS masuk ${formatRupiah(e.amount)} · ${e.orderNo} diproses`;
      try {
        const printed = await autoPrintOrder(e.orderId);
        toast.success(title, {
          description: printed
            ? 'Struk dicetak otomatis'
            : 'Printer belum terhubung di perangkat ini',
          duration: 10_000,
        });
      } catch (error) {
        toast.warning(title, {
          description: `Struk gagal dicetak: ${error instanceof Error ? error.message : ''}`,
          duration: 10_000,
        });
      }
    });
    socket.on('payment.notification', () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-notifications'] });
    });
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
