-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- AlterEnum
ALTER TYPE "OrderSource" ADD VALUE 'ONLINE';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "deliveryFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryMethod" "DeliveryMethod";

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "deliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deliveryFee" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "freeDeliveryMin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onlineOrderToken" TEXT,
ADD COLUMN     "onlineOrderingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "settings_onlineOrderToken_key" ON "settings"("onlineOrderToken");

