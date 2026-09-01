/**
 * Print Agent API routes.
 *
 * These are called by the Electron tray app running on the shop's Windows PC.
 * Authenticated via agent_key (query param or X-Agent-Key header).
 *
 * Routes:
 *   GET  /api/agent/poll              — get next pending job (or 204)
 *   POST /api/agent/jobs/:id/accept   — operator accepted, start printing
 *   POST /api/agent/jobs/:id/reject   — operator rejected (with reason)
 *   POST /api/agent/jobs/:id/complete — print finished (success or failure)
 */

const express = require('express');
const path = require('path');
const router = express.Router();

const Job = require('../models/job');
const { agentAuth } = require('../middleware/auth');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

// All agent routes require agent_key authentication
router.use(agentAuth);

// ── GET /api/agent/poll ───────────────────────────────────────
// Returns the next pending job for this shop, or 204 if none.
// The Agent calls this every few seconds.
router.get('/poll', async (req, res) => {
  try {
    const job = await Job.getNextPending(req.shop.id);
    if (!job) {
      return res.status(204).end(); // No content — nothing to print
    }

    // Build a download URL for the image file so the Agent can fetch it
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.json({
      id: job.id,
      imageUrl: `${baseUrl}/uploads/${path.basename(job.file_path)}`,
      backImageUrl: job.back_file_path ? `${baseUrl}/uploads/${path.basename(job.back_file_path)}` : null,
      thumbnailUrl: job.thumbnail_path ? `${baseUrl}/uploads/${path.basename(job.thumbnail_path)}` : null,
      widthMM: Number(job.width_mm),
      heightMM: Number(job.height_mm),
      copies: job.copies,
      colorMode: job.color_mode,
      paperSize: job.paper_size,
      orientation: job.orientation,
      printMode: job.print_mode || 'single',
      createdAt: job.created_at,
    });
  } catch (err) {
    console.error('GET /api/agent/poll error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/agent/jobs/:id/accept ──────────────────────────
router.post('/jobs/:id/accept', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.shop_id !== req.shop.id) return res.status(403).json({ error: 'Not your job' });
    if (job.status !== 'pending') return res.status(409).json({ error: `Job is already ${job.status}` });

    await Job.accept(job.id);
    res.json({ ok: true, status: 'accepted' });
  } catch (err) {
    console.error('POST /api/agent/jobs/:id/accept error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/agent/jobs/:id/reject ──────────────────────────
router.post('/jobs/:id/reject', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.shop_id !== req.shop.id) return res.status(403).json({ error: 'Not your job' });

    const reason = req.body.reason || null;
    await Job.reject(job.id, reason);
    res.json({ ok: true, status: 'rejected' });
  } catch (err) {
    console.error('POST /api/agent/jobs/:id/reject error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/agent/jobs/:id/complete ────────────────────────
router.post('/jobs/:id/complete', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.shop_id !== req.shop.id) return res.status(403).json({ error: 'Not your job' });

    const { success, error } = req.body;
    await Job.complete(job.id, success !== false, error);
    res.json({ ok: true, status: success !== false ? 'printed' : 'failed' });
  } catch (err) {
    console.error('POST /api/agent/jobs/:id/complete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
