/**
 * Action: Handle sync button click
 */
export async function action({ request }) {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    
    console.log("Action called with shop:", shop);
    
    if (!shop) {
      return { success: false, error: "Missing shop parameter" };
    }
    
    // Get session from database - try both online and offline sessions
    let session = await prisma.session.findFirst({
      where: { shop, isOnline: false },
      orderBy: { id: "desc" }
    });
    
    // If no offline session, try online session
    if (!session) {
      console.log("No offline session found, trying online session");
      session = await prisma.session.findFirst({
        where: { shop, isOnline: true },
        orderBy: { id: "desc" }
      });
    }
    
    // If still no session, list all sessions for debugging
    if (!session) {
      const allSessions = await prisma.session.findMany({
        select: { id: true, shop: true, isOnline: true }
      });
      console.log("All sessions in database:", allSessions);
      return { 
        success: false, 
        error: `No active session found for shop: ${shop}. Found ${allSessions.length} total sessions in database.` 
      };
    }
    
    console.log("Found session:", { id: session.id, shop: session.shop, isOnline: session.isOnline });
    
    const formData = await request.formData();
    const actionType = formData.get("action");
    
    if (actionType === "sync") {
      const result = await syncOrdersFromShopify(session, {
        limit: 250,
        onlySaddleOrders: true
      });
      
      return result;
    }
    
    return { success: false, error: "Unknown action" };
  } catch (error) {
    console.error("Action error:", error);
    return { success: false, error: error.message };
  }
}
