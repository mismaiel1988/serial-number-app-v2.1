import {
  useLoaderData,
  Form,
  useNavigation,
  useActionData,
  Link,
} from "react-router";
import { json } from "@react-router/node";
import prisma from "../db.server";

/**
 * Loader
 * :orderId === DATABASE ID (string)
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
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!order) {
    throw new Response("Order not found", { status: 404 });
  }

  return json({ order });
}

/**
 * Action
 */
export async function action({ request, params }) {
  const { orderId } = params;
  const formData = await request.formData();

  const lineItemIds = formData.getAll("
