-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fulfillmentStatus" TEXT,
    "financialStatus" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "totalPrice" TEXT,
    "currency" TEXT,
    "tags" TEXT,
    "note" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" SERIAL NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" TEXT,
    "isSaddle" BOOLEAN NOT NULL DEFAULT false,
    "productType" TEXT,
    "productTags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialNumber" (
    "id" SERIAL NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "lineItemId" INTEGER NOT NULL,
    "unitIndex" INTEGER NOT NULL,
    "enteredBy" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedToShopify" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "SerialNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopifyOrderId_key" ON "Order"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "Order_shopifyOrderId_idx" ON "Order"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_customerEmail_idx" ON "Order"("customerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "LineItem_shopifyLineItemId_key" ON "LineItem"("shopifyLineItemId");

-- CreateIndex
CREATE INDEX "LineItem_orderId_idx" ON "LineItem"("orderId");

-- CreateIndex
CREATE INDEX "LineItem_shopifyLineItemId_idx" ON "LineItem"("shopifyLineItemId");

-- CreateIndex
CREATE INDEX "LineItem_isSaddle_idx" ON "LineItem"("isSaddle");

-- CreateIndex
CREATE INDEX "LineItem_sku_idx" ON "LineItem"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "SerialNumber_serialNumber_key" ON "SerialNumber"("serialNumber");

-- CreateIndex
CREATE INDEX "SerialNumber_serialNumber_idx" ON "SerialNumber"("serialNumber");

-- CreateIndex
CREATE INDEX "SerialNumber_lineItemId_idx" ON "SerialNumber"("lineItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SerialNumber_lineItemId_unitIndex_key" ON "SerialNumber"("lineItemId", "unitIndex");

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old saddle_orders table if it exists
DROP TABLE IF EXISTS "saddle_orders";
