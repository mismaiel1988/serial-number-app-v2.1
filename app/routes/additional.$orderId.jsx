import { useLoaderData, Form, useNavigation, useActionData, Link, json } from "react-router";
import prisma from "../db.server";

/**
 * Loader: Fetch order details with saddle line items and serial numbers
 * orderId === DATABASE ID (string), not Shopify order number
 */
export async function loader({ params }) {
  const { orderId } = params;

  const order = await prisma.saddleOrder.findUnique({
    where: { id: orderId },
    include: {
      lineItems: {
        where: { isSaddle: true },
        include: {
          serialNumbers: {
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  });

  if (!order) {
    throw new Response("Order not found", { status: 404 });
  }

  return json({ order });
}

/**
 * Action: Save serial numbers safely
 */
export async function action({ request, params }) {
  const { orderId } = params;
  const formData = await request.formData();

  const lineItemIds = formData.getAll("lineItemId");

  for (const lineItemId of lineItemIds) {
    const serials = formData.getAll(`serials_${lineItemId}`);

    // Fetch existing serials for this line item
    const existing = await prisma.serialNumber.findMany({
      where: { lineItemId }
    });

    // Update or create serials (do NOT blanket delete)
    for (let i = 0; i < serials.length; i++) {
      const value = serials[i]?.trim();
      if (!value) continue;

      if (existing[i]) {
        await prisma.serialNumber.update({
          where: { id: existing[i].id },
          data: { serial: value }
        });
      } else {
        await prisma.serialNumber.create({
          data: {
            serial: value,
            orderId,
            lineItemId
          }
        });
      }
    }
  }

  return json({ success: true, message: "Serial numbers saved successfully" });
}

/**
 * Component: Order detail page
 */
export default function OrderDetailPage() {
  const { order } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <Link to="/additional">← Back to Orders</Link>

      <h1>Order #{order.orderNumber}</h1>

      {actionData && (
        <div style={{ margin: "12px 0" }}>
          {actionData.success ? "✅ Saved" : `❌ ${actionData.error}`}
        </div>
      )}

      <Form method="post">
        {order.lineItems.map((lineItem) => (
          <div key={lineItem.id} style={{ marginBottom: "24px" }}>
            <input type="hidden" name="lineItemId" value={lineItem.id} />

            <h3>{lineItem.productTitle}</h3>
            <p>Quantity: {lineItem.quantity}</p>

            {Array.from({ length: lineItem.quantity }).map((_, index) => (
              <input
                key={index}
                name={`serials_${lineItem.id}`}
                defaultValue={li
