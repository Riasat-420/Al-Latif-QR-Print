/**
 * printer.js — PDF generation and silent printing (supports Single, Duplex, and Manual Flip).
 *
 * Directly reuses the proven printing logic:
 * - Downloads the job's image(s)
 * - Builds exact-size PDF using pdf-lib (page dimensions = physical mm size)
 * - Sends to OS print queue via pdf-to-printer with scale:'noscale'
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PDFDocument } = require('pdf-lib');
const { print } = require('pdf-to-printer');

const MM_TO_PT = 2.834645669; // 1mm in PDF points (72pt/inch)

/**
 * Print a single image buffer/URL as an exact physical-size PDF page.
 */
async function printSingleUrl(imageUrl, widthMM, heightMM, copies, printerName) {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Failed to download image from ${imageUrl}: HTTP ${imageRes.status}`);
  const imageBuffer = await imageRes.buffer();

  const contentType = imageRes.headers.get('content-type') || '';
  const isPng = contentType.includes('png') || imageUrl.toLowerCase().endsWith('.png');

  const pdfDoc = await PDFDocument.create();
  const img = isPng ? await pdfDoc.embedPng(imageBuffer) : await pdfDoc.embedJpg(imageBuffer);

  const wPt = widthMM * MM_TO_PT;
  const hPt = heightMM * MM_TO_PT;
  const page = pdfDoc.addPage([wPt, hPt]);
  page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });

  const pdfBytes = await pdfDoc.save();
  const tmpPath = path.join(os.tmpdir(), `qr-print-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.pdf`);
  fs.writeFileSync(tmpPath, pdfBytes);

  const printOptions = { scale: 'noscale', silent: true };
  if (copies && Number(copies) > 1) printOptions.copies = Number(copies);
  if (printerName) printOptions.printer = printerName;

  try {
    await print(tmpPath, printOptions);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

/**
 * Print a 2-page duplex PDF.
 */
async function printDuplex(frontUrl, backUrl, widthMM, heightMM, copies, printerName) {
  const [frontRes, backRes] = await Promise.all([fetch(frontUrl), fetch(backUrl)]);
  if (!frontRes.ok || !backRes.ok) throw new Error('Failed to download front/back images for duplex print');

  const [frontBuf, backBuf] = await Promise.all([frontRes.buffer(), backRes.buffer()]);

  const pdfDoc = await PDFDocument.create();
  const wPt = widthMM * MM_TO_PT;
  const hPt = heightMM * MM_TO_PT;

  // Page 1 (Front)
  const isPng1 = (frontRes.headers.get('content-type') || '').includes('png') || frontUrl.endsWith('.png');
  const img1 = isPng1 ? await pdfDoc.embedPng(frontBuf) : await pdfDoc.embedJpg(frontBuf);
  const p1 = pdfDoc.addPage([wPt, hPt]);
  p1.drawImage(img1, { x: 0, y: 0, width: wPt, height: hPt });

  // Page 2 (Back)
  const isPng2 = (backRes.headers.get('content-type') || '').includes('png') || backUrl.endsWith('.png');
  const img2 = isPng2 ? await pdfDoc.embedPng(backBuf) : await pdfDoc.embedJpg(backBuf);
  const p2 = pdfDoc.addPage([wPt, hPt]);
  p2.drawImage(img2, { x: 0, y: 0, width: wPt, height: hPt });

  const pdfBytes = await pdfDoc.save();
  const tmpPath = path.join(os.tmpdir(), `qr-print-duplex-${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath, pdfBytes);

  const printOptions = { scale: 'noscale', silent: true };
  if (copies && Number(copies) > 1) printOptions.copies = Number(copies);
  if (printerName) printOptions.printer = printerName;

  try {
    await print(tmpPath, printOptions);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

/**
 * Main print dispatcher for jobs.
 */
async function handleAccept(job, printerName) {
  console.log(`[Printer] Processing job #${job.id} (Mode: ${job.printMode || 'single'})…`);

  if (job.printMode === 'duplex' && job.backImageUrl) {
    // Auto-duplex
    await printDuplex(job.imageUrl, job.backImageUrl, job.widthMM, job.heightMM, job.copies, printerName);
  } else {
    // Single page (or front page for manual flip)
    await printSingleUrl(job.imageUrl, job.widthMM, job.heightMM, job.copies, printerName);
  }
}

function handleReject(job) {
  console.log(`[Printer] Job #${job.id} rejected by operator`);
}

module.exports = { handleAccept, handleReject, printSingleUrl, printDuplex };
