/**
 * QR Print Agent — Electron main process.
 *
 * System-tray Windows app that:
 * 1. Polls the backend for pending print jobs
 * 2. Shows Accept/Reject notification on new job
 * 3. On Accept: downloads image, builds exact-size PDF, prints silently
 * 4. Reports result back to the backend
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, dialog, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');

const { startPolling, stopPolling } = require('./poller');
const { setTrayRef } = require('./tray');

// ── Single instance lock ────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ── Config store ────────────────────────────────────────
const store = new Store({
  defaults: {
    serverUrl: '',
    shopToken: '',
    agentKey: '',
    printer: '',
    pollInterval: 5000, // ms
    autoLaunch: true,
  },
});

// ── Prevent app from quitting when all windows are closed ─
app.on('window-all-closed', e => e.preventDefault());

// ── App ready ───────────────────────────────────────────
let tray = null;
let settingsWindow = null;

app.whenReady().then(() => {
  // Hide dock icon on macOS (Windows doesn't have one)
  if (app.dock) app.dock.hide();

  createTray();

  // Auto-launch on boot
  const autoLauncher = new AutoLaunch({
    name: 'QR Print Agent',
    isHidden: true,
  });

  if (store.get('autoLaunch')) {
    autoLauncher.enable().catch(() => {});
  }

  // Start polling if configured
  const serverUrl = store.get('serverUrl');
  const agentKey = store.get('agentKey');
  if (serverUrl && agentKey) {
    startPolling(store);
  } else {
    openSettings();
  }
});

// ── Tray ────────────────────────────────────────────────
function createTray() {
  // Use a simple colored circle as tray icon (will be replaced with proper icon)
  const iconPath = path.join(__dirname, 'assets', 'tray-idle.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    // Fallback: create a 16x16 icon programmatically
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon.isEmpty() ? createDefaultIcon('idle') : icon);
  tray.setToolTip('QR Print Agent — Idle');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'QR Print Agent', enabled: false },
    { type: 'separator' },
    { label: 'Settings', click: openSettings },
    { label: 'Check Now', click: () => startPolling(store) },
    { type: 'separator' },
    { label: 'Quit', click: () => { stopPolling(); app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  setTrayRef(tray);
}

function createDefaultIcon(state) {
  const colors = { idle: '#6b7280', waiting: '#3b82f6', printing: '#10b981', error: '#ef4444' };
  const color = colors[state] || colors.idle;

  // Create a 16x16 colored circle using nativeImage
  const size = 16;
  const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="8" cy="8" r="7" fill="${color}"/></svg>`;
  return nativeImage.createFromBuffer(Buffer.from(canvas));
}

// ── Settings window ─────────────────────────────────────
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 450,
    height: 520,
    resizable: false,
    title: 'QR Print Agent — Settings',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  settingsWindow.loadFile('settings.html');
  settingsWindow.setMenuBarVisibility(false);

  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ── IPC: Settings save ──────────────────────────────────
ipcMain.handle('get-settings', () => store.store);

ipcMain.handle('save-settings', (_, settings) => {
  store.set('serverUrl', settings.serverUrl || '');
  store.set('shopToken', settings.shopToken || '');
  store.set('agentKey', settings.agentKey || '');
  store.set('printer', settings.printer || '');
  store.set('pollInterval', settings.pollInterval || 5000);

  // Restart polling with new settings
  stopPolling();
  if (settings.serverUrl && settings.agentKey) {
    startPolling(store);
  }

  return { ok: true };
});

ipcMain.handle('get-printers', async () => {
  const { getPrinters, getDefaultPrinter } = require('pdf-to-printer');
  try {
    const printers = await getPrinters();
    const def = await getDefaultPrinter().catch(() => null);
    return { printers, default: def ? def.name : null };
  } catch (err) {
    return { printers: [], default: null, error: err.message };
  }
});

// Expose store and tray for other modules
module.exports = { store, createDefaultIcon };
