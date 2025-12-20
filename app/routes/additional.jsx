import { useLoaderData } from "react-router";
import prisma from "../db.server";

/**
 * Loader: Fetch orders from database
 */
export async function loader() {
  try {
    // Fetch orders with saddle line items
    const orders = await prisma.order.findMany({
      where: {
        lineItems: {
          some: {
            isSaddle: true
          }
        }
      },
      include: {
        lineItems: {
          where: {
            isSaddle: true
          },
          include: {
            serialNumbers: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    });

    return {
      orders,
      shop: "Test Shop"
    };
  } catch (error) {
    console.error("Loader error:", error);
    return {
      orders: [],
      shop: "Error loading",
      error: error.message
    };
  }
}

/**
 * Component: Orders page
 */
export default function AdditionalPage() {
  const { orders, shop, error } = useLoaderData();

  if (error) {
    return (
      <div style={{ padding: "20px" }}>
        <h1>Error</h1>
        <p style={{ color: "red" }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ margin: 0 }}>Saddle Orders</h1>
        <p style={{ color: "#666", margin: "5px 0 0 0" }}>
          Shop: {shop} | Total orders: {orders.length}
        </p>
      </div>

      {orders.length === 0 ? (
        <div style={{
          padding: "40px",
          textAlign: "center",
          backgroundColor: "#f6f6f7",
          borderRadius: "8px"
        }}>
          <h2 style={{ color: "#666" }}>No saddle orders found</h2>
          <p style={{ color: "#999" }}>
            Database is empty. Sync functionality will be added next.
          </p>
        </div>
      ) : (
        <div style={{ backgroundColor: "white", borderRadius: "8px", overflow: "hidden", border: "1px solid #e1e3e5" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Order</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Customer</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Saddle Products</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Serials</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: "600" }}>{order.orderName}</div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {new Date(order.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <div>{order.customerName || "—"}</div>
                    <div style={{ fontSize: "12px", color: "#666" }}>{order.customerEmail || "—"}</div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    {order.lineItems.map((item) => (
                      <div key={item.id} style={{ marginBottom: "4px" }}>
                        {item.productTitle} {item.variantTitle ? `(${item.variantTitle})` : ""} × {item.quantity}
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {order.lineItems.map((item) => {
                      const serialCount = item.serialNumbers.length;
                      const needed = item.quantity;
                      return (
                        <div key={item.id} style={{ marginBottom: "4px" }}>
                          {serialCount}/{needed} entered
                        </div>
                      );
                    })}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      backgroundColor: order.fulfillmentStatus === "FULFILLED" ? "#e3f5ef" : "#fff4e6",
                      color: order.fulfillmentStatus === "FULFILLED" ? "#008060" : "#b98900"
                    }}>
                      {order.fulfillmentStatus || "UNFULFILLED"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
