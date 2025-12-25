import { redirect } from "react-router";
import shopify from "../../shopify.server";
import prisma from "../../db.server";

export const loader = async ({ request }) => {
  try {
    console.log("🔄 OAuth callback triggered");
    
    // Handle the OAuth callback
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

    // The session is automatically saved via your sessionStorage.storeSession
    // But let's verify it was actually saved to the database
    const savedSession = await prisma.session.findUnique({
      where: { id: session.id }
    });

    if (!savedSession) {
      console.error("❌ Session not found in database after save!");
      throw new Error("Failed to save session to database");
    }

    if (!savedSession.accessToken) {
      console.error("❌ Session saved but accessToken is missing!");
      throw new Error("Session saved without access token");
    }

    console.log("✅ Session verified in database:", {
      id: savedSession.id,
      shop: savedSession.shop,
      hasToken: !!savedSession.accessToken,
      isOnline: savedSession.isOnline,
    });

    // Redirect to the app with proper shop and host parameters
    const redirectUrl = `/?shop=${session.shop}&host=${Buffer.from(`${session.shop}/admin`).toString('base64')}`;
    
    console.log("✅ Redirecting to app:", redirectUrl);
    
    return redirect(redirectUrl);
    
  } catch (error) {
    console.error("❌ OAuth callback error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
    });
    
    // Redirect to error page or show error
    throw new Response("OAuth authentication failed", { 
      status: 500,
      statusText: error.message 
    });
  }
};
