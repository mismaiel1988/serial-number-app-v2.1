import prisma from "../db.server";

/**
 * Check if order contains saddle products
 */
function hasSaddleProducts(order) {
  return order.line_items?.some(item => {
    const tags = item.product?.tags || [];
    return tags.some(tag => tag.toLowerCase() === "saddles");
  });
}

/**
 * Process order webhook (create, update, or cancel)
 */
export async function processOrderWebhook(orderData, eventType, shop) {
  console.log(`Processing ${eventType} webhook for order ${orderData.name}`);
  
  // Check if order has saddles
  const hasSaddles = hasSaddleProducts(orderData);
  
  if (!hasSaddles) {
    console.log(`Order ${orderData.name} has no saddles, skipping`);
    return { skipped: true, reason: "no_saddles" };
  }
  
  const shopifyOrderId = `gid://shopify/Order/${orderData.id}`;
  
  // Handle cancellation
  if (eventType === "cancelled") {
    const existingOrder = await prisma.order.findUnique({
      where: { shopifyOrderId }
    });
    
    if (existingOrder) {
      await prisma.order.update({
        where: { shopifyOrderId },
        data: {
          financialStatus: "CANCELLED",
          fulfillmentStatus: "CANCELLED",
          note: `${existingOrder.note || ""}\n[CANCELLED via webhook]`.trim(),
          lastSyncedAt: new Date()
        }
      });
      console.log(`Order ${orderData.name} marked as cancelled`);
    }
    
    return { success: true, action: "cancelled" };
  }
  
  // Upsert order
  const dbOrder = await prisma.order.upsert({
    where: { shopifyOrderId },
    update: {
      orderNumber: orderData.order_number?.toString() || orderData.name,
      orderName: orderData.name,
      updatedAt: new Date(orderData.updated_at),
      fulfillmentStatus: orderData.fulfillment_status?.toUpperCase() || "UNFULFILLED",
      financialStatus: orderData.financial_status?.toUpperCase() || "PENDING",
      customerName: orderData.customer?.first_name && orderData.customer?.last_name
        ? `${orderData.customer.first_name} ${orderData.customer.last_name}`
        : orderData.customer?.email,
      customerEmail: orderData.customer?.email,
      customerPhone: orderData.customer?.phone,
      totalPrice: orderData.total_price,
      currency: orderData.currency,
      tags: orderData.tags,
      note: orderData.note,
      lastSyncedAt: new Date()
    },
    create: {
      shopifyOrderId,
      orderNumber: orderData.order_number?.toString() || orderData.name,
      orderName: orderData.name,
      createdAt: new Date(orderData.created_at),
      fulfillmentStatus: orderData.fulfillment_status?.toUpperCase() || "UNFULFILLED",
      financialStatus: orderData.financial_status?.toUpperCase() || "PENDING",
      customerName: orderData.customer?.first_name && orderData.customer?.last_name
        ? `${orderData.customer.first_name} ${orderData.customer.last_name}`
        : orderData.customer?.email,
      customerEmail: orderData.customer?.email,
      customerPhone: orderData.customer?.phone,
      totalPrice: orderData.total_price,
      currency: orderData.currency,
      tags: orderData.tags,
      note: orderData.note,
      lastSyncedAt: new Date()
    }
  });
  
  console.log(`Order ${orderData.name} upserted to database`);
  
  // Process line items
  for (const lineItem of orderData.line_items || []) {
    const tags = lineItem.product?.tags || [];
    const isSaddle = tags.some(tag => tag.toLowerCase() === "saddles");
    
    if (!isSaddle) continue;
    
    const shopifyLineItemId = `gid://shopify/LineItem/${lineItem.id}`;
    
    // Check if line item already exists
    const existingLineItem = await prisma.lineItem.findUnique({
      where: { shopifyLineItemId },
      include: { serialNumbers: true }
    });
    
    // Upsert line item
    await prisma.lineItem.upsert({
      where: { shopifyLineItemId },
      update: {
        productTitle: lineItem.title,
        variantTitle: lineItem.variant_title,
        sku: lineItem.sku,
        quantity: lineItem.quantity,
        price: lineItem.price,
        isSaddle,
        productType: lineItem.product_type,
        productTags: tags.join(", ")
      },
      create: {
        shopifyLineItemId,
        orderId: dbOrder.id,
        productId: lineItem.product_id ? `gid://shopify/Product/${lineItem.product_id}` : null,
        variantId: lineItem.variant_id ? `gid://shopify/ProductVariant/${lineItem.variant_id}` : null,
        productTitle: lineItem.title,
        variantTitle: lineItem.variant_title,
        sku: lineItem.sku,
        quantity: lineItem.quantity,
        price: lineItem.price,
        isSaddle,
        productType: lineItem.product_type,
        productTags: tags.join(", ")
      }
    });
    
    // Handle quantity changes
    if (existingLineItem && existingLineItem.quantity !== lineItem.quantity) {
      const oldQty = existingLineItem.quantity;
      const newQty = lineItem.quantity;
      const serialCount = existingLineItem.serialNumbers.length;
      
      console.log(`Quantity changed for ${lineItem.title}: ${oldQty} → ${newQty} (${serialCount} serials exist)`);
      
      if (newQty < oldQty && serialCount > newQty) {
        console.warn(`⚠️ Quantity decreased but ${serialCount} serials exist. Manual review needed.`);
        // Don't delete serials - keep for audit trail
      }
    }
    
    console.log(`Line item ${lineItem.title} processed`);
  }
  
  return { success: true, action: eventType, order: orderData.name };
}
