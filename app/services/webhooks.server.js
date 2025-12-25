import prisma from "../db.server";
import shopify from "../shopify.server";

/**
 * Fetch product tags from Shopify API
 */
async function getProductTags(productId, shop) {
  try {
    // Get session for the shop
    const sessionId = `offline_${shop}`;
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    });
    
    if (!session) {
      console.error("No session found for shop:", shop);
      return [];
    }
    
    // Create REST client
    const client = new shopify.clients.Rest({ session });
    
    // Fetch product
    const response = await client.get({
      path: `products/${productId}`
    });
    
    const tags = response.body.product?.tags || "";
    return tags.split(",").map(tag => tag.trim());
  } catch (error) {
    console.error("Error fetching product tags:", error.message);
    return [];
  }
}

/**
 * Check if order contains saddle products
 */
async function hasSaddleProducts(order, shop) {
  for (const item of order.line_items || []) {
    if (!item.product_id) continue;
    
    const tags = await getProductTags(item.product_id, shop);
    const isSaddle = tags.some(tag => tag.toLowerCase() === "saddles");
    
    if (isSaddle) {
      return true;
    }
  }
  
  return false;
}

/**
 * Process order webhook (create, update, or cancel)
 */
export async function processOrderWebhook(orderData, eventType, shop) {
  console.log(`Processing ${eventType} webhook for order ${orderData.name}`);
  
  // Check if order has saddles (fetch tags from API)
  const hasSaddles = await hasSaddleProducts(orderData, shop);
  
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
    if (!lineItem.product_id) continue;
    
    // Fetch product tags from API
    const tags = await getProductTags(lineItem.product_id, shop);
    const isSaddle = tags.some(tag => tag.toLowerCase() === "saddles");
    
    if (!isSaddle) continue;
    
    const shopifyLineItemId = `gid://shopify/LineItem/${lineItem.id}`;
    
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
    
    console.log(`Line item ${lineItem.title} (${lineItem.sku}) processed`);
  }
  
  return { success: true, action: eventType, orderId: dbOrder.id };
}
