/**
 * MySQL connection pool (mysql2 with promise API).
 *
 * Usage:
 *   const db = require('./db');
 *   const [rows] = await db.query('SELECT * FROM shops WHERE token = ?', [token]);
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'qr_print',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Return dates as strings rather than JS Date objects to avoid timezone surprises
  dateStrings: true,
});

module.exports = pool;
