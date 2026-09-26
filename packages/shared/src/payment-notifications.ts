/** Notifikasi uang masuk e-wallet (DANA) yang diteruskan MacroDroid dari HP admin. */
export type PaymentNotificationResult =
  'RECEIVED' | 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS' | 'IGNORED' | 'FAILED';

export const PAYMENT_NOTIFICATION_RESULT_LABEL: Record<PaymentNotificationResult, string> = {
  RECEIVED: 'Uang masuk, belum dipakai order',
  MATCHED: 'Dipakai untuk order',
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

/** Rekening tujuan Transfer (admin). */
export interface BankAccountView {
  id: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isActive: boolean;
  sortOrder: number;
}
