/**
 * Dashboard (admin) API routes.
 *
 * These are called by the operator's browser dashboard.
 * Authenticated via session cookie (set after POST /api/admin/login).
 *
 * Routes:
 *   POST   /api/admin/login            — authenticate with dashboard password
 *   GET    /api/admin/session           — check if session is valid
 *   POST   /api/admin/logout            — destroy session
 *   GET    /api/admin/jobs              — paginated job list with filters
 *   GET    /api/admin/jobs/:id          — full job details (for edit-then-reprint)
 *   GET    /api/admin/stats             — aggregate counts
 *   DELETE /api/admin/jobs/:id          — delete a job and its files
 *   POST   /api/admin/jobs/:id/reprint  — clone as new pending job
 */

const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const router = express.Router();

const Shop = require('../models/shop');
const Job = require('../models/job');
const { dashboardAuth } = require('../middleware/auth');
const { safeDelete } = require('../services/cleanup');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

// ── POST /api/admin/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { password, shop_token } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // For MVP single-shop: use the first shop, or allow specifying a token
    let shop;
    if (shop_token) {
      shop = await Shop.findByToken(shop_token);
    } else {
      // Default: first shop in the database
      const db = require('../db');
      const [rows] = await db.query('SELECT * FROM shops LIMIT 1');
      shop = rows[0] || null;
    }

    if (!shop) {
      return res.status(404).json({ error: 'No shop configured' });
    }

    const valid = await bcrypt.compare(password, shop.dashboard_password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    req.session.shopId = shop.id;
    req.session.shopName = shop.name;
    res.json({ ok: true, shop: { id: shop.id, name: shop.name } });
  } catch (err) {
    console.error('POST /api/admin/login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/session ────────────────────────────────────
router.get('/session', (req, res) => {
  if (req.session && req.session.shopId) {
    return res.json({ authenticated: true, shopId: req.session.shopId, shopName: req.session.shopName });
  }
  res.json({ authenticated: false });
});

// ── POST /api/admin/logout ────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ── All routes below require authentication ───────────────────
router.use(dashboardAuth);

// ── GET /api/admin/jobs ───────────────────────────────────────
router.get('/jobs', async (req, res) => {
  try {
    const { status, from, to, page, limit } = req.query;
    const result = await Job.list({
      shopId: req.shopId,
      status: status || null,
      from: from || null,
      to: to || null,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });

    // Add full URLs for thumbnails
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    result.jobs = result.jobs.map(job => ({
      ...job,
      thumbnailUrl: job.thumbnail_path ? `${baseUrl}/uploads/${job.thumbnail_path}` : null,
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /api/admin/jobs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/jobs/:id ──────────────────────────────────
// Full job details — used by "edit then reprint" to preload the editor.
router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.shop_id !== req.shopId) return res.status(403).json({ error: 'Not authorized' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      ...job,
      imageUrl: `${baseUrl}/uploads/${job.file_path}`,
      thumbnailUrl: job.thumbnail_path ? `${baseUrl}/uploads/${job.thumbnail_path}` : null,
    });
  } catch (err) {
    console.error('GET /api/admin/jobs/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const stats = await Job.stats(req.shopId);
    res.json(stats);
  } catch (err) {
    console.error('GET /api/admin/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/admin/jobs/:id ────────────────────────────────
router.delete('/jobs/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.shop_id !== req.shopId) return res.status(403).json({ error: 'Not authorized' });

    // Delete files from disk
    safeDelete(job.file_path);
    safeDelete(job.thumbnail_path);

    // Delete database record
    await Job.deleteById(job.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/jobs/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/admin/jobs/:id/reprint ──────────────────────────
// Clones the job as a new pending entry. The Agent's existing poll loop
// picks it up like any other job — no Agent-side changes needed.
router.post('/jobs/:id/reprint', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.shop_id !== req.shopId) return res.status(403).json({ error: 'Not authorized' });

    const newId = await Job.reprint(job.id);
    res.status(201).json({ ok: true, job_id: newId });
  } catch (err) {
    console.error('POST /api/admin/jobs/:id/reprint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
