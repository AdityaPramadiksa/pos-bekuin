-- Alur baru: setelah disetujui order "Diproses" (PROCESSING) lalu "Selesai" (DONE).
-- Pembayaran dipisah dari persetujuan: paidAt null = belum dibayar (COD / bayar saat ambil).

-- CreateEnum
CREATE TYPE "PaymentNotificationResult" AS ENUM ('MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'IGNORED', 'FAILED');

-- Kolom baru dulu, supaya data lama bisa dipindahkan sebelum kolom lama dihapus.
ALTER TABLE "orders" ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "paidAt" TIMESTAMP(3);

-- Order yang pernah disetujui sebelum revisi ini selalu langsung lunas.
UPDATE "orders" SET "paidAt" = "approvedAt" WHERE "approvedAt" IS NOT NULL AND "status" IN ('PAID', 'VOIDED');
-- Siap / diserahkan = selesai.
UPDATE "orders" SET "completedAt" = COALESCE("handedOverAt", "readyAt")
WHERE "fulfillmentStatus" IN ('READY', 'HANDED_OVER');

-- AlterEnum: Antre/Disiapkan → Diproses, Siap/Diserahkan → Selesai.
BEGIN;
CREATE TYPE "FulfillmentStatus_new" AS ENUM ('PROCESSING', 'DONE');
ALTER TABLE "orders" ALTER COLUMN "fulfillmentStatus" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "fulfillmentStatus" TYPE "FulfillmentStatus_new" USING (
  CASE WHEN "fulfillmentStatus"::text IN ('READY', 'HANDED_OVER') THEN 'DONE' ELSE 'PROCESSING' END
)::"FulfillmentStatus_new";
ALTER TYPE "FulfillmentStatus" RENAME TO "FulfillmentStatus_old";
ALTER TYPE "FulfillmentStatus_new" RENAME TO "FulfillmentStatus";
DROP TYPE "FulfillmentStatus_old";
ALTER TABLE "orders" ALTER COLUMN "fulfillmentStatus" SET DEFAULT 'PROCESSING';
COMMIT;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "handedOverAt",
DROP COLUMN "preparingAt",
DROP COLUMN "readyAt";

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "paymentWebhookKey" TEXT;

-- CreateTable
CREATE TABLE "payment_notifications" (
    "id" TEXT NOT NULL,
    "app" TEXT,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "amount" INTEGER,
    "result" "PaymentNotificationResult" NOT NULL,
    "message" TEXT,
    "orderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_notifications_receivedAt_idx" ON "payment_notifications"("receivedAt");

-- CreateIndex
CREATE INDEX "orders_status_paidAt_idx" ON "orders"("status", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "settings_paymentWebhookKey_key" ON "settings"("paymentWebhookKey");

-- AddForeignKey
ALTER TABLE "payment_notifications" ADD CONSTRAINT "payment_notifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mutasi stok otomatis (QRIS terdeteksi) tidak punya user pelaku.
ALTER TABLE "stock_movements" ALTER COLUMN "userId" DROP NOT NULL;
