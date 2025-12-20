import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server.js";
import db from "../db.server";

export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const perPage = 10;

    // Get total count from database
    const totalOrders = await db.saddle_orders.count();
    // Get paginated orders from database
    const orders = await db.saddle_orders.findMany({
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: {
        created_at: 'desc'
      }
    });
    const totalPages = Math.ceil(totalOrders / perPage);
    console.log(`Showing ${orders.length} orders from database (page ${page} of ${totalPages})`);
    return {
      orders: orders.map(order => ({
        ...order,
        line_items: order.line_items ? JSON.parse(order.line_items) : [],
        serialNumbers: order.serial_numbers ? JSON.parse(order.serial_numbers) : [],
      })),
      currentPage: page,
      totalPages: totalPages,
      totalOrders: totalOrders,
      fromDatabase: true
    };
  } catch (error) {
    console.error("Loader error:", error);
    return { 
      orders: [], 
      error: error.message,
      currentPage: 1,
      totalPages: 0,
      totalOrders: 0,
      fromDatabase: false
    };
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "syncOrders") {
    try {
      console.log("Starting sync of fulfilled orders (filtering for saddle products) ...");

      // Clear existing cache rows
      await db.saddle_orders.deleteMany({});
      console.log("Cleared existing orders from database");

      // Fetch fulfilled orders in batches, then filter by PRODUCT tag "saddles"
      let allOrders = [];
      let hasNextPage = true;
      let cursor = null;
      let fetchCount = 0;

      while (hasNextPage) {
        fetchCount++;

        const after = cursor ? `, after: "${cursor}"` : "";
        const response = await admin.graphql(
          `#graphql
          query {
            orders(first: 100${after}, query: "fulfillment_status:fulfilled") {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  name
                  createdAt
                  displayFulfillmentStatus
                  customer {
                    firstName
                    lastName
                    email
                  }
                  lineItems(first: 100) {
                    edges {
                      node {
                        id
                        title
                        quantity
                        variant {
                          id
                          title
                          selectedOptions {
                            name
                            value
                          }
                        }
                        product {
                          id
                          tags
                        }
                      }
                    }
                  }
                }
              }
            }
          }`
        );

        const data = await response.json();

        if (data.errors) {
          console.error("GraphQL errors:", data.errors);
          break;
        }

        const batchOrders = data?.data?.orders?.edges?.map(({ node }) => {
          const lineItems = node.lineItems.edges.map(({ node: item }) => ({
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            productId: item.product?.id,
            tags: item.product?.tags || [],
            options: (item.variant?.selectedOptions || []).reduce((acc, opt) => {
              acc[opt.name] = opt.value;
              return acc;
            }, {}),
            hasSaddleTag: (item.product?.tags || []).includes("saddles"),
          }));

          const hasSaddle = lineItems.some((li) => li.hasSaddleTag);

          return {
            order_id: node.id,
            order_name: node.name,
            created_at: new Date(node.createdAt),
            fulfillment_status: node.displayFulfillmentStatus,
            customer_name: node.customer
              ? `${node.customer.firstName || ""} ${node.customer.lastName || ""}`.trim() || "Guest"
              : "Guest",
            customer_email: node.customer?.email || "",
            line_items: JSON.stringify(lineItems),
            serial_numbers: null,
            _hasSaddle: hasSaddle,
          };
        }) || [];

        const saddleOrders = batchOrders.filter((o) => o._hasSaddle).map(({ _hasSaddle, ...rest }) => rest);

        allOrders = [...allOrders, ...saddleOrders];

        hasNextPage = data?.data?.orders?.pageInfo?.hasNextPage || false;
        cursor = data?.data?.orders?.pageInfo?.endCursor || null;

        console.log(`Batch ${fetchCount}: kept ${saddleOrders.length} saddle orders, total so far: ${allOrders.length}`);
      }

      console.log(`Total saddle orders to save: ${allOrders.length}`);

      if (allOrders.length > 0) {
        await db.saddle_orders.createMany({ data: allOrders });
        console.log(`Saved ${allOrders.length} orders to database`);
      }

      return { success: true, message: `Synced ${allOrders.length} saddle orders` };
    } catch (error) {
      console.error("Sync error:", error);
      return { success: false, error: error.message };
    }
  }

  if (actionType === "saveSerial") {
    const orderId = formData.get("orderId");
    const lineItemId = formData.get("lineItemId");
    const unitIndex = parseInt(formData.get("unitIndex") || "1", 10);
    const serialNumber = formData.get("serialNumber");

    try {
      const order = await db.saddle_orders.findUnique({
        where: { id: parseInt(orderId) }
      });
      if (order) {
        let serialNumbers = order.serial_numbers ? JSON.parse(order.serial_numbers) : [];
        // If serialNumbers is not an array, make it one
        if (!Array.isArray(serialNumbers)) serialNumbers = [];
        // Add or update serial for this line item
        const idx = serialNumbers.findIndex(sn => sn.lineItemId === lineItemId && sn.unitIndex === unitIndex);
        if (idx > -1) {
          serialNumbers[idx].serialNumber = serialNumber;
        } else {
          serialNumbers.push({ lineItemId, unitIndex, serialNumber });
        }
        await db.saddle_orders.update({
          where: { id: parseInt(orderId) },
          data: { serial_numbers: JSON.stringify(serialNumbers) }
        });
        return { success: true, message: "Serial number saved" };
      }
      return { success: false, error: "Order not found" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: false, error: "Unknown action" };
};

export default function App() {
  const { orders, error, currentPage, totalPages, totalOrders, fromDatabase } = useLoaderData();

  return (
    <s-page heading="Saddle Serial Number Manager">
      <s-section>
        <s-button 
          variant="primary" 
          onClick={() => {
            const formData = new FormData();
            formData.append("actionType", "syncOrders");
            fetch("", { method: "POST", body: formData }).then(() => window.location.reload());
          }}
        >
          Sync Orders from Shopify
        </s-button>
      </s-section>

      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>Error: {error}</s-text>
          </s-banner>
        </s-section>
      )}

      <s-section heading={`Orders with Saddles (${totalOrders} total)`}>
        {totalPages > 1 && (
          <s-stack direction="inline" gap="tight" alignment="center">
            <a href={`?page=${currentPage - 1}`} style={{ pointerEvents: currentPage === 1 ? 'none' : 'auto' }}>
              <s-button disabled={currentPage === 1}>← Previous</s-button>
            </a>
            <s-text>Page {currentPage} of {totalPages}</s-text>
            <a href={`?page=${currentPage + 1}`} style={{ pointerEvents: currentPage === totalPages ? 'none' : 'auto' }}>
              <s-button disabled={currentPage === totalPages}>Next →</s-button>
            </a>
          </s-stack>
        )}

        {orders && orders.length > 0 ? (
          <s-stack direction="block" gap="base">
            {orders.map((order) => {
              const saddleItems = order.line_items.filter(item => item.hasSaddleTag);
              const serialNumbers = order.serialNumbers || [];
              
              return (
                <s-box key={order.id} padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingMd">Order {order.order_name}</s-text>
                    <s-text variant="bodyMd" fontWeight="semibold">Customer: {order.customer_name}</s-text>
                    {order.customer_email && <s-text variant="bodySm">{order.customer_email}</s-text>}
                    <s-text variant="bodySm">Date: {new Date(order.created_at).toLocaleDateString()}</s-text>
                    
                    <s-stack direction="block" gap="tight">
                      <s-text variant="bodySm" fontWeight="semibold">Saddles:</s-text>
                      {saddleItems.map((item) => (
                        <s-box key={item.id} padding="base" background="surface" borderRadius="base" borderWidth="base">
                          <s-stack direction="block" gap="tight">
                            <s-text variant="bodyMd" fontWeight="semibold">{item.title} (Qty: {item.quantity})</s-text>
                            {Object.keys(item.options).length > 0 && (
                              <s-stack direction="inline" gap="tight">
                                {Object.entries(item.options).map(([key, value]) => (
                                  <s-text key={key} variant="bodySm">{key}: {value}</s-text>
                                ))}
                              </s-stack>
                            )}
                            {Array.from({ length: item.quantity || 1 }).map((_, idx) => {
                              const unitIndex = idx + 1;
                              const existing = (serialNumbers || []).find(
                                (sn) => sn.lineItemId === item.id && sn.unitIndex === unitIndex
                              )?.serialNumber || "";

                              return (
                                <s-stack key={`${item.id}-${unitIndex}`} direction="block" gap="extraTight">
                                  {(item.quantity || 1) > 1 && (
                                    <s-text variant="bodySm">
                                      Saddle {unitIndex} of {item.quantity}
                                    </s-text>
                                  )}
                                  <input
                                    type="text"
                                    defaultValue={existing}
                                    placeholder="Enter serial number"
                                    onBlur={(e) => {
                                      const formData = new FormData();
                                      formData.append("actionType", "saveSerial");
                                      formData.append("orderId", order.id);
                                      formData.append("lineItemId", item.id);
                                      formData.append("unitIndex", String(unitIndex));
                                      formData.append("serialNumber", e.target.value);
                                      fetch("", { method: "POST", body: formData });
                                    }}
                                    style={{
                                      padding: "8px",
                                      border: "1px solid #ccc",
                                      borderRadius: "4px",
                                      width: "300px",
                                    }}
                                  />
                                  {existing && (
                                    <s-text variant="bodySm" tone="success">
                                      ✓ Saved: {existing}
                                    </s-text>
                                  )}
                                </s-stack>
                              );
                            })}
                          </s-stack>
                        </s-box>
                      ))}
                    </s-stack>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        ) : (
          <s-text>No orders in database. Click "Sync Orders from Shopify" to load orders.</s-text>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
