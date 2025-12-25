import { redirect } from "react-router";
import prisma from "../db.server";
import crypto from "crypto";

/**
 * Shopify OAuth handler
 * Manually handles OAuth flow without relying on shopify-api auth helpers
 */

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const hmac = url.searchParams.get("hmac");
  const host = url.searchParams.get("host");

  console.log("Auth route called:", { shop, hasCode: !!code, hasHmac: !!hmac });

  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  // If we have a code, this is the callback from Shopify
  if (code) {
    console.log("Processing OAuth callback for shop:", shop);
    
    try {
      // Verify HMAC
      const params = Object.fromEntries(url.searchParams);
      delete params.hmac;
      
      const message = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
      
      const generatedHash = crypto
        .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
        .update(message)
        .digest('hex');
      
      if (generatedHash !== hmac) {
        throw new Error("HMAC validation failed");
      }

      console.log("HMAC validated successfully");

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

      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
      }

      const tokenData = await tokenResponse.json();
      
      if (!tokenData.access_token) {
        throw new Error("No access token in response");
      }

      console.log("Got access token, saving session");

      // Create session ID
      const sessionId = `offline_${shop}`;

      // Store the session in the database
      await prisma.session.upsert({
        where: { id: sessionId },
        update: {
          shop,
          state: "",
          isOnline: false,
          scope: tokenData.scope || process.env.SCOPES || "",
          accessToken: tokenData.access_token,
        },
        create: {
          id: sessionId,
          shop,
          state: "",
          isOnline: false,
          scope: tokenData.scope || process.env.SCOPES || "",
          accessToken: tokenData.access_token,
        },
      });

      console.log("Session saved successfully");

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

  // No code - start OAuth flow
  console.log("Starting OAuth flow for shop:", shop);

  try {
    const scopes = process.env.SCOPES || "read_app_proxy,write_app_proxy,read_assigned_fulfillment_orders,write_assigned_fulfillment_orders,read_customers,read_draft_orders,read_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_metaobject_definitions,write_metaobject_definitions,read_metaobjects,write_metaobjects,write_order_edits,read_order_edits,read_orders,write_orders,read_products";
    const redirectUri = `${process.env.SHOPIFY_APP_URL}/auth`;
    const nonce = crypto.randomBytes(16).toString('hex');

    const authUrl = `https://${shop}/admin/oauth/authorize?` +
      `client_id=${process.env.SHOPIFY_API_KEY}&` +
      `scope=${scopes}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${nonce}`;

    console.log("Redirecting to Shopify OAuth");
    return redirect(authUrl);
  } catch (error) {
    console.error("OAuth begin error:", error);
    throw new Response(`Auth error: ${error.message}`, { status: 500 });
  }
}
