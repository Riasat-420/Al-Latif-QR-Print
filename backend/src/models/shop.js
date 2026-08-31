/**
 * Shop model — database queries for the shops table.
 */

const db = require('../db');

const Shop = {
  /**
   * Find a shop by its public QR token.
   * Returns the shop row or null.
   */
  async findByToken(token) {
    const [rows] = await db.query(
      'SELECT id, name, token, agent_key, dashboard_password_hash FROM shops WHERE token = ?',
      [token]
    );
    return rows[0] || null;
  },

  /**
   * Find a shop by its agent_key (used to authenticate Print Agent poll requests).
   */
  async findByAgentKey(agentKey) {
    const [rows] = await db.query(
      'SELECT id, name, token, agent_key FROM shops WHERE agent_key = ?',
      [agentKey]
    );
    return rows[0] || null;
  },

  /**
   * Create a new shop.
   */
  async create({ name, token, agentKey, dashboardPasswordHash }) {
    const [result] = await db.query(
      `INSERT INTO shops (name, token, agent_key, dashboard_password_hash)
       VALUES (?, ?, ?, ?)`,
      [name, token, agentKey, dashboardPasswordHash]
    );
    return result.insertId;
  },
};

module.exports = Shop;
