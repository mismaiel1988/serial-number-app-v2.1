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
  const productType = lineItem.product?.productType?.toLowerCase() || "";
  const tags = lineItem.product?.tags || [];
  const sku = lineItem.sku?.toLowerCase() || "";
  
  // Check for "saddles" tag (case-insensitive)
  const hasSaddleTag = tags.some(tag => tag.toLowerCase() === "saddles" || tag.toLowerCase().includes("saddle"));
  
  return (
    productType.includes("saddle") ||
    hasSaddleTag ||
    sku.startsWith("saddle-") ||
    sku.includes("-saddle-")
  );
}

/**
 * Sync orders from Shopify to local database
 */
export async function syncOrdersFromShopify(session, options = {}) {
  const {
    limit = 250,
    onlySaddleOrders = true,
    sinceDate = null
  } = options;

  console.log("=== SYNC STARTED ===");
  console.log("Session:", { shop: session.shop, hasAccessToken: !!session.accessToken });
  console.log("Options:", { limit, onlySaddleOrders });

  try {
    const client = new shopify.clients.Graphql({ session });
    console.log("GraphQL client created successfully");
    
    let hasNextPage = true;
    let cursor = null;
    let totalOrders = 0;
    let totalLineItems = 0;
    let saddleLineItems = 0;

    while (hasNextPage) {
      console.log(`Fetching orders batch (cursor: ${cursor || 'initial'})`);
      
      const query = `
        query GetOrders($limit: Int!, $cursor: String) {
          orders(first: $limit, after: $cursor, sortKey: CREATED_AT, reverse: true) {
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
      
      // Fetch orders from Shopify
      const response = await client.request(query, {
        variables: {
          limit,
          cursor
        }
      });

      console.log("GraphQL response received");
      console.log("Response data:", JSON.stringify(response.data, null, 2));

      const orders = response.data.orders.edges;
      console.log(`Fetched ${orders.length} orders`);
      
      // Process each order
      for (const { node: order } of orders) {
        const lineItems = order.lineItems.edges.map(({ node }) => node);
        
        // Check if order contains saddles
        const hasSaddles = lineItems.some(isSaddleProduct);
        
        if (onlySaddleOrders && !hasSaddles) {
          console.log(`Skipping order ${order.name} - no saddles`);
          continue;
        }

        console.log(`Processing order ${order.name} with ${lineItems.length} line items`);

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
        console.log(`Order ${order.name} saved to database`);

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
            console.log(`  - Saddle line item: ${lineItem.title} (qty: ${lineItem.quantity})`);
          }
        }
      }

      // Check for next page
      hasNextPage = response.data.orders.pageInfo.hasNextPage;
      cursor = response.data.orders.pageInfo.endCursor;
      
      console.log(`Batch complete. hasNextPage: ${hasNextPage}`);
    }

    console.log("=== SYNC COMPLETE ===");
    console.log(`Total orders: ${totalOrders}`);
    console.log(`Total line items: ${totalLineItems}`);
    console.log(`Saddle line items: ${saddleLineItems}`);

    return {
      success: true,
      totalOrders,
      totalLineItems,
      saddleLineItems
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
