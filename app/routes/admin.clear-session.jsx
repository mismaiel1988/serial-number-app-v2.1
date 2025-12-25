import prisma from "../db.server.js";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "0fme0w-es.myshopify.com";
  
  try {
    // Delete all sessions for this shop
    const deleted = await prisma.session.deleteMany({
      where: {
        shop: shop
      }
    });
    
    return new Response(JSON.stringify({ 
      success: true,
      message: `Deleted ${deleted.count} sessions for ${shop}`,
      nextStep: "Now reinstall the app from Shopify Admin"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
