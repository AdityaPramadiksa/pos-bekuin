-- v2.6: pesanan pelanggan QRIS/Transfer tanpa bukti bayar dibatalkan otomatis (default 24 jam).
ALTER TABLE "settings" ADD COLUMN "unpaidCancelHours" INTEGER NOT NULL DEFAULT 24;
