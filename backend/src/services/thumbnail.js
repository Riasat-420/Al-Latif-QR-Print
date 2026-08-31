/**
 * Thumbnail service — generates small preview images for dashboard/notifications.
 * Uses Sharp (pure JS, no native compile needed on most systems).
 */

const sharp = require('sharp');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
const THUMB_WIDTH = 300;

/**
 * Generate a thumbnail from an uploaded image file.
 * @param {string} filePath - Absolute path to the original image
 * @returns {string} - Filename of the generated thumbnail (in UPLOAD_DIR)
 */
async function generateThumbnail(filePath) {
  const thumbName = `thumb_${uuidv4()}.jpg`;
  const thumbPath = path.join(UPLOAD_DIR, thumbName);

  await sharp(filePath)
    .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toFile(thumbPath);

  return thumbName;
}

module.exports = { generateThumbnail };
