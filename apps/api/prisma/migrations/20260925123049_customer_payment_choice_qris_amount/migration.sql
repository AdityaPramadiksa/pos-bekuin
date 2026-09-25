-- Pilihan bayar pelanggan QR kini diatur per metode bayar ("Tampil di QR pelanggan"),
-- menggantikan mode QRIS_ONLY / QRIS_OR_CASHIER. Cash ikut ditampilkan (QRIS atau Cash).
UPDATE "payment_methods" SET "showToCustomer" = true WHERE "type" = 'CASH';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "uniqueCode" INTEGER;

-- AlterTable
ALTER TABLE "settings" DROP COLUMN "qrPaymentMode",
ADD COLUMN     "qrisPayload" TEXT;

-- DropEnum
DROP TYPE "QrPaymentMode";
