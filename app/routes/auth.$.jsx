import { redirect } from "react-router";
import { shopifyApi } from "@shopify/shopify-api";

/**
 * Shopify OAuth callback handler
 * Replaces deprecated @shopify/shopify-app-react-router/server
 */

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES?.split(",") ?? [],
  hostName: process.env.SHOPIFY_APP_URL
    ? new URL(process.env.SHOPIFY_APP_URL).host
    : undefined,
  apiVersion: "2024-10",
  isEmbeddedApp: true,
  isCustomStoreApp: false
});

export async function loader({ request }) {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  const authRoute = await shopify.auth.begin({
    shop,
    callbackPath: "/auth",
    isOnline: true,
    rawRequest: request
  });

  return redirect(authRoute);
}
