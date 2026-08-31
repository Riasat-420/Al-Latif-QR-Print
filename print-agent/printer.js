/**
 * printer.js — PDF generation and silent printing.
 *
 * Directly reuses the proven printing logic from the existing pc-agent/server.js:
 * - Downloads the job's image
 * - Builds an exact-size PDF using pdf-lib (page dimensions = physical mm size)
 * - Sends it to the OS print queue via pdf-to-printer with scale:'noscale'
 *
 * This is the core printing pipeline — field-tested, just wrapped for Electron.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PDFDocument } = require('pdf-lib');
const { print } = require('pdf-to-printer');

const MM_TO_PT = 2.834645669; // 1mm in PDF points (72pt/inch)

/**
 * Accept and print a job.
 *
 * @param {object} job — Job data from the poll response:
 *   { id, imageUrl, widthMM, heightMM, copies, colorMode, paperSize }
 * @param {string} [printerName] — Specific printer name, or undefined for default.
 */
async function handleAccept(job, printerName) {
  console.log(`[Printer] Processing job #${job.id}…`);

  // 1. Download the image
  const imageRes = await fetch(job.imageUrl);
  if (!imageRes.ok) throw new Error(`Failed to download image: HTTP ${imageRes.status}`);
  const imageBuffer = await imageRes.buffer();

  // Detect format from content-type or URL
  const contentType = imageRes.headers.get('content-type') || '';
  const isPng = contentType.includes('png') || job.imageUrl.toLowerCase().endsWith('.png');

  // 2. Build exact-size PDF (same logic as pc-agent/server.js)
  const pdfDoc = await PDFDocument.create();
  const img = isPng
    ? await pdfDoc.embedPng(imageBuffer)
    : await pdfDoc.embedJpg(imageBuffer);

  const wPt = job.widthMM * MM_TO_PT;
  const hPt = job.heightMM * MM_TO_PT;
  const page = pdfDoc.addPage([wPt, hPt]);

  // Draw image to fill the page exactly
  page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });

  const pdfBytes = await pdfDoc.save();

  // 3. Write PDF to temp file
  const tmpPath = path.join(os.tmpdir(), `qr-print-job-${job.id}-${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath, pdfBytes);

  // 4. Print silently
  //    scale:'noscale' is critical — it tells the printer to output the
  //    PDF page at its actual physical size instead of scaling to fit.
  const printOptions = {
    scale: 'noscale',
    silent: true,
  };

  if (job.copies && Number(job.copies) > 1) {
    printOptions.copies = Number(job.copies);
  }

  if (printerName) {
    printOptions.printer = printerName;
  }

  try {
    await print(tmpPath, printOptions);
    console.log(`[Printer] Job #${job.id} sent to printer successfully`);
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

/**
 * Handle rejection (nothing to print, just log).
 */
function handleReject(job) {
  console.log(`[Printer] Job #${job.id} rejected by operator`);
}

module.exports = { handleAccept, handleReject };
