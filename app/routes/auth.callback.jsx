import { redirect } from "@remix-run/node";
import shopify from "../../shopify.server";
import prisma from "../../db.server";

export const loader = async ({ request }) => {
  try {
    // Handle the OAuth callback
    const { session } = await shopify.auth.callback({
      rawRequest: request,
    });

    console.log("✅ OAuth callback received:", {
      shop: session.shop,
      hasToken: !!session.accessToken,
      tokenPrefix: session.accessToken?.substring(0, 10),
      isOnline: session.isOnline,
      scope: session.scope,
    });

    // Session is automatically saved via sessionStorage.storeSession
    // But let's verify it was saved
    const savedSession = await prisma.session.findUnique({
      where: { id: session.id }
    });

    if (!savedSession?.accessToken) {
      console.error("❌ Session saved but missing accessToken!");
      throw new Error("Failed to save access token");
    }

    console.log("✅ Session saved successfully to database");

    // Redirect to app home
    return redirect(`/?shop=${session.shop}&host=${btoa(`${session.shop}/admin`)}`);
    
  } catch (error) {
    console.error("❌ OAuth callback error:", error);
    throw error;
  }
};
