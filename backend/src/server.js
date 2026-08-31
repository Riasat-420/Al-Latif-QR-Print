/**
 * QR Print MVP — Backend Server
 *
 * Express app that serves three audiences:
 * 1. Customers (Web Studio on phone) — submit print jobs
 * 2. Print Agent (Windows tray app) — poll for and process jobs
 * 3. Dashboard (operator browser) — manage job history
 *
 * Start:  npm start  (or: npm run dev  for auto-reload)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const customerRoutes = require('./routes/customer');
const agentRoutes = require('./routes/agent');
const adminRoutes = require('./routes/admin');
const { startCleanupCron } = require('./services/cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Ensure upload directory exists ──────────────────────────
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: true,              // Allow any origin for MVP (tighten for production)
  credentials: true,         // Allow cookies for dashboard session auth
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// Session for dashboard authentication
app.use(session({
  secret: process.env.SESSION_SECRET || 'qr-print-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
  },
}));

// ── Serve uploaded files (images + thumbnails) ──────────────
// The Agent downloads job images from here, dashboard shows thumbnails.
app.use('/uploads', express.static(UPLOAD_DIR));

// ── Serve the Web Studio (customer-facing SPA) ──────────────
const webStudioDir = path.resolve(__dirname, '../../web-studio');
if (fs.existsSync(webStudioDir)) {
  app.use('/studio', express.static(webStudioDir));
}

// ── Serve the Dashboard (operator-facing SPA) ───────────────
const dashboardDir = path.resolve(__dirname, '../../dashboard');
if (fs.existsSync(dashboardDir)) {
  app.use('/dashboard', express.static(dashboardDir));
}

// ── API Routes ──────────────────────────────────────────────
app.use('/api', customerRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/admin', adminRoutes);

// ── QR shortcut: /s/:token redirects to the Web Studio ──────
app.get('/s/:token', (req, res) => {
  res.redirect(`/studio/index.html?shop=${req.params.token}`);
});

// ── Health check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), version: '1.0.0' });
});

// ── Error handler ───────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `File too large. Maximum size: ${process.env.MAX_FILE_SIZE_MB || 10} MB`,
    });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🖨️  QR Print Backend is running on port ${PORT}`);
  console.log(`   Health:     http://localhost:${PORT}/health`);
  console.log(`   Web Studio: http://localhost:${PORT}/studio/`);
  console.log(`   Dashboard:  http://localhost:${PORT}/dashboard/`);
  console.log(`   API base:   http://localhost:${PORT}/api/\n`);

  // Start the file-cleanup cron
  startCleanupCron();
});
