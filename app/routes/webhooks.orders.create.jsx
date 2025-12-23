import { authenticate } from "../shopify.server";
import { processOrderWebhook } from "../services/webhooks.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, session, payload } = await authenticate.webhook(request);
    
    console.log(`Received webhook: ${topic} from ${shop}`);
    
    await processOrderWebhook(payload, "create", shop);
    
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("Error", { status: 500 });
  }
};
