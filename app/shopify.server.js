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
  apiVersion: "2025-10",
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
export const authenticate = {
  webhook: async (request) => {
    // Add webhook authentication logic here
    return { topic: "", shop: "", session: null, payload: {} };
  },
  admin: async (request) => {
    // Add admin authentication logic here
    return { session: null, admin: null };
  }
};

export const apiVersion = "2025-10";
export const addDocumentResponseHeaders = () => {};
export const unauthenticated = {};
export const login = () => {};
export const registerWebhooks = async () => {};
export const sessionStorage = shopify.config.sessionStorage;

export default shopify;
