import { AppBridgeProvider } from "@shopify/app-bridge-react";
import { Outlet } from "react-router";
import { useMemo } from "react";

/**
 * Root layout for Shopify embedded app
 * Compatible with:
 * - @shopify/app-bridge-react v4+
 * - React Router v7
 * - Vite
 * - Render
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
    <AppBridgeProvider config={appBridgeConfig}>
      <Outlet />
    </AppBridgeProvider>
  );
}
