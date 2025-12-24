import shopify from "../shopify.server.js";

export async function loader({ request }) {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || url.searchParams.get("embedded");
    
    if (!shop) {
      return new Response(JSON.stringify({ error: "Missing shop parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Get session
    const sessionId = shopify.session.getOfflineId(shop);
    const session = await shopify.config.sessionStorage.loadSession(sessionId);
    
    if (!session) {
      return new Response(JSON.stringify({ error: "No session found" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const client = new shopify.clients.Graphql({ session });
    
    const appUrl = process.env.SHOPIFY_APP_URL || "https://serial-number-app-v2.onrender.com";
    
    const webhooks = [
      { topic: "ORDERS_CREATE", url: `${appUrl}/webhooks/orders/create` },
      { topic: "ORDERS_UPDATED", url: `${appUrl}/webhooks/orders/updated` },
      { topic: "ORDERS_CANCELLED", url: `${appUrl}/webhooks/orders/cancelled` }
    ];
    
    const results = [];
    
    for (const webhook of webhooks) {
      try {
        const response = await client.request(`
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
        
        results.push({
          topic: webhook.topic,
          result: response.data.webhookSubscriptionCreate
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
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
