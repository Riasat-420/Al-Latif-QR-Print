/**
 * tray.js — System tray icon state management.
 *
 * Controls the tray icon appearance and tooltip based on agent state:
 * - idle:     Gray  — no jobs pending
 * - waiting:  Blue  — job waiting for operator action
 * - printing: Green — actively printing
 * - error:    Red   — last operation failed
 */

const { nativeImage } = require('electron');

let trayRef = null;

const STATES = {
  idle:     { color: '#6b7280', tooltip: 'QR Print Agent — Idle' },
  waiting:  { color: '#3b82f6', tooltip: 'QR Print Agent — Job Waiting!' },
  printing: { color: '#10b981', tooltip: 'QR Print Agent — Printing…' },
  error:    { color: '#ef4444', tooltip: 'QR Print Agent — Error' },
};

function setTrayRef(tray) {
  trayRef = tray;
}

function setTrayState(state) {
  if (!trayRef) return;
  const config = STATES[state] || STATES.idle;

  const size = 16;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="8" cy="8" r="7" fill="${config.color}"/></svg>`;
  const icon = nativeImage.createFromBuffer(Buffer.from(svg));

  try {
    trayRef.setImage(icon);
    trayRef.setToolTip(config.tooltip);
  } catch (err) {
    console.warn('Could not update tray icon:', err.message);
  }
}

module.exports = { setTrayRef, setTrayState };
