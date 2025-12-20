import { Outlet } from "react-router";

/**
 * Root document wrapper.
 * App Bridge / Shopify provider is mounted in app/routes/app.jsx (embedded app shell).
 */
export default function Root() {
  return <Outlet />;
}
