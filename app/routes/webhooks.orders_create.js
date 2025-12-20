import { authenticate } from "../shopify.server.js";

/**
 * This app’s MVP stores serial numbers on the Shopify Order metafield (custom.serial_numbers)
 * and keeps a lightweight local cache (saddle_orders) for admin UI speed.
 *
 * These webhooks are intentionally a no-op for now to avoid breaking deploys.
 */
export const action = async ({ request }) => {
  try {
    await authenticate.webhook(request);
  } catch (e) {
    // Shopify expects 200 even if we ignore / already uninstalled, etc.
  }
  return new Response("OK", { status: 200 });
};
