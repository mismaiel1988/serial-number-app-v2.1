import { redirect } from "react-router";
import { shopify } from "../shopify.server";
import prisma from "../db.server";

/**
 * Shopify OAuth callback handler
 * Handles both the initial auth request and the callback
 */

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const host = url.searchParams.get("host");
  const hmac = url.searchParams.get("hmac");
  const state = url.searchParams.get("state");

  console.log("Auth route called:", { shop, hasCode: !!code, host, hmac, state });

  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  // If we have a code and hmac, this is the callback from Shopify
  if (code && hmac) {
    console.log("Processing OAuth callback");
    
    try {
      // Validate the callback
      const isValid = await shopify.auth.validateAuthCallback({
        rawRequest: request,
      });

      if (!isValid) {
        throw new Error("Invalid OAuth callback");
      }

      // Get the session from the callback
      const sessionId = shopify.session.getOfflineId(shop);
      
      // Create session manually since the callback validation passed
      const session = {
        id: sessionId,
        shop,
        state: state || "",
        isOnline: false,
        scope: process.env.SCOPES || "",
        accessToken: "", // Will be filled by token exchange
      };

      // Exchange code for access token
      const tokenResponse = await fetch(
        `https://${shop}/admin/oauth/access_token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: process.env.SHOPIFY_API_KEY,
            client_secret: process.env.SHOPIFY_API_SECRET,
            code,
          }),
        }
      );

      const tokenData = await tokenResponse.json();
      
      if (!tokenData.access_token) {
        throw new Error("Failed to get access token");
      }

      console.log("Got access token, saving session");

      // Store the session in the database
      await prisma.session.upsert({
        where: { id: sessionId },
        update: {
          shop,
          state: state || "",
          isOnline: false,
          scope: tokenData.scope || process.env.SCOPES || "",
          accessToken: tokenData.access_token,
        },
        create: {
          id: sessionId,
          shop,
          state: state || "",
          isOnline: false,
          scope: tokenData.scope || process.env.SCOPES || "",
          accessToken: tokenData.access_token,
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
    // Build the OAuth URL manually
    const scopes = process.env.SCOPES?.split(",").join(",") || "";
    const redirectUri = `${process.env.SHOPIFY_APP_URL}/auth`;
    const nonce = Math.random().toString(36).substring(7);

    const authUrl = `https://${shop}/admin/oauth/authorize?` +
      `client_id=${process.env.SHOPIFY_API_KEY}&` +
      `scope=${scopes}&` +
      `redirect_uri=${redirectUri}&` +
      `state=${nonce}`;

    console.log("Redirecting to:", authUrl);
    return redirect(authUrl);
  } catch (error) {
    console.error("OAuth begin error:", error);
    throw new Response(`Auth error: ${error.message}`, { status: 500 });
  }
}
