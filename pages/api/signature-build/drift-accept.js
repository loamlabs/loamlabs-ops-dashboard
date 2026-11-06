// Create Signature Build tool: accept the current component prices as the new drift basis (writes only the basis table, never Shopify). Needs both secrets.
const { route } = require("../../../lib/signature-build/runtime");

export default async function handler(req, res) {
  return route("drift-accept", req, res);
}
