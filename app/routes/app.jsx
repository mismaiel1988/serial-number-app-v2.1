import AppBridgeReact from "@shopify/app-bridge-react";
const { Provider } = AppBridgeReact;
import { Outlet, useLocation } from "react-router";
import { useMemo } from "react";

export default function App() {
  const location = useLocation();
  
  const appBridgeConfig = useMemo(() => {
    // Check if we're in the browser before accessing window
    if (typeof window === "undefined") {
      return null;
    }
    
    const params = new URLSearchParams(window.location.search);
    const host = params.get("host");

    return {
      apiKey: import.meta.env.VITE_SHOPIFY_API_KEY,
      host,
      forceRedirect: true
    };
  }, []);

  // Don't render Provider on server
  if (!appBridgeConfig) {
    return <Outlet />;
  }

  return (
    <Provider config={appBridgeConfig}>
      <Outlet />
    </Provider>
  );
}
