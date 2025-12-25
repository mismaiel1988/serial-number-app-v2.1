import { processOrderWebhook } from "../services/webhooks.server";
import crypto from "crypto";

export const action = async ({ request }) => {
  try {
    // Get the raw body
    const body = await request.text();
    
    // Verify the webhook HMAC
    const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
    const shop = request.headers.get("X-Shopify-Shop-Domain");
    const topic = request.headers.get("X-Shopify-Topic");
    
    if (!hmac || !shop) {
      console.error("Missing webhook headers");
      return new Response("Unauthorized", { status: 401 });
    }
    
    // Verify HMAC
    const generatedHash = crypto
      .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
      .update(body)
      .digest("base64");
    
    if (generatedHash !== hmac) {
      console.error("HMAC validation failed");
      return new Response("Unauthorized", { status: 401 });
    }
    
    console.log(`Received webhook: ${topic} from ${shop}`);
    
    // Parse the payload
    const payload = JSON.parse(body);
    
    // Process the webhook
    await processOrderWebhook(payload, "cancelled", shop);
    
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("Error", { status: 500 });
  }
};
