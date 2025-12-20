import { Outlet, useLoaderData } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server.js";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <ui-nav-menu>
        <a href="/app">Serial Numbers</a>
        <a href="/app/additional">Additional</a>
      </ui-nav-menu>

      <Outlet />
    </AppProvider>
  );
}

export const headers = (args) => boundary.headers(args);
export const ErrorBoundary = boundary.error;
