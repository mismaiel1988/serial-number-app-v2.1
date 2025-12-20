import { Provider } from "@shopify/app-bridge-react";
import { Outlet } from "react-router";
import { useMemo } from "react";

export default function App() {
  const appBridgeConfig = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const host = params.get("host");

    return {
      apiKey: import.meta.env.VITE_SHOPIFY_API_KEY,
      host,
      forceRedirect: true
    };
  }, []);

  return (
    <Provider config={appBridgeConfig}>
      <Outlet />
    </Provider>
  );
}
