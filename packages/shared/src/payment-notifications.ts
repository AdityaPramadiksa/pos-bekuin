/** Notifikasi uang masuk e-wallet (DANA) yang diteruskan MacroDroid dari HP admin. */
export type PaymentNotificationResult =
  'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS' | 'IGNORED' | 'FAILED';

export const PAYMENT_NOTIFICATION_RESULT_LABEL: Record<PaymentNotificationResult, string> = {
  MATCHED: 'Cocok, otomatis diproses',
  UNMATCHED: 'Tidak ada order yang cocok',
  AMBIGUOUS: 'Lebih dari satu order cocok',
  IGNORED: 'Diabaikan',
  FAILED: 'Cocok, tapi gagal diproses',
};

export interface PaymentNotificationView {
  id: string;
  app: string | null;
  title: string | null;
  text: string;
  amount: number | null;
  result: PaymentNotificationResult;
  message: string | null;
  order: { id: string; orderNo: string; customerName: string | null } | null;
  receivedAt: string;
}

export interface PaymentWebhookSetup {
  /** Path webhook relatif terhadap API, mis. /api/v1/public/payment-notifications/<key>. */
  path: string;
  key: string;
  notifications: PaymentNotificationView[];
}

/** Event realtime ke admin saat QRIS terdeteksi & order otomatis diproses. */
export interface AutoApprovedEvent {
  orderId: string;
  orderNo: string;
  amount: number;
}
