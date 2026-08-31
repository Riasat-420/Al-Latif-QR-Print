/**
 * app.js — Main controller for the QR Print Studio step-flow.
 *
 * Manages: step navigation, shop validation, data flow between steps,
 * back button, progress bar, and global state.
 */

const App = (() => {
  // ── State ─────────────────────────────────────────────
  const state = {
    shopToken: null,
    shopName: null,
    currentStep: 1,
    totalSteps: 6,

    // Step 1 output
    scannedImage: null, // HTMLImageElement or Blob URL

    // Step 2 output
    widthMM: 0,
    heightMM: 0,
    sizeName: '',

    // Step 3 output
    frontCanvas: null, // Fabric.js canvas (front)
    backCanvas: null,  // Fabric.js canvas (back) — nullable

    // Step 4 output
    paperSize: 'A4',
    colorMode: 'color',
    orientation: 'portrait',
    copies: 1,

    // Step 5 → 6
    jobId: null,

    // API base URL (same origin)
    apiBase: '',
  };

  // ── DOM refs ──────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const steps = {};
  const stepLabels = {};

  // ── Init ──────────────────────────────────────────────
  function init() {
    // Cache step elements
    for (let i = 1; i <= state.totalSteps; i++) {
      steps[i] = $(`step${i}`);
    }

    // Cache step labels
    document.querySelectorAll('.step-label').forEach(el => {
      stepLabels[el.dataset.step] = el;
    });

    // Extract shop token from URL (?shop=xxxx or /s/xxxx)
    const params = new URLSearchParams(window.location.search);
    state.shopToken = params.get('shop') || extractTokenFromPath();

    if (state.shopToken) {
      validateShop(state.shopToken);
    }

    // Back button
    $('backBtn').addEventListener('click', goBack);

    // New job button (on status screen)
    $('newJobBtn').addEventListener('click', resetAll);

    console.log('[App] QR Print Studio initialized');
  }

  function extractTokenFromPath() {
    const match = window.location.pathname.match(/\/s\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  // ── Shop validation ───────────────────────────────────
  async function validateShop(token) {
    try {
      const res = await fetch(`${state.apiBase}/api/shop/${token}`);
      if (!res.ok) {
        showToast('Invalid QR code. Please scan a valid code.', 'error');
        return;
      }
      const data = await res.json();
      state.shopName = data.name;
      $('headerTitle').textContent = data.name || 'QR Print Studio';
    } catch (err) {
      console.warn('[App] Could not validate shop (offline mode?):', err.message);
    }
  }

  // ── Navigation ────────────────────────────────────────
  function goToStep(n) {
    if (n < 1 || n > state.totalSteps) return;

    // Hide current step
    steps[state.currentStep]?.classList.remove('active');

    // Show new step
    state.currentStep = n;
    steps[n]?.classList.add('active');

    // Update progress bar
    const pct = (n / state.totalSteps) * 100;
    $('progressFill').style.width = `${pct}%`;

    // Update step labels
    Object.entries(stepLabels).forEach(([step, el]) => {
      el.classList.remove('active', 'done');
      if (parseInt(step) < n) el.classList.add('done');
      if (parseInt(step) === n) el.classList.add('active');
    });

    // Show/hide back button
    $('backBtn').style.visibility = n > 1 && n < 6 ? 'visible' : 'hidden';

    // Hide progress bar on status screen
    $('progressBar').style.display = n === 6 ? 'none' : '';

    // Notify step modules
    window.dispatchEvent(new CustomEvent('stepChanged', { detail: { step: n } }));
  }

  function goNext() {
    goToStep(state.currentStep + 1);
  }

  function goBack() {
    if (state.currentStep > 1) {
      goToStep(state.currentStep - 1);
    }
  }

  function resetAll() {
    state.scannedImage = null;
    state.widthMM = 0;
    state.heightMM = 0;
    state.sizeName = '';
    state.paperSize = 'A4';
    state.colorMode = 'color';
    state.orientation = 'portrait';
    state.copies = 1;
    state.jobId = null;

    // Reset UI
    $('scanResult').style.display = 'none';
    $('uploadArea').style.display = '';
    $('cameraContainer').style.display = 'none';
    $('newJobBtn').style.display = 'none';

    // Reset size selection
    document.querySelectorAll('.size-card').forEach(c => c.classList.remove('selected'));
    $('customSizeInputs').style.display = 'none';

    goToStep(1);
  }

  // ── Toast notifications ───────────────────────────────
  function showToast(message, type = 'info') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  // ── Loading overlay ───────────────────────────────────
  function showLoading(text = 'Processing…') {
    $('loadingText').textContent = text;
    $('loadingOverlay').style.display = 'flex';
  }

  function hideLoading() {
    $('loadingOverlay').style.display = 'none';
  }

  // ── Init on DOM ready ─────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ────────────────────────────────────────
  return {
    state,
    goToStep,
    goNext,
    goBack,
    showToast,
    showLoading,
    hideLoading,
    $,
  };
})();
