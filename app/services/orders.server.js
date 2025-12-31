import "@shopify/shopify-api/adapters/node";
import { shopify } from "../shopify.server";
import prisma from "../db.server";

/**
 * PHASE 2: Order Sync Service
 * Fetches orders from Shopify and stores them in PostgreSQL
 */

/**
 * Determines if a line item is a saddle product
 */
function isSaddleProduct(lineItem) {
  const tags = lineItem.product?.tags || [];

  // Check for EXACT "saddles" tag only (case-insensitive)
  const hasSaddleTag = tags.some(tag => tag.toLowerCase() === "saddles");

  return hasSaddleTag;
}

/**
 * Sync orders from Shopify to local database
 */
export async function syncOrdersFromShopify(session, options = {}) {
  const {
    onlySaddleOrders = true,
    sinceDate = "2022-01-01" // Fetch from 2022 onwards
  } = options;

  console.log("=== SYNC STARTED ===");
  console.log("Session:", { shop: session.shop, hasAccessToken: !!session.accessToken });
  console.log("Options:", { onlySaddleOrders, sinceDate });

  try {
    const client = new shopify.clients.Graphql({ session });
    console.log("GraphQL client created successfully");

    let hasNextPage = true;
    let cursor = null;
    let totalOrders = 0;
    let totalLineItems = 0;
    let saddleLineItems = 0;
    let batchNumber = 0;

    while (hasNextPage) {
      batchNumber++;
      console.log(`📦 Fetching batch ${batchNumber} (cursor: ${cursor || 'initial'})...`);

      // Build query with pagination
      const queryString = cursor
        ? `first: 250, after: "${cursor}", sortKey: CREATED_AT, reverse: true`
        : `first: 250, sortKey: CREATED_AT, reverse: true`;

      const query = `
        query GetOrders {
          orders(${queryString}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                name
                createdAt
                updatedAt
                displayFulfillmentStatus
                displayFinancialStatus
                customer {
                  displayName
                  email
                  phone
                }
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                tags
                note
                lineItems(first: 100) {
                  edges {
                    node {
                      id
                      title
                      variantTitle
                      sku
                      quantity
                      originalUnitPriceSet {
                        shopMoney {
                          amount
                        }
                      }
                      product {
                        id
                        productType
                        tags
                      }
                      variant {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      console.log("Executing GraphQL query...");

      let response;
      try {
        // Fetch orders from Shopify
        response = await client.request(query);
        console.log("GraphQL response received");
      } catch (graphqlError) {
        console.error("❌ GraphQL request failed:", graphqlError.message);
        throw graphqlError;
      }

      // Check if response has data
      if (!response?.data?.orders) {
        console.error("❌ Invalid response structure:", JSON.stringify(response, null, 2));
        throw new Error("Invalid GraphQL response - missing orders data");
      }

      const orders = response.data.orders.edges || [];
      console.log(`✅ Fetched ${orders.length} orders in batch ${batchNumber}`);

      if (orders.length === 0) {
        console.log("⚠️ No orders returned in this batch");
        break;
      }

      // Process each order
      let processedInBatch = 0;
      for (const { node: order } of orders) {
        try {
          // Filter by date - skip orders before sinceDate
          const orderDate = new Date(order.createdAt);
          const sinceDateObj = new Date(sinceDate);
          
          if (orderDate < sinceDateObj) {
            console.log(`⏭️ Skipping order ${order.name} - created ${orderDate.toISOString().split('T')[0]} (before ${sinceDate})`);
            continue;
          }

          const lineItems = order.lineItems.edges.map(({ node }) => node);

          // Check if order contains saddles
          const hasSaddles = lineItems.some(isSaddleProduct);

          if (onlySaddleOrders && !hasSaddles) {
            console.log(`⏭️ Skipping order ${order.name} - no saddles`);
            continue;
          }

          console.log(`✅ Processing order ${order.name} (${orderDate.toISOString().split('T')[0]}) with ${lineItems.length} line items`);

          // Upsert order
          const dbOrder = await prisma.order.upsert({
            where: { shopifyOrderId: order.id },
            update: {
              orderNumber: order.name,
              orderName: order.name,
              updatedAt: new Date(order.updatedAt),
              fulfillmentStatus: order.displayFulfillmentStatus,
              financialStatus: order.displayFinancialStatus,
              customerName: order.customer?.displayName,
              customerEmail: order.customer?.email,
              customerPhone: order.customer?.phone,
              totalPrice: order.totalPriceSet?.shopMoney?.amount,
              currency: order.totalPriceSet?.shopMoney?.currencyCode,
              tags: order.tags?.join(", "),
              note: order.note,
              lastSyncedAt: new Date()
            },
            create: {
              shopifyOrderId: order.id,
              orderNumber: order.name,
              orderName: order.name,
              createdAt: new Date(order.createdAt),
              fulfillmentStatus: order.displayFulfillmentStatus,
              financialStatus: order.displayFinancialStatus,
              customerName: order.customer?.displayName,
              customerEmail: order.customer?.email,
              customerPhone: order.customer?.phone,
              totalPrice: order.totalPriceSet?.shopMoney?.amount,
              currency: order.totalPriceSet?.shopMoney?.currencyCode,
              tags: order.tags?.join(", "),
              note: order.note,
              lastSyncedAt: new Date()
            }
          });

          totalOrders++;
          processedInBatch++;
          console.log(`💾 Order ${order.name} saved to database (${processedInBatch} in this batch)`);

          // Upsert line items
          for (const lineItem of lineItems) {
            const isSaddle = isSaddleProduct(lineItem);

            await prisma.lineItem.upsert({
              where: { shopifyLineItemId: lineItem.id },
              update: {
                productTitle: lineItem.title,
                variantTitle: lineItem.variantTitle,
                sku: lineItem.sku,
                quantity: lineItem.quantity,
                price: lineItem.originalUnitPriceSet?.shopMoney?.amount,
                isSaddle,
                productType: lineItem.product?.productType,
                productTags: lineItem.product?.tags?.join(", ")
              },
              create: {
                shopifyLineItemId: lineItem.id,
                orderId: dbOrder.id,
                productId: lineItem.product?.id,
                variantId: lineItem.variant?.id,
                productTitle: lineItem.title,
                variantTitle: lineItem.variantTitle,
                sku: lineItem.sku,
                quantity: lineItem.quantity,
                price: lineItem.originalUnitPriceSet?.shopMoney?.amount,
                isSaddle,
                productType: lineItem.product?.productType,
                productTags: lineItem.product?.tags?.join(", ")
              }
            });

            totalLineItems++;
            if (isSaddle) {
              saddleLineItems++;
              console.log(`  🐴 Saddle line item: ${lineItem.title} (qty: ${lineItem.quantity})`);
            }
          }
        } catch (orderError) {
          console.error(`❌ Error processing order ${order.name}:`, orderError.message);
          // Continue with next order instead of failing entire sync
          continue;
        }
      }

      console.log(`✅ Batch ${batchNumber} processed: ${processedInBatch} orders saved`);

      // Check for next page
      hasNextPage = response.data.orders.pageInfo.hasNextPage;
      cursor = response.data.orders.pageInfo.endCursor;

      console.log(`📄 Pagination: hasNextPage=${hasNextPage}, cursor=${cursor ? cursor.substring(0, 20) + '...' : 'null'}`);

      // Safety limit to prevent infinite loops
      if (batchNumber >= 200) {
        console.warn("⚠️ Reached maximum batch limit (200 batches = 50,000 orders). Stopping sync.");
        break;
      }

      // Small delay to avoid rate limits (Shopify allows ~2 requests/second)
      if (hasNextPage) {
        console.log("⏳ Waiting 500ms before next batch...");
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log("=== SYNC COMPLETE ===");
    console.log(`📊 Total batches: ${batchNumber}`);
    console.log(`📊 Total orders saved: ${totalOrders}`);
    console.log(`📊 Total line items: ${totalLineItems}`);
    console.log(`📊 Saddle line items: ${saddleLineItems}`);

    return {
      success: true,
      totalOrders,
      totalLineItems,
      saddleLineItems,
      batchCount: batchNumber
    };

  } catch (error) {
    console.error("=== SYNC ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Full error:", JSON.stringify(error, null, 2));
    return {
      success: false,
      error: error.message
    };
  }
}
