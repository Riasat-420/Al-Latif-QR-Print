/**
 * scanner.js — Step 1: Document scanning and file upload.
 *
 * Handles:
 * - Camera access and live preview
 * - Photo capture
 * - File upload (images + PDFs via PDF.js)
 * - Drag-and-drop
 * - Scan result preview with retake/use actions
 */

(() => {
  const { state } = App;

  const uploadArea   = App.$('uploadArea');
  const scanResult   = App.$('scanResult');
  const scanPreview  = App.$('scanPreview');
  const cameraContainer = App.$('cameraContainer');
  const cameraVideo  = App.$('cameraVideo');
  const fileInput    = App.$('fileInput');

  let stream = null;

  // ── Upload button ────────────────────────────────────
  App.$('uploadBtn').addEventListener('click', () => fileInput.click());

  // ── Camera start ─────────────────────────────────────
  App.$('cameraStartBtn').addEventListener('click', startCamera);

  // ── File input change ────────────────────────────────
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // ── Drag and drop ────────────────────────────────────
  uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // ── Camera ───────────────────────────────────────────
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      cameraVideo.srcObject = stream;
      uploadArea.style.display = 'none';
      cameraContainer.style.display = 'block';
    } catch (err) {
      console.error('Camera access denied:', err);
      App.showToast('Could not access camera. Please upload a file instead.', 'error');
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    cameraVideo.srcObject = null;
  }

  // ── Capture from camera ──────────────────────────────
  App.$('captureBtn').addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0);

    stopCamera();
    cameraContainer.style.display = 'none';

    showScanResult(canvas.toDataURL('image/jpeg', 0.92));
  });

  // ── Handle uploaded file ─────────────────────────────
  async function handleFile(file) {
    if (file.type === 'application/pdf') {
      await handlePDF(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => showScanResult(e.target.result);
      reader.readAsDataURL(file);
    } else {
      App.showToast('Unsupported file type. Please upload an image or PDF.', 'error');
    }
  }

  // ── PDF handling (render first page as image) ────────
  async function handlePDF(file) {
    try {
      App.showLoading('Processing PDF…');
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2 }); // 2x for quality

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;
      App.hideLoading();

      showScanResult(canvas.toDataURL('image/png'));

      if (pdf.numPages > 1) {
        App.showToast(`PDF has ${pdf.numPages} pages. Only the first page will be printed.`, 'info');
      }
    } catch (err) {
      App.hideLoading();
      console.error('PDF processing failed:', err);
      App.showToast('Failed to process PDF. Please try a different file.', 'error');
    }
  }

  // ── Show scan result ─────────────────────────────────
  function showScanResult(dataUrl) {
    scanPreview.src = dataUrl;
    state.scannedImage = dataUrl;

    uploadArea.style.display = 'none';
    cameraContainer.style.display = 'none';
    scanResult.style.display = 'block';
  }

  // ── Retake ───────────────────────────────────────────
  App.$('retakeBtn').addEventListener('click', () => {
    state.scannedImage = null;
    scanResult.style.display = 'none';
    uploadArea.style.display = '';
    fileInput.value = '';
  });

  // ── Use this scan → go to step 2 ────────────────────
  App.$('useScanBtn').addEventListener('click', () => {
    if (!state.scannedImage) {
      App.showToast('No image captured. Please scan or upload first.', 'error');
      return;
    }
    App.goNext();
  });

  // Cleanup camera when leaving step 1
  window.addEventListener('stepChanged', e => {
    if (e.detail.step !== 1) stopCamera();
  });
})();
