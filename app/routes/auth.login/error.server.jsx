export function loginErrorMessage(error) {
  if (!error) return {};
  return { shop: error.message };
}
