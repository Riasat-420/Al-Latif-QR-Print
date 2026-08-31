/**
 * Card Print Agent
 * -----------------
 * Runs on the PC that's physically connected to the printer.
 * Listens on the local network for print jobs from a phone/browser
 * running Card Print Studio, builds an exact-size PDF from the
 * submitted page image, and sends it straight to the printer's
 * OS print queue - no print dialog, no manual step on the PC.
 *
 * Setup (Windows):
 *   1. Install Node.js from https://nodejs.org (LTS version)
 *   2. Open Command Prompt in this folder
 *   3. Run:  npm install
 *   4. Run:  npm start
 *   5. Note the "http://<ip>:3000/test.html" URL printed in the console
 *   6. Allow Node.js through Windows Firewall when prompted (Private network)
 *   7. On a phone connected to the SAME WiFi, open that URL to test
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PDFDocument } = require('pdf-lib');
const { print, getPrinters, getDefaultPrinter } = require('pdf-to-printer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '80mb' })); // page images can be a few MB as base64
app.use(express.static(path.join(__dirname, 'public')));

const MM_TO_PT = 2.834645669; // 1mm in PDF points (72 pt per inch)

// ---- Health check: lets the phone/browser confirm it can reach this PC ----
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---- List installed printers, so the front-end can offer a picker ----
app.get('/printers', async (req, res) => {
  try {
    const printers = await getPrinters();
    const def = await getDefaultPrinter().catch(() => null);
    res.json({ printers, default: def ? def.name : null });
  } catch (err) {
    console.error('getPrinters failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- The main endpoint: receive a page image, print it exactly to size ----
app.post('/print', async (req, res) => {
  const { imageDataUrl, widthMM, heightMM, copies, printer } = req.body || {};

  if (!imageDataUrl) return res.status(400).json({ error: 'imageDataUrl is required' });
  if (!widthMM || !heightMM) return res.status(400).json({ error: 'widthMM and heightMM are required' });

  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(imageDataUrl);
  if (!match) return res.status(400).json({ error: 'imageDataUrl must be a PNG or JPEG data URL' });
  const [, format, base64] = match;

  let tmpPath;
  try {
    const imgBytes = Buffer.from(base64, 'base64');

    // Build a PDF whose page size is EXACTLY the physical size requested.
    // This is what lets us print custom card/half-page sizes accurately -
    // the PDF page itself carries the dimensions, we don't rely on the
    // printer driver's named paper sizes.
    const pdfDoc = await PDFDocument.create();
    const img = format === 'png' ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
    const wPt = widthMM * MM_TO_PT;
    const hPt = heightMM * MM_TO_PT;
    const page = pdfDoc.addPage([wPt, hPt]);
    page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
    const pdfBytes = await pdfDoc.save();

    tmpPath = path.join(os.tmpdir(), `card-print-job-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, pdfBytes);

    // scale:'noscale' is important - it tells the printer to output the
    // PDF page at its actual size instead of stretching/shrinking it to
    // fit a different sheet size.
    const printOptions = { scale: 'noscale', silent: true };
    if (copies && Number(copies) > 1) printOptions.copies = Number(copies);
    if (printer) printOptions.printer = printer;

    await print(tmpPath, printOptions);

    res.json({ ok: true, message: 'Sent to printer' });
  } catch (err) {
    console.error('Print failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (tmpPath) fs.unlink(tmpPath, () => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  console.log(`\nCard Print Agent is running on port ${PORT}`);
  console.log('Open this from a phone on the SAME WiFi network:');
  if (ips.length === 0) {
    console.log('  (No LAN IP detected - make sure this PC is connected to WiFi/Ethernet)');
  } else {
    ips.forEach(ip => console.log(`  http://${ip}:${PORT}/test.html`));
  }
  console.log(`Or locally on this PC: http://localhost:${PORT}/test.html\n`);
});
