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
      await prisma.session.upsert({
        where: { id: session.id },
        update: session,
        create: session
      });
      return true;
    },
    async loadSession(id) {
      return prisma.session.findUnique({ where: { id } });
    },
    async deleteSession(id) {
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

// Login helper
export const login = async (request) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (!shop) {
    throw new Error("Missing shop parameter");
  }
  
  return await shopify.auth.begin({
    shop,
    callbackPath: "/auth/callback",
    isOnline: false,
    rawRequest: request
  });
};

export default shopify;
