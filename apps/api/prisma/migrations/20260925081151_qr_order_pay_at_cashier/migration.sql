-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payAtCashier" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "orders_tableId_status_idx" ON "orders"("tableId", "status");

-- CreateIndex
CREATE INDEX "orders_fulfillmentStatus_status_idx" ON "orders"("fulfillmentStatus", "status");
