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

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const fs = require('fs');

const customerRoutes = require('./routes/customer');
const agentRoutes = require('./routes/agent');
const adminRoutes = require('./routes/admin');
const { startCleanupCron } = require('./services/cleanup');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Ensure upload directory exists ──────────────────────────
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create uploads directory:', e.message);
  }
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
app.use('/uploads', express.static(UPLOAD_DIR));

// ── Resolve static directories flexibly ─────────────────────
function findStaticDir(dirName) {
  const candidates = [
    path.resolve(__dirname, '../../', dirName),
    path.resolve(__dirname, '../', dirName),
    path.resolve(process.cwd(), dirName),
    path.resolve(process.cwd(), 'backend', dirName),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── Serve the Web Studio (customer-facing SPA) ──────────────
const webStudioDir = findStaticDir('web-studio');
if (webStudioDir) {
  console.log(`[Static] Serving Web Studio from: ${webStudioDir}`);
  app.use('/studio', express.static(webStudioDir));
} else {
  console.warn('[Static] Web Studio directory not found.');
}

// ── Serve the Dashboard (operator-facing SPA) ───────────────
const dashboardDir = findStaticDir('dashboard');
if (dashboardDir) {
  console.log(`[Static] Serving Dashboard from: ${dashboardDir}`);
  app.use('/dashboard', express.static(dashboardDir));
} else {
  console.warn('[Static] Dashboard directory not found.');
}

// ── API Routes ──────────────────────────────────────────────
app.use('/api', customerRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/admin', adminRoutes);

// ── Root route: redirect to dashboard or studio ─────────────
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Al-Latif Digital & Telecom Center — QR Print</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', system-ui, sans-serif;
          background: #0f0f0f;
          color: #fdfdfd;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
          background-image:
            radial-gradient(circle at 10% 20%, rgba(255, 77, 0, 0.08) 0%, transparent 40%),
            radial-gradient(circle at 90% 80%, rgba(255, 204, 0, 0.05) 0%, transparent 40%);
        }
        .card {
          background: rgba(24, 24, 24, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 1.25rem;
          padding: 40px 32px;
          max-width: 440px;
          text-align: center;
          box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(16px);
        }
        .logo { font-size: 46px; margin-bottom: 12px; filter: drop-shadow(0 0 16px rgba(255, 77, 0, 0.28)); }
        h1 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 8px;
          background: linear-gradient(135deg, #ffffff 40%, #ffa985);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        p { color: #a3a3a3; font-size: 0.875rem; margin-bottom: 28px; line-height: 1.5; }
        .btn {
          display: block;
          padding: 13px 20px;
          margin: 10px 0;
          background: linear-gradient(135deg, #ff4d00, #d63200);
          color: #ffffff;
          text-decoration: none;
          border-radius: 0.75rem;
          font-weight: 600;
          font-size: 0.9rem;
          box-shadow: 0 4px 15px rgba(255, 77, 0, 0.28);
          transition: transform 0.15s;
        }
        .btn:active { transform: scale(0.97); }
        .btn-sec {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fdfdfd;
          box-shadow: none;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">🖨️</div>
        <h1>Al-Latif QR Print</h1>
        <p>Al-Latif Digital & Telecom Center — Instant mobile document scanning & high-precision print processing.</p>
        <a class="btn" href="/dashboard/">Open Operator Dashboard</a>
        <a class="btn btn-sec" href="/health">System Health Check</a>
      </div>
    </body>
    </html>
  `);
});

// ── QR shortcut: /s/:token redirects to the Web Studio ──────
app.get('/s/:token', (req, res) => {
  res.redirect(`/studio/index.html?shop=${req.params.token}`);
});

// ── Health check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), version: '1.0.0', service: 'Al-Latif QR Print' });
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
  try {
    startCleanupCron();
  } catch (e) {
    console.warn('[cleanup] Could not start cron:', e.message);
  }
});
