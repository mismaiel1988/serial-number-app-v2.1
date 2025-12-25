import shopify from "../shopify.server.js";
import prisma from "../db.server.js";

export async function loader({ request }) {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    
    if (!shop) {
      return new Response(JSON.stringify({ error: "Missing shop parameter. Access via Shopify admin." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log("Looking for session for shop:", shop);
    
    // Match the session ID format from auth.$.jsx
    const sessionId = `offline_${shop}`;
    console.log("Session ID:", sessionId);
    
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    });
    
    if (!session) {
      // Try to find ANY session for debugging
      const allSessions = await prisma.session.findMany({
        where: { shop: shop }
      });
      
      console.log("No session found with ID:", sessionId);
      console.log("All sessions for shop:", allSessions.map(s => ({ id: s.id, hasToken: !!s.accessToken })));
      
      return new Response(JSON.stringify({ 
        error: "No session found for shop: " + shop,
        sessionId: sessionId,
        foundSessions: allSessions.map(s => s.id)
      }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log("Session found:", {
      id: session.id,
      shop: session.shop,
      hasToken: !!session.accessToken,
      tokenPrefix: session.accessToken?.substring(0, 10)
    });
    
    const appUrl = process.env.SHOPIFY_APP_URL || "https://serial-number-app-v2.onrender.com";
    
    const webhooks = [
      { topic: "orders/create", address: `${appUrl}/webhooks/orders/create` },
      { topic: "orders/updated", address: `${appUrl}/webhooks/orders/updated` },
      { topic: "orders/cancelled", address: `${appUrl}/webhooks/orders/cancelled` }
    ];
    
    const results = [];
    
    const restClient = new shopify.clients.Rest({ session });
    
    for (const webhook of webhooks) {
      try {
        const response = await restClient.post({
          path: 'webhooks',
          data: {
            webhook: {
              topic: webhook.topic,
              address: webhook.address,
              format: 'json'
            }
          }
        });
        
        results.push({
          topic: webhook.topic,
          success: true,
          webhook: response.body.webhook
        });
      } catch (error) {
        results.push({
          topic: webhook.topic,
          success: false,
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
