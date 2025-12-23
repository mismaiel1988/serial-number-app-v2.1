/**
 * Webhook topic definitions
 * These webhooks will automatically sync orders to the database
 */

export const webhookHandlers = {
  ORDERS_CREATE: {
    deliveryMethod: "http",
    callbackUrl: "/webhooks/orders/create",
  },
  ORDERS_UPDATED: {
    deliveryMethod: "http",
    callbackUrl: "/webhooks/orders/updated",
  },
  ORDERS_CANCELLED: {
    deliveryMethod: "http",
    callbackUrl: "/webhooks/orders/cancelled",
  },
};
