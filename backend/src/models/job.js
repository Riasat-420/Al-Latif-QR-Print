/**
 * Job model — database queries for the jobs table.
 * Handles all CRUD, status transitions, pagination, and stats.
 */

const db = require('../db');

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 14;

const Job = {
  // ── Create ──────────────────────────────────────────────────

  /**
   * Insert a new print job.
   * Sets expires_at based on the configured retention window.
   */
  async create({ shopId, filePath, thumbnailPath, widthMM, heightMM, copies, colorMode, paperSize, orientation }) {
    const [result] = await db.query(
      `INSERT INTO jobs
         (shop_id, file_path, thumbnail_path, width_mm, height_mm, copies, color_mode, paper_size, orientation, expires_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [shopId, filePath, thumbnailPath, widthMM, heightMM, copies || 1, colorMode || 'color', paperSize || 'A4', orientation || 'portrait', RETENTION_DAYS]
    );
    return result.insertId;
  },

  // ── Read ────────────────────────────────────────────────────

  /**
   * Get a single job by ID.
   */
  async findById(id) {
    const [rows] = await db.query('SELECT * FROM jobs WHERE id = ?', [id]);
    return rows[0] || null;
  },

  /**
   * Get a job's current status (lightweight for polling).
   */
  async getStatus(id) {
    const [rows] = await db.query('SELECT status, reject_reason FROM jobs WHERE id = ?', [id]);
    return rows[0] || null;
  },

  /**
   * Get the next pending job for a shop (FIFO — oldest first).
   * Used by the Print Agent's poll endpoint.
   */
  async getNextPending(shopId) {
    const [rows] = await db.query(
      `SELECT * FROM jobs
       WHERE shop_id = ? AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1`,
      [shopId]
    );
    return rows[0] || null;
  },

  /**
   * Paginated job list for the dashboard.
   * @param {object} opts - { shopId, status?, from?, to?, page?, limit? }
   */
  async list({ shopId, status, from, to, page = 1, limit = 20 }) {
    let where = 'WHERE shop_id = ?';
    const params = [shopId];

    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    if (from) {
      where += ' AND created_at >= ?';
      params.push(from);
    }
    if (to) {
      where += ' AND created_at <= ?';
      params.push(to);
    }

    // Count total for pagination
    const [countRows] = await db.query(`SELECT COUNT(*) as total FROM jobs ${where}`, params);
    const total = countRows[0].total;

    // Fetch page
    const offset = (page - 1) * limit;
    const [rows] = await db.query(
      `SELECT id, status, thumbnail_path, width_mm, height_mm, copies, color_mode,
              paper_size, orientation, reject_reason, reprint_of, created_at, printed_at
       FROM jobs ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return { jobs: rows, total, page, limit, pages: Math.ceil(total / limit) };
  },

  // ── Stats ───────────────────────────────────────────────────

  /**
   * Aggregate counts for the dashboard stats bar.
   */
  async stats(shopId) {
    const [rows] = await db.query(
      `SELECT
         SUM(status = 'printed')                                              AS printed_total,
         SUM(status = 'printed' AND DATE(printed_at) = CURDATE())             AS printed_today,
         SUM(status = 'printed' AND printed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS printed_week,
         SUM(status = 'failed')                                               AS failed,
         SUM(status = 'rejected')                                             AS rejected,
         SUM(status = 'pending')                                              AS pending
       FROM jobs
       WHERE shop_id = ?`,
      [shopId]
    );
    const s = rows[0];
    return {
      printedToday: Number(s.printed_today) || 0,
      printedWeek:  Number(s.printed_week)  || 0,
      printedTotal: Number(s.printed_total) || 0,
      failed:       Number(s.failed)        || 0,
      rejected:     Number(s.rejected)      || 0,
      pending:      Number(s.pending)       || 0,
    };
  },

  // ── Status transitions ─────────────────────────────────────

  async accept(id) {
    await db.query(
      `UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = ? AND status = 'pending'`,
      [id]
    );
  },

  async reject(id, reason) {
    await db.query(
      `UPDATE jobs SET status = 'rejected', reject_reason = ?, updated_at = NOW()
       WHERE id = ? AND status IN ('pending', 'accepted')`,
      [reason || null, id]
    );
  },

  async complete(id, success, error) {
    if (success) {
      await db.query(
        `UPDATE jobs SET status = 'printed', printed_at = NOW(), updated_at = NOW()
         WHERE id = ? AND status = 'accepted'`,
        [id]
      );
    } else {
      await db.query(
        `UPDATE jobs SET status = 'failed', reject_reason = ?, updated_at = NOW()
         WHERE id = ? AND status = 'accepted'`,
        [error || 'Unknown print error', id]
      );
    }
  },

  // ── Reprint ────────────────────────────────────────────────

  /**
   * Clone a job as a new pending entry for reprint.
   * Returns the new job's ID.
   */
  async reprint(originalId) {
    const original = await Job.findById(originalId);
    if (!original) return null;

    const [result] = await db.query(
      `INSERT INTO jobs
         (shop_id, file_path, thumbnail_path, width_mm, height_mm, copies, color_mode,
          paper_size, orientation, reprint_of, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [
        original.shop_id, original.file_path, original.thumbnail_path,
        original.width_mm, original.height_mm, original.copies,
        original.color_mode, original.paper_size, original.orientation,
        originalId, RETENTION_DAYS,
      ]
    );
    return result.insertId;
  },

  // ── Delete ─────────────────────────────────────────────────

  async deleteById(id) {
    const job = await Job.findById(id);
    if (!job) return null;
    await db.query('DELETE FROM jobs WHERE id = ?', [id]);
    return job; // Return the deleted job so the caller can clean up files
  },

  // ── Cleanup / retention ────────────────────────────────────

  /**
   * Find all jobs past their expiry date.
   * Returns rows so the caller can delete files from disk.
   */
  async findExpired() {
    const [rows] = await db.query(
      `SELECT id, file_path, thumbnail_path FROM jobs
       WHERE expires_at < NOW() AND status != 'expired'`
    );
    return rows;
  },

  async markExpired(id) {
    await db.query(
      `UPDATE jobs SET status = 'expired', file_path = '', thumbnail_path = '', updated_at = NOW()
       WHERE id = ?`,
      [id]
    );
  },

  // ── Expire unaccepted jobs ─────────────────────────────────

  /**
   * Auto-expire jobs that have been pending too long (e.g. 30 minutes).
   */
  async expireStaleJobs(minutes) {
    const [result] = await db.query(
      `UPDATE jobs SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [minutes]
    );
    return result.affectedRows;
  },
};

module.exports = Job;
