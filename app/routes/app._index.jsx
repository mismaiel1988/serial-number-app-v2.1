import { redirect } from "react-router";

export async function loader({ request }) {
  // Get shop from URL params
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  // Redirect to /additional with shop param
  if (shop) {
    return redirect(`/additional?shop=${shop}`);
  }
  
  // If no shop param, still redirect but without it
  return redirect("/additional");
}

export default function AppIndex() {
  return null; // This won't render because of the redirect
}
