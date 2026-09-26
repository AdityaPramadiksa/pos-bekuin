-- v2.4: bayar QRIS tanpa kode unik + wajib bukti bayar, rekening transfer, QR meja dinonaktifkan,
-- notifikasi DANA jadi alat bantu cek (tidak lagi menyetujui order otomatis).

-- AlterEnum
ALTER TYPE "PaymentNotificationResult" ADD VALUE 'RECEIVED';

-- Self-order QR meja dinonaktifkan dulu (bisa diaktifkan lagi lewat pengaturan).
ALTER TABLE "settings" ALTER COLUMN "qrOrderingEnabled" SET DEFAULT false;
UPDATE "settings" SET "qrOrderingEnabled" = false;

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);
