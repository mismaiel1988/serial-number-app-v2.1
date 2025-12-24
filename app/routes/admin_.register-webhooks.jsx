import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    
    const appUrl = process.env.SHOPIFY_APP_URL || "https://serial-number-app-v2.onrender.com";
    
    const webhooks = [
      { topic: "ORDERS_CREATE", url: `${appUrl}/webhooks/orders/create` },
      { topic: "ORDERS_UPDATED", url: `${appUrl}/webhooks/orders/updated` },
      { topic: "ORDERS_CANCELLED", url: `${appUrl}/webhooks/orders/cancelled` }
    ];
    
    const results = [];
    
    for (const webhook of webhooks) {
      try {
        const response = await admin.graphql(`
          mutation {
            webhookSubscriptionCreate(
              topic: ${webhook.topic}
              webhookSubscription: {
                callbackUrl: "${webhook.url}"
                format: JSON
              }
            ) {
              webhookSubscription {
                id
                topic
                endpoint {
                  __typename
                  ... on WebhookHttpEndpoint {
                    callbackUrl
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `);
        
        const data = await response.json();
        results.push({
          topic: webhook.topic,
          result: data.data.webhookSubscriptionCreate
        });
      } catch (error) {
        results.push({
          topic: webhook.topic,
          error: error.message
        });
      }
    }
    
    return new Response(JSON.stringify(results, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
