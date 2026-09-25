-- CreateIndex
CREATE INDEX "orders_status_approvedAt_idx" ON "orders"("status", "approvedAt");
