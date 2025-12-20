import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";
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

/**
 * addDocumentResponseHeaders(request, responseHeaders)
 *
 * Expected usage: called from your SSR entry (entry.server.jsx) to set response headers
 * for embedded Shopify apps. Signature matches the import used by entry.server.jsx.
 *
 * - request: the incoming Request (or an object with a `.url` string)
 * - responseHeaders: a Headers-like instance (must support get/set)
 *
 * This function merges or sets a Content-Security-Policy `frame-ancestors` directive
 * allowing the shop domain (if present in the request query string) and the Shopify admin.
 */
export function addDocumentResponseHeaders(request, responseHeaders) {
  try {
    if (!request || !responseHeaders || typeof responseHeaders.get !== "function") {
      return;
    }

    // Try to extract the shop param from the request URL (common for Shopify embedded apps)
    let shopHost = null;
    try {
      const url = typeof request.url === "string" ? new URL(request.url) : new URL(request);
      const shopParam = url.searchParams.get("shop");
      if (shopParam && /^[a-z0-9-.]+$/.test(shopParam)) {
        shopHost = `https://${shopParam}`;
      }
    } catch (err) {
      // ignore URL parsing errors — we'll still add admin.shopify.com below
    }

    // Build frame-ancestors directive (allow the shop host if found, plus Shopify admin)
    const frameSources = [];
    if (shopHost) frameSources.push(shopHost);
    frameSources.push("https://admin.shopify.com");

    const frameAncestorsDirective = `frame-ancestors ${frameSources.join(" ")}`;

    // Merge with existing CSP if present — replace existing frame-ancestors if found
    const existingCsp = responseHeaders.get("Content-Security-Policy") || "";
    let newCsp = existingCsp;

    if (existingCsp && /frame-ancestors[^;]*/i.test(existingCsp)) {
      newCsp = existingCsp.replace(/frame-ancestors[^;]*/i, frameAncestorsDirective);
    } else if (existingCsp) {
      newCsp = `${existingCsp}; ${frameAncestorsDirective}`;
    } else {
      newCsp = frameAncestorsDirective;
    }

    responseHeaders.set("Content-Security-Policy", newCsp);

    // Optional: set an X-Frame-Options fallback (some older clients)
    if (!responseHeaders.get("X-Frame-Options")) {
      // Note: ALLOW-FROM is obsolete in modern browsers but kept as a harmless fallback.
      responseHeaders.set("X-Frame-Options", "ALLOW-FROM https://admin.shopify.com");
    }
  } catch (error) {
    // Don't crash the renderer if header injection fails — fail silently
    // You could log the error to your monitoring system here.
  }
}
