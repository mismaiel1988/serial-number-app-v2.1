import "@shopify/shopify-api/adapters/node";
import { shopify } from "../shopify.server";
import prisma from "../db.server";

/**
 * PHASE 2: Order Sync Service
 * Fetches orders from Shopify and stores them in PostgreSQL
 */

/**
 * Determines if a line item is a saddle product
 * Customize this logic based on your product identification strategy
 */
function isSaddleProduct(lineItem) {
  const productType = lineItem.product?.productType?.toLowerCase() || "";
  const tags = lineItem.product?.tags || [];
  const sku = lineItem.sku?.toLowerCase() || "";
  
  // Customize these rules based on how you identify saddles
  return (
    productType.includes("saddle") ||
    tags.some(tag => tag.toLowerCase().includes("saddle")) ||
    sku.startsWith("saddle-") ||
    sku.includes("-saddle-")
  );
}

/**
 * Sync orders from Shopify to local database
 * @param {string} session - Shopify session with shop and accessToken
 * @param {object} options - Sync options
 * @returns {object} - Sync results
 */
export async function syncOrdersFromShopify(session, options = {}) {
  const {
    limit = 250,
    onlySaddleOrders = true,
    sinceDate = null
  } = options;

  try {
    const client = new shopify.clients.Graphql({ session });
    
    let hasNextPage = true;
    let cursor = null;
    let totalOrders = 0;
    let totalLineItems = 0;
    let saddleLineItems = 0;

    while (hasNextPage) {
      // Fetch orders from Shopify
      const response = await client.query({
        data: `
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
        `,
        variables: {
          limit,
          cursor
        }
      });

      const orders = response.body.data.orders.edges;
      
      // Process each order
      for (const { node: order } of orders) {
        const lineItems = order.lineItems.edges.map(({ node }) => node);
        
        // Check if order contains saddles
        const hasSaddles = lineItems.some(isSaddleProduct);
        
        if (onlySaddleOrders && !hasSaddles) {
          continue; // Skip orders without saddles
        }

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
          if (isSaddle) saddleLineItems++;
        }
      }

      // Check for next page
      hasNextPage = response.body.data.orders.pageInfo.hasNextPage;
      cursor = response.body.data.orders.pageInfo.endCursor;
    }

    return {
      success: true,
      totalOrders,
      totalLineItems,
      saddleLineItems
    };

  } catch (error) {
    console.error("Order sync error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}
