/**
 * Cleanup service — automatic file retention and stale-job expiry.
 *
 * Runs on a cron schedule (default: every hour) and:
 * 1. Deletes files for jobs past their expires_at timestamp
 * 2. Auto-expires pending jobs that have waited too long (JOB_EXPIRY_MINUTES)
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const Job = require('../models/job');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
const JOB_EXPIRY_MINUTES = Number(process.env.JOB_EXPIRY_MINUTES) || 30;

/**
 * Delete a file from disk if it exists, ignoring errors.
 */
function safeDelete(filePath) {
  if (!filePath) return;
  const full = path.isAbsolute(filePath) ? filePath : path.join(UPLOAD_DIR, filePath);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (err) {
    console.warn(`[cleanup] Could not delete ${full}:`, err.message);
  }
}

/**
 * Run one cleanup pass: purge expired files + expire stale pending jobs.
 */
async function runCleanup() {
  try {
    // 1. Auto-expire pending jobs that are too old
    const staleCount = await Job.expireStaleJobs(JOB_EXPIRY_MINUTES);
    if (staleCount > 0) {
      console.log(`[cleanup] Expired ${staleCount} stale pending job(s)`);
    }

    // 2. Delete files for jobs past retention window
    const expired = await Job.findExpired();
    for (const job of expired) {
      safeDelete(job.file_path);
      safeDelete(job.thumbnail_path);
      await Job.markExpired(job.id);
    }
    if (expired.length > 0) {
      console.log(`[cleanup] Purged files for ${expired.length} expired job(s)`);
    }
  } catch (err) {
    console.error('[cleanup] Error during cleanup run:', err);
  }
}

/**
 * Start the cleanup cron job.
 * Runs every hour by default.
 */
function startCleanupCron() {
  // Run once immediately on startup
  runCleanup();

  // Then every hour
  cron.schedule('0 * * * *', () => {
    console.log('[cleanup] Running scheduled cleanup…');
    runCleanup();
  });

  console.log('[cleanup] Cleanup cron scheduled (every hour)');
}

module.exports = { startCleanupCron, runCleanup, safeDelete };
