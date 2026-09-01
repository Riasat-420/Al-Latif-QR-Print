/**
 * Customer-facing API routes.
 *
 * These are called by the Web Studio running on the customer's phone.
 * No authentication — the shop token in the QR URL is the access control.
 *
 * Routes:
 *   GET  /api/shop/:token       — validate QR, return shop info
 *   POST /api/jobs              — submit a print job (multipart file upload)
 *   GET  /api/jobs/:id/status   — poll job status
 */

const express = require('express');
const path = require('path');
const router = express.Router();

const Shop = require('../models/shop');
const Job = require('../models/job');
const upload = require('../middleware/upload');
const { generateThumbnail } = require('../services/thumbnail');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

// ── GET /api/shop/:token ──────────────────────────────────────
// Validates the QR code and returns basic shop info.
// The Web Studio calls this first to confirm the token is real.
router.get('/shop/:token', async (req, res) => {
  try {
    const shop = await Shop.findByToken(req.params.token);
    if (!shop) {
      return res.status(404).json({ error: 'Invalid or expired QR code' });
    }
    res.json({
      name: shop.name,
      token: shop.token,
      // Paper sizes the Web Studio should offer
      paperSizes: ['A4', 'A5', 'A6', 'Letter', 'ID Card', 'Registration Card', 'Custom'],
    });
  } catch (err) {
    console.error('GET /api/shop/:token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/jobs ────────────────────────────────────────────
// Accepts a print job: image file + optional back_image + print settings.
// Returns the new job's ID so the customer can poll for status.
const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'back_image', maxCount: 1 },
]);

router.post('/jobs', (req, res, next) => {
  uploadFields(req, res, err => {
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  try {
    const { shop_token, widthMM, heightMM, copies, colorMode, paperSize, orientation, printMode } = req.body;

    if (!shop_token) {
      return res.status(400).json({ error: 'shop_token is required' });
    }

    const frontFile = req.files?.image ? req.files.image[0] : (req.file || null);
    const backFile = req.files?.back_image ? req.files.back_image[0] : null;

    if (!frontFile) {
      return res.status(400).json({ error: 'Image file is required (field name: "image")' });
    }
    if (!widthMM || !heightMM) {
      return res.status(400).json({ error: 'widthMM and heightMM are required' });
    }

    const shop = await Shop.findByToken(shop_token);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this token' });
    }

    // Generate small preview thumbnail from front image
    let thumbnailPath = null;
    try {
      thumbnailPath = await generateThumbnail(frontFile.path, UPLOAD_DIR);
    } catch (e) {
      console.warn('Thumbnail generation skipped:', e.message);
    }

    const jobId = await Job.create({
      shopId: shop.id,
      filePath: frontFile.path,
      backFilePath: backFile ? backFile.path : null,
      thumbnailPath,
      widthMM: parseFloat(widthMM),
      heightMM: parseFloat(heightMM),
      copies: parseInt(copies, 10) || 1,
      colorMode: colorMode || 'color',
      paperSize: paperSize || 'A4',
      orientation: orientation || 'portrait',
      printMode: printMode || 'single',
    });

    res.status(201).json({ job_id: jobId });
  } catch (err) {
    console.error('POST /api/jobs error:', err);
    res.status(500).json({ error: 'Failed to create print job' });
  }
});

// ── GET /api/jobs/:id/status ──────────────────────────────────
// Lightweight status poll for the customer's status screen.
router.get('/jobs/:id/status', async (req, res) => {
  try {
    const status = await Job.getStatus(req.params.id);
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(status);
  } catch (err) {
    console.error('GET /api/jobs/:id/status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
