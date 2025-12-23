import { useLoaderData, Form, useNavigation, useActionData, Link } from "react-router";
import prisma from "../../db.server";
import { saveSerialNumbers } from "../../services/serials.server";


/**
 * Loader: Fetch order by DATABASE ID (integer)
 */
export async function loader({ params }) {
  const { orderId } = params;
  
  // Validate that orderId is a valid integer
  const orderIdInt = parseInt(orderId, 10);
  if (isNaN(orderIdInt)) {
    throw new Response("Invalid order ID", { status: 400 });
  }
  
  const order = await prisma.order.findUnique({
    where: { id: orderIdInt },
    include: {
      lineItems: {
        where: { isSaddle: true },
        include: {
          serialNumbers: {
            orderBy: { unitIndex: "asc" }
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
 * Action: Save serial numbers with validation
 */
export async function action({ request, params }) {
  const { orderId } = params;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "save_serials") {
    try {
      const lineItemIds = formData.getAll("lineItemId");
      
      // Collect all serials by line item
      const serialsByLineItem = {};
      for (const lineItemId of lineItemIds) {
        const serials = formData.getAll(`serials_${lineItemId}`);
        serialsByLineItem[lineItemId] = serials;
      }
      
      // Validate and save each line item's serials
      for (const [lineItemId, serials] of Object.entries(serialsByLineItem)) {
        await saveSerialNumbers(parseInt(lineItemId, 10), serials);
      }

      return { 
        success: true, 
        message: "Serial numbers saved successfully" 
      };
    } catch (error) {
      console.error("Error saving serials:", error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  return { success: false, error: "Unknown action" };
}

/**
 * Component: Order detail page with serial entry
 */
export default function OrderDetailPage() {
  const { order } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  // Check if all serials are entered
  const allSerialsEntered = order.lineItems.every(item => {
    const enteredCount = item.serialNumbers.filter(s => s.serialNumber).length;
    return enteredCount === item.quantity;
  });

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <Link to="/additional" style={{ color: "#008060", textDecoration: "none", fontSize: "14px" }}>
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
            <p style={{ margin: 0 }}>❌ {actionData.error}</p>
          )}
        </div>
      )}

      <Form method="post">
        <input type="hidden" name="action" value="save_serials" />
        
        {order.lineItems.map((lineItem) => {
          const serialsEntered = lineItem.serialNumbers.filter(s => s.serialNumber).length;
          const isComplete = serialsEntered === lineItem.quantity;
          
          return (
            <div key={lineItem.id} style={{
              backgroundColor: "white",
              border: `2px solid ${isComplete ? "#008060" : "#e1e3e5"}`,
              borderRadius: "8px",
              padding: "20px",
              marginBottom: "20px"
            }}>
              <input type="hidden" name="lineItemId" value={lineItem.id} />
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "10px" }}>
                <h3 style={{ margin: 0 }}>
                  {lineItem.productTitle}
                  {lineItem.variantTitle && ` - ${lineItem.variantTitle}`}
                </h3>
                {isComplete && (
                  <span style={{ 
                    color: "#008060", 
                    fontSize: "14px", 
                    fontWeight: "600" 
                  }}>
                    ✓ Complete
                  </span>
                )}
              </div>
              
              <p style={{ color: "#666", margin: "0 0 15px 0" }}>
                SKU: {lineItem.sku} • Quantity: {lineItem.quantity} • Entered: {serialsEntered}/{lineItem.quantity}
              </p>

              <div style={{ display: "grid", gap: "10px" }}>
                {Array.from({ length: lineItem.quantity }).map((_, index) => {
                  const existingSerial = lineItem.serialNumbers.find(s => s.unitIndex === index + 1);
                  return (
                    <div key={index}>
                      <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                        Serial Number {index + 1}:
                        <span style={{ color: "#bf0711", marginLeft: "4px" }}>*</span>
                      </label>
                      <input
                        type="text"
                        name={`serials_${lineItem.id}`}
                        defaultValue={existingSerial?.serialNumber || ""}
                        placeholder="Enter serial number"
                        required
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
          );
        })}

        <div style={{ 
          display: "flex", 
          gap: "12px", 
          alignItems: "center" 
        }}>
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
          
          {!allSerialsEntered && (
            <span style={{ color: "#bf0711", fontSize: "14px" }}>
              * All serial numbers must be entered
            </span>
          )}
        </div>
      </Form>
    </div>
  );
}
