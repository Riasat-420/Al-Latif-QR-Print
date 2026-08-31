/**
 * Seed script — creates the default shop for MVP.
 *
 * Usage:  npm run seed
 *
 * Reads SHOP_NAME, DASHBOARD_PASSWORD from .env and creates a shop
 * row with a randomly generated token and agent_key.
 */

require('dotenv').config();

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('./db');
const Shop = require('./models/shop');

async function seed() {
  console.log('🌱 Seeding database…\n');

  const shopName = process.env.SHOP_NAME || 'My Print Shop';
  const dashboardPassword = process.env.DASHBOARD_PASSWORD || 'admin123';

  // Generate secure random tokens
  const shopToken = crypto.randomBytes(8).toString('hex');  // 16-char hex (short enough for a QR)
  const agentKey = crypto.randomBytes(24).toString('hex');   // 48-char hex (longer, it's a secret)

  // Hash the dashboard password
  const passwordHash = await bcrypt.hash(dashboardPassword, 12);

  try {
    const shopId = await Shop.create({
      name: shopName,
      token: shopToken,
      agentKey,
      dashboardPasswordHash: passwordHash,
    });

    console.log('✅ Shop created successfully!\n');
    console.log('   Shop ID:             ', shopId);
    console.log('   Shop Name:           ', shopName);
    console.log('   QR Token:            ', shopToken);
    console.log('   Agent Key:           ', agentKey);
    console.log('   Dashboard Password:  ', dashboardPassword);
    console.log(`\n   QR URL:  https://yourdomain.com/s/${shopToken}`);
    console.log(`   (Replace "yourdomain.com" with your actual domain)\n`);
    console.log('   ⚠️  Save the Agent Key — you\'ll need it to configure the Print Agent.\n');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      console.log('⚠️  A shop already exists. If you need to re-seed, clear the shops table first.');
    } else {
      console.error('❌ Seed failed:', err);
    }
  }

  await db.end();
  process.exit(0);
}

seed();
