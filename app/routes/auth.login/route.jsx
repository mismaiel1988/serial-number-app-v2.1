import { redirect } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const result = await login(request);
  
  // login() returns a URL string - redirect to it
  return redirect(result);
};

