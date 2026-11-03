// Create Signature Build tool: runs. Needs x-dashboard-auth AND x-signature-tool-key. See lib/signature-build/handler.js.
const { route } = require('../../../lib/signature-build/runtime');

export default async function handler(req, res) {
  return route('runs', req, res);
}
