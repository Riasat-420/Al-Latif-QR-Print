/**
 * Auth middleware.
 *
 * Two separate authentication schemes:
 * 1. Agent auth: validates agent_key query param against the shops table
 * 2. Dashboard auth: checks for an active express-session (set after login)
 */

const Shop = require('../models/shop');

/**
 * Middleware for Print Agent routes.
 * Expects ?agent_key=<key> on the query string.
 * Attaches req.shop on success.
 */
async function agentAuth(req, res, next) {
  const agentKey = req.query.agent_key || req.headers['x-agent-key'];
  if (!agentKey) {
    return res.status(401).json({ error: 'agent_key is required' });
  }

  try {
    const shop = await Shop.findByAgentKey(agentKey);
    if (!shop) {
      return res.status(403).json({ error: 'Invalid agent_key' });
    }
    req.shop = shop;
    next();
  } catch (err) {
    console.error('Agent auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Middleware for Dashboard routes.
 * Checks that the session has been authenticated via POST /api/admin/login.
 */
function dashboardAuth(req, res, next) {
  if (req.session && req.session.shopId) {
    req.shopId = req.session.shopId;
    return next();
  }
  res.status(401).json({ error: 'Not authenticated. Please log in.' });
}

module.exports = { agentAuth, dashboardAuth };
