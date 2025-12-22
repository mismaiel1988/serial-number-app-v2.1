import { useLoaderData, Form, useNavigation, useActionData, Link } from "react-router";
import prisma from "../db.server";

/**
 * Loader: Fetch order details with line items and serial numbers
 */
export async function loader({ params }) {
  const { orderId } = params;
  
  const order = await prisma.order.findUnique({
    where: { id: parseInt(orderId) },
    include: {
      lineItems: {
        where: { isSaddle: true },
        include: {
          serialNumbers: {
            orderBy: { enteredAt: "asc" }
          }
        }
      }
    }
  });

  if (!order) {
    throw new Response("Order not found", { status: 404 });
  }

  return { order };
}

/**
 * Action: Save serial numbers
 */
export async function action({ request, params }) {
  const { orderId } = params;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "save_serials") {
    try {
      // Get all serial number entries from form
      const lineItemIds = formData.getAll("lineItemId");
      
      for (const lineItemId of lineItemIds) {
        const serials = formData.getAll(`serials_${lineItemId}`);
        
        // Delete existing serials for this line item
        await prisma.serialNumber.deleteMany({
          where: { lineItemId: parseInt(lineItemId) }
        });
        
        // Create new serial numbers
        for (const serial of serials) {
          if (serial && serial.trim()) {
            await prisma.serialNumber.create({
              data: {
                lineItemId: parseInt(lineItemId),
                serialNumber: serial.trim(),
                enteredAt: new Date()
              }
            });
          }
        }
      }

      return { success: true, message: "Serial numbers saved successfully" };
    } catch (error) {
      console.error("Error saving serials:", error);
      return { success: false, error: error.message };
    }
  }

  return { success: false, error: "Unknown action" };
}

/**
 * Component: Order detail page with serial number entry
 */
export default function OrderDetailPage() {
  const { order } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <Link to="/additional" style={{ color: "#008060", textDecoration: "none" }}>
          ← Back to Orders
        </Link>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ margin: 0 }}>Order {order.orderName}</h1>
        <p style={{ color: "#666", margin: "5px 0 0 0" }}>
          {order.customerName} • {new Date(order.createdAt).toLocaleDateString()}
        </p>
      </div>

      {actionData && (
        <div style={{
          padding: "12px",
          marginBottom: "20px",
          borderRadius: "4px",
          backgroundColor: actionData.success ? "#e3f5ef" : "#fff4e6",
          color: actionData.success ? "#008060" : "#b98900"
        }}>
          {actionData.success ? (
            <p style={{ margin: 0 }}>✅ {actionData.message}</p>
          ) : (
            <p style={{ margin: 0 }}>❌ Error: {actionData.error}</p>
          )}
        </div>
      )}

      <Form method="post">
        <input type="hidden" name="action" value="save_serials" />
        
        {order.lineItems.map((lineItem) => (
          <div key={lineItem.id} style={{
            backgroundColor: "white",
            border: "1px solid #e1e3e5",
            borderRadius: "8px",
            padding: "20px",
            marginBottom: "20px"
          }}>
            <input type="hidden" name="lineItemId" value={lineItem.id} />
            
            <h3 style={{ margin: "0 0 10px 0" }}>
              {lineItem.productTitle}
              {lineItem.variantTitle && ` - ${lineItem.variantTitle}`}
            </h3>
            
            <p style={{ color: "#666", margin: "0 0 15px 0" }}>
              SKU: {lineItem.sku} • Quantity: {lineItem.quantity}
            </p>

            <div style={{ display: "grid", gap: "10px" }}>
              {Array.from({ length: lineItem.quantity }).map((_, index) => {
                const existingSerial = lineItem.serialNumbers[index]?.serialNumber || "";
                return (
                  <div key={index}>
                    <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                      Serial Number {index + 1}:
                    </label>
                    <input
                      type="text"
                      name={`serials_${lineItem.id}`}
                      defaultValue={existingSerial}
                      placeholder="Enter serial number"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #c9cccf",
                        borderRadius: "4px",
                        fontSize: "14px"
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "12px 24px",
            backgroundColor: isLoading ? "#ccc" : "#008060",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: "16px",
            fontWeight: "600"
          }}
        >
          {isLoading ? "Saving..." : "Save Serial Numbers"}
        </button>
      </Form>
    </div>
  );
}
