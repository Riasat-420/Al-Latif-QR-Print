/**
 * scanner.js — Step 1: Document Scanning, File Upload & CamScanner-style Corner Cropping.
 *
 * Features:
 * - Live camera stream with high-res capture
 * - Image & PDF upload via PDF.js
 * - Interactive 4-corner perspective crop box on canvas with touch/mouse drag
 * - Rotate 90°, ID Card 86:54 preset, and full image reset
 * - High-precision canvas extraction of the cropped document area
 */

(() => {
  const { state } = App;

  // DOM Elements
  const uploadArea     = App.$('uploadArea');
  const cropScreen     = App.$('cropScreen');
  const cameraContainer= App.$('cameraContainer');
  const cameraVideo    = App.$('cameraVideo');
  const fileInput      = App.$('fileInput');
  const cropCanvas     = App.$('cropCanvas');

  let stream = null;
  let rawImageObj = null; // Image object loaded for cropping
  let imageRotation = 0;  // 0, 90, 180, 270

  // 4 Corner points normalized (0 to 1 relative to displayed image)
  let corners = [
    { x: 0.05, y: 0.05 }, // Top-Left
    { x: 0.95, y: 0.05 }, // Top-Right
    { x: 0.95, y: 0.95 }, // Bottom-Right
    { x: 0.05, y: 0.95 }, // Bottom-Left
  ];

  let draggingPointIndex = -1;
  let activeTouchId = null;

  // ── Upload Button ────────────────────────────────────
  App.$('uploadBtn').addEventListener('click', () => fileInput.click());

  // ── Camera Start ─────────────────────────────────────
  App.$('cameraStartBtn').addEventListener('click', startCamera);

  // ── File Input Change ────────────────────────────────
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // ── Drag and Drop ────────────────────────────────────
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

  // ── Camera Management ────────────────────────────────
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      cameraVideo.srcObject = stream;
      uploadArea.style.display = 'none';
      cropScreen.style.display = 'none';
      cameraContainer.style.display = 'block';
    } catch (err) {
      console.error('Camera access denied:', err);
      App.showToast('Could not access camera. Please choose an image file instead.', 'error');
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    cameraVideo.srcObject = null;
  }

  // ── Capture from Camera ──────────────────────────────
  App.$('captureBtn').addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = cameraVideo.videoWidth || 1280;
    canvas.height = cameraVideo.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0);

    stopCamera();
    cameraContainer.style.display = 'none';

    openCropper(canvas.toDataURL('image/jpeg', 0.95));
  });

  // ── Handle Uploaded Files ────────────────────────────
  async function handleFile(file) {
    if (file.type === 'application/pdf') {
      await handlePDF(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => openCropper(e.target.result);
      reader.readAsDataURL(file);
    } else {
      App.showToast('Unsupported file type. Please upload a PNG, JPG, or PDF.', 'error');
    }
  }

  // ── PDF Handling via PDF.js ──────────────────────────
  async function handlePDF(file) {
    try {
      App.showLoading('Rendering PDF page…');
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;
      App.hideLoading();

      openCropper(canvas.toDataURL('image/png'));

      if (pdf.numPages > 1) {
        App.showToast(`PDF has ${pdf.numPages} pages. Page 1 loaded for printing.`, 'info');
      }
    } catch (err) {
      App.hideLoading();
      console.error('PDF error:', err);
      App.showToast('Failed to process PDF file.', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════
  // CAM-SCANNER CORNER CROPPER
  // ═══════════════════════════════════════════════════════

  function openCropper(dataUrl) {
    imageRotation = 0;
    rawImageObj = new Image();
    rawImageObj.onload = () => {
      uploadArea.style.display = 'none';
      cameraContainer.style.display = 'none';
      cropScreen.style.display = 'block';

      // Default corners to 90% inner rectangle
      resetCorners(0.04);
      renderCropCanvas();
    };
    rawImageObj.src = dataUrl;
  }

  function resetCorners(inset = 0.04) {
    corners = [
      { x: inset, y: inset },               // Top-Left
      { x: 1 - inset, y: inset },           // Top-Right
      { x: 1 - inset, y: 1 - inset },       // Bottom-Right
      { x: inset, y: 1 - inset },           // Bottom-Left
    ];
  }

  function renderCropCanvas() {
    if (!rawImageObj || !cropCanvas) return;

    const ctx = cropCanvas.getContext('2d');
    const container = cropCanvas.parentElement;
    const maxW = container.clientWidth || 360;
    const maxH = Math.min(window.innerHeight * 0.52, 420);

    const isRotated = imageRotation === 90 || imageRotation === 270;
    const imgW = isRotated ? rawImageObj.height : rawImageObj.width;
    const imgH = isRotated ? rawImageObj.width : rawImageObj.height;

    const scale = Math.min(maxW / imgW, maxH / imgH);
    const canvasW = Math.round(imgW * scale);
    const canvasH = Math.round(imgH * scale);

    cropCanvas.width = canvasW;
    cropCanvas.height = canvasH;

    // Draw background rotated image
    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.rotate((imageRotation * Math.PI) / 180);

    const drawW = isRotated ? canvasH : canvasW;
    const drawH = isRotated ? canvasW : canvasH;
    ctx.drawImage(rawImageObj, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Dark semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Calculate pixel coordinates for the 4 corners
    const pts = corners.map(c => ({
      x: c.x * canvasW,
      y: c.y * canvasH,
    }));

    // Clear the active cropped polygon (reveal clear document underneath)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.clip();

    // Redraw unmasked image inside polygon
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.rotate((imageRotation * Math.PI) / 180);
    ctx.drawImage(rawImageObj, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Draw bounding polygon outline (Orange glow)
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ff4d00';
    ctx.shadowColor = '#ff4d00';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw 3x3 grid lines inside
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 204, 0, 0.4)';
    for (let i = 1; i <= 2; i++) {
      const t = i / 3;
      // Horizontal grid
      const leftX = pts[0].x + (pts[3].x - pts[0].x) * t;
      const leftY = pts[0].y + (pts[3].y - pts[0].y) * t;
      const rightX = pts[1].x + (pts[2].x - pts[1].x) * t;
      const rightY = pts[1].y + (pts[2].y - pts[1].y) * t;
      ctx.beginPath();
      ctx.moveTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.stroke();

      // Vertical grid
      const topX = pts[0].x + (pts[1].x - pts[0].x) * t;
      const topY = pts[0].y + (pts[1].y - pts[0].y) * t;
      const botX = pts[3].x + (pts[2].x - pts[3].x) * t;
      const botY = pts[3].y + (pts[2].y - pts[3].y) * t;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(botX, botY);
      ctx.stroke();
    }

    // Draw Corner Handles
    pts.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4d00';
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  // ── Handle Dragging Events (Touch & Mouse) ────────────
  function getEventPos(e) {
    const rect = cropCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(e) {
    const pos = getEventPos(e);
    const radiusThreshold = 0.12; // Catch radius

    let closestIdx = -1;
    let minDistance = Infinity;

    corners.forEach((c, idx) => {
      const dist = Math.hypot(c.x - pos.x, c.y - pos.y);
      if (dist < radiusThreshold && dist < minDistance) {
        minDistance = dist;
        closestIdx = idx;
      }
    });

    if (closestIdx !== -1) {
      draggingPointIndex = closestIdx;
      e.preventDefault();
    }
  }

  function onPointerMove(e) {
    if (draggingPointIndex === -1) return;
    e.preventDefault();

    const pos = getEventPos(e);
    const clampedX = Math.max(0, Math.min(1, pos.x));
    const clampedY = Math.max(0, Math.min(1, pos.y));

    corners[draggingPointIndex].x = clampedX;
    corners[draggingPointIndex].y = clampedY;

    renderCropCanvas();
  }

  function onPointerUp() {
    draggingPointIndex = -1;
  }

  cropCanvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  cropCanvas.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  // ── Crop Toolbar Actions ─────────────────────────────
  App.$('cropRotateBtn').addEventListener('click', () => {
    imageRotation = (imageRotation + 90) % 360;
    renderCropCanvas();
  });

  App.$('cropResetBtn').addEventListener('click', () => {
    resetCorners(0.01);
    renderCropCanvas();
  });

  App.$('cropIdCardBtn').addEventListener('click', () => {
    // 86x54 aspect ratio (1.592)
    const ratio = 86 / 54;
    let w = 0.9;
    let h = w / ratio;
    if (h > 0.9) { h = 0.9; w = h * ratio; }

    const left = (1 - w) / 2;
    const top = (1 - h) / 2;

    corners = [
      { x: left, y: top },
      { x: left + w, y: top },
      { x: left + w, y: top + h },
      { x: left, y: top + h },
    ];
    renderCropCanvas();
  });

  App.$('cropRetakeBtn').addEventListener('click', () => {
    cropScreen.style.display = 'none';
    uploadArea.style.display = '';
    fileInput.value = '';
    rawImageObj = null;
  });

  // ── Apply Crop & Extract High-Res Result ─────────────
  App.$('cropApplyBtn').addEventListener('click', () => {
    if (!rawImageObj) return;

    App.showLoading('Extracting document…');

    // Create high-res offscreen canvas for rotation
    const isRotated = imageRotation === 90 || imageRotation === 270;
    const srcW = isRotated ? rawImageObj.height : rawImageObj.width;
    const srcH = isRotated ? rawImageObj.width : rawImageObj.height;

    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = srcW;
    rotCanvas.height = srcH;
    const rotCtx = rotCanvas.getContext('2d');

    rotCtx.translate(srcW / 2, srcH / 2);
    rotCtx.rotate((imageRotation * Math.PI) / 180);
    const drawW = isRotated ? srcH : srcW;
    const drawH = isRotated ? srcW : srcH;
    rotCtx.drawImage(rawImageObj, -drawW / 2, -drawH / 2, drawW, drawH);

    // Compute bounding box in pixel coordinates
    const minX = Math.min(...corners.map(c => c.x)) * srcW;
    const maxX = Math.max(...corners.map(c => c.x)) * srcW;
    const minY = Math.min(...corners.map(c => c.y)) * srcH;
    const maxY = Math.max(...corners.map(c => c.y)) * srcH;

    const cropW = Math.max(50, maxX - minX);
    const cropH = Math.max(50, maxY - minY);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = cropW;
    outCanvas.height = cropH;
    const outCtx = outCanvas.getContext('2d');

    outCtx.drawImage(rotCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    const finalDataUrl = outCanvas.toDataURL('image/png', 0.98);
    state.scannedImage = finalDataUrl;

    App.hideLoading();
    App.showToast('Document cropped successfully!', 'success');

    // Move to Size Selection (Step 2)
    App.goNext();
  });

  // Cleanup on leave
  window.addEventListener('stepChanged', e => {
    if (e.detail.step !== 1) stopCamera();
  });
})();
