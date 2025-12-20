import { AppProvider } from "@shopify/app-bridge-react";
import { Outlet } from "react-router";
import { useMemo } from "react";

/**
 * Shopify Embedded App Root
 * Compatible with:
 * - React Router v7
 * - Vite
 * - Render
 * - Shopify App Bridge (official)
 */
export default function App() {
  const appBridgeConfig = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const host = params.get("host");

    return {
      apiKey: import.meta.env.VITE_SHOPIFY_API_KEY,
      host,
      forceRedirect: true,
    };
  }, []);

  return (
    <AppProvider config={appBridgeConfig}>
      <Outlet />
    </AppProvider>
  );
}
