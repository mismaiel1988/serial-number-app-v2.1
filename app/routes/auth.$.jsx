import { redirect } from "react-router";
import { shopifyApi } from "@shopify/shopify-api";
import prisma from "../db.server";

/**
 * Shopify OAuth callback handler
 * Handles both the initial auth request and the callback
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
  isCustomStoreApp: false,
});

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const host = url.searchParams.get("host");

  console.log("Auth route called:", { shop, hasCode: !!code, host });

  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  // If we have a code, this is the callback from Shopify
  if (code) {
    console.log("Processing OAuth callback");
    
    try {
      // Complete the OAuth flow
      const callback = await shopify.auth.callback({
        rawRequest: request,
      });

      console.log("OAuth callback successful:", {
        shop: callback.session.shop,
        isOnline: callback.session.isOnline,
      });

      // Store the session in the database
      await prisma.session.upsert({
        where: { id: callback.session.id },
        update: {
          shop: callback.session.shop,
          state: callback.session.state,
          isOnline: callback.session.isOnline,
          scope: callback.session.scope,
          expires: callback.session.expires,
          accessToken: callback.session.accessToken,
          userId: callback.session.onlineAccessInfo?.associated_user?.id 
            ? BigInt(callback.session.onlineAccessInfo.associated_user.id)
            : null,
        },
        create: {
          id: callback.session.id,
          shop: callback.session.shop,
          state: callback.session.state,
          isOnline: callback.session.isOnline,
          scope: callback.session.scope,
          expires: callback.session.expires,
          accessToken: callback.session.accessToken,
          userId: callback.session.onlineAccessInfo?.associated_user?.id 
            ? BigInt(callback.session.onlineAccessInfo.associated_user.id)
            : null,
        },
      });

      console.log("Session saved to database");

      // Redirect to the app
      const redirectUrl = host 
        ? `/additional?shop=${shop}&host=${host}`
        : `/additional?shop=${shop}`;
      
      return redirect(redirectUrl);
    } catch (error) {
      console.error("OAuth callback error:", error);
      throw new Response(`OAuth error: ${error.message}`, { status: 500 });
    }
  }

  // No code - this is the initial auth request, start OAuth flow
  console.log("Starting OAuth flow");

  try {
    const authRoute = await shopify.auth.begin({
      shop,
      callbackPath: "/auth/callback",
      isOnline: false, // Use offline tokens for background operations
      rawRequest: request,
    });

    console.log("Redirecting to Shopify for OAuth");
    return redirect(authRoute);
  } catch (error) {
    console.error("OAuth begin error:", error);
    throw new Response(`Auth error: ${error.message}`, { status: 500 });
  }
}
