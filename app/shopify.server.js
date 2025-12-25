import "@shopify/shopify-api/adapters/node";
import { shopifyApi } from "@shopify/shopify-api";
import prisma from "./db.server";

/**
 * Shopify server configuration
 * Replaces deprecated @shopify/shopify-app-react-router usage
 * Safe for Vite SSR + React Router v7
 */

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES?.split(",") ?? [],
  hostName: process.env.SHOPIFY_APP_URL
    ? new URL(process.env.SHOPIFY_APP_URL).host
    : undefined,
  apiVersion: "2024-10",
  isEmbeddedApp: true,
  isCustomStoreApp: false,
  sessionStorage: {
    async storeSession(session) {
      console.log("💾 Storing session:", {
        id: session.id,
        shop: session.shop,
        hasToken: !!session.accessToken,
        tokenPrefix: session.accessToken?.substring(0, 10),
        isOnline: session.isOnline,
      });
      
      await prisma.session.upsert({
        where: { id: session.id },
        update: session,
        create: session
      });
      
      console.log("✅ Session stored successfully");
      return true;
    },
    async loadSession(id) {
      console.log("📖 Loading session:", id);
      const session = await prisma.session.findUnique({ where: { id } });
      console.log("Session loaded:", session ? "✅ Found" : "❌ Not found");
      return session;
    },
    async deleteSession(id) {
      console.log("🗑️ Deleting session:", id);
      await prisma.session.delete({ where: { id } });
      return true;
    }
  }
});

// Export required functions for routes
export const authenticate = shopify.authenticate || {};
export const apiVersion = "2024-10";

// Add document response headers helper
export const addDocumentResponseHeaders = (request, headers) => {
  headers.set("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com");
  return headers;
};

// Login helper - handles both OAuth start AND callback
export const login = async (request) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  
  // DEBUG: Log what we're receiving
  console.log("========================================");
  console.log("LOGIN FUNCTION CALLED");
  console.log("Full URL:", url.toString());
  console.log("Shop parameter:", shop);
  console.log("Code parameter:", code ? "Present" : "Not present");
  console.log("========================================");
  
  // If there's a code, this is the OAuth callback
  if (code) {
    console.log("🔄 OAuth callback triggered (via login route)");
    console.log("Code received:", code.substring(0, 10) + "...");
    
    const { session } = await shopify.auth.callback({
      rawRequest: request,
    });

    console.log("✅ OAuth callback received:", {
      shop: session.shop,
      sessionId: session.id,
      hasToken: !!session.accessToken,
      tokenPrefix: session.accessToken?.substring(0, 10),
      isOnline: session.isOnline,
      scope: session.scope,
    });

    // Verify session was saved
    const savedSession = await prisma.session.findUnique({
      where: { id: session.id }
    });

    if (!savedSession?.accessToken) {
      console.error("❌ Session saved but missing accessToken!");
      throw new Error("Failed to save access token");
    }

    console.log("✅ Session verified in database");

    // Return redirect URL as string (the route will handle the redirect)
    return `/?shop=${session.shop}&host=${Buffer.from(`${session.shop}/admin`).toString('base64')}`;
  }
  
  // Start OAuth flow
  if (!shop) {
    throw new Error("Missing shop parameter");
  }
  
  console.log("🔄 Starting OAuth flow for shop:", shop);
  
  // Build the OAuth URL manually (bypasses incompatible shopify.auth.begin)
  const authQuery = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY,
    scope: process.env.SCOPES || "read_orders,write_orders,read_products",
    redirect_uri: `${process.env.SHOPIFY_APP_URL}/auth/login`,
    state: Math.random().toString(36).substring(7),
    grant_options: "[]"
  });
  
  const authUrl = `https://${shop}/admin/oauth/authorize?${authQuery.toString()}`;
  
  console.log("OAuth URL built:", authUrl);
  
  // Return the OAuth URL (the route will handle the redirect)
  return authUrl;
};

export default shopify;
