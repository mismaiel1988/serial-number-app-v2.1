import { json } from "react-router";

/**
 * App index route
 * Replaces deprecated @shopify/shopify-app-react-router usage
 * Safe for Vite SSR + React Router v7
 */

export async function loader() {
  return json({
    status: "ok"
  });
}

export default function AppIndex() {
  return (
    <div style={{ padding: "1.5rem" }}>
      <h1>Serial Number App</h1>
      <p>The app is running successfully.</p>
    </div>
  );
}
