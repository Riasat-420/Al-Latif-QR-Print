/**
 * editor.js — Step 2 (Size Selection) + Step 3 (High-Precision Sheet Canvas Editor).
 *
 * Features:
 * - Real paper workspace with top & left mm measurement rulers
 * - Live physical dimension readout overlay badge
 * - Image selection, free drag, corner scaling, rotate handles
 * - Duplicate / Clone object for multi-card placement (front & back on 1 page)
 * - Flip Horizontal & Flip Vertical
 * - Rotate 90°
 * - Add extra images (e.g. back side of CNIC / ID Card)
 * - Fit Width & Center tools
 * - Front & Back multi-page canvas tabs
 */

(() => {
  const { state } = App;

  let fabricCanvas = null;
  let frontData = null;  // Serialized front canvas state
  let backData = null;   // Serialized back canvas state
  let activeSide = 'front';

  // ═══════════════════════════════════════════════════════
  // STEP 2: SIZE SELECTION
  // ═══════════════════════════════════════════════════════

  const sizeCards = document.querySelectorAll('.size-card');
  const customInputs = App.$('customSizeInputs');

  sizeCards.forEach(card => {
    card.addEventListener('click', () => {
      sizeCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      const w = parseFloat(card.dataset.width);
      const h = parseFloat(card.dataset.height);

      if (w === 0 && h === 0) {
        customInputs.style.display = 'block';
        state.sizeName = 'Custom';
      } else {
        customInputs.style.display = 'none';
        state.widthMM = w;
        state.heightMM = h;
        state.sizeName = card.querySelector('.size-card-name').textContent;

        App.goNext(); // Triggers stepChanged for step 3
      }
    });
  });

  // Custom size apply
  App.$('applyCustomSize').addEventListener('click', () => {
    const w = parseFloat(App.$('customWidth').value);
    const h = parseFloat(App.$('customHeight').value);

    if (!w || !h || w < 10 || h < 10) {
      App.showToast('Please enter valid dimensions (minimum 10mm).', 'error');
      return;
    }

    state.widthMM = w;
    state.heightMM = h;
    state.sizeName = `Custom (${w} × ${h} mm)`;

    App.goNext();
  });

  // ═══════════════════════════════════════════════════════
  // STEP 3: HIGH-PRECISION FABRIC.JS EDITOR
  // ═══════════════════════════════════════════════════════

  function initOrResizeEditor() {
    const container = App.$('canvasContainer');
    const canvasEl = App.$('editorCanvas');

    // Default to A4 proportions if custom size not set yet
    const targetW = state.widthMM || 210;
    const targetH = state.heightMM || 297;

    // Available width on screen
    const availableW = Math.max(280, Math.min(container.clientWidth || (window.innerWidth - 64), 420));
    const ratio = targetH / targetW;

    let cWidth = availableW;
    let cHeight = Math.round(cWidth * ratio);

    // Constrain height to max 58vh
    const maxH = window.innerHeight * 0.52;
    if (cHeight > maxH) {
      cHeight = maxH;
      cWidth = Math.round(cHeight / ratio);
    }

    // Initialize or resize Fabric canvas
    if (!fabricCanvas) {
      canvasEl.width = cWidth;
      canvasEl.height = cHeight;

      fabricCanvas = new fabric.Canvas('editorCanvas', {
        width: cWidth,
        height: cHeight,
        backgroundColor: '#ffffff',
        selection: true,
        preserveObjectStacking: true,
      });

      // Selection style
      fabric.Object.prototype.set({
        transparentCorners: false,
        cornerColor: '#ff4d00',
        cornerStrokeColor: '#ffffff',
        borderColor: '#ff4d00',
        cornerSize: 12,
        cornerStyle: 'circle',
        padding: 4,
        borderDashArray: [4, 4],
      });

      // Listen to object selection/scaling to update dimension badge
      fabricCanvas.on('selection:created', updateDimBadge);
      fabricCanvas.on('selection:updated', updateDimBadge);
      fabricCanvas.on('selection:cleared', clearDimBadge);
      fabricCanvas.on('object:scaling', updateDimBadge);
      fabricCanvas.on('object:modified', updateDimBadge);

      // Load initial image
      if (state.scannedImage) {
        addImageToCanvas(state.scannedImage, true);
      }
    } else {
      fabricCanvas.setWidth(cWidth);
      fabricCanvas.setHeight(cHeight);
      fabricCanvas.renderAll();
    }

    updateRulers(targetW, targetH);
  }

  // ── Ruler Measurement Display ─────────────────────────
  function updateRulers(wMM, hMM) {
    const rulerTop = App.$('rulerTop');
    const rulerLeft = App.$('rulerLeft');

    if (rulerTop) {
      rulerTop.innerHTML = `
        <span class="ruler-marker" style="left: 0%">0mm</span>
        <span class="ruler-marker" style="left: 33%">${Math.round(wMM * 0.33)}mm</span>
        <span class="ruler-marker" style="left: 66%">${Math.round(wMM * 0.66)}mm</span>
        <span class="ruler-marker" style="left: 100%">${Math.round(wMM)}mm</span>
      `;
    }

    if (rulerLeft) {
      rulerLeft.innerHTML = `
        <span class="ruler-marker-v" style="top: 0%">0</span>
        <span class="ruler-marker-v" style="top: 50%">${Math.round(hMM * 0.5)}</span>
        <span class="ruler-marker-v" style="top: 100%">${Math.round(hMM)}</span>
      `;
    }
  }

  // ── Dimension Badge Readout ───────────────────────────
  function updateDimBadge() {
    const obj = fabricCanvas?.getActiveObject();
    const badge = App.$('dimBadge');
    if (!obj || !badge || !fabricCanvas) return;

    const paperW = state.widthMM || 210;
    const paperH = state.heightMM || 297;

    const objW = obj.getScaledWidth();
    const objH = obj.getScaledHeight();

    const realW_mm = ((objW / fabricCanvas.getWidth()) * paperW).toFixed(1);
    const realH_mm = ((objH / fabricCanvas.getHeight()) * paperH).toFixed(1);

    badge.textContent = `Selected: ${realW_mm} × ${realH_mm} mm`;
    badge.classList.add('active');
  }

  function clearDimBadge() {
    const badge = App.$('dimBadge');
    if (badge) {
      badge.textContent = `Sheet: ${state.widthMM || 210} × ${state.heightMM || 297} mm`;
      badge.classList.remove('active');
    }
  }

  // ── Add Image to Fabric Canvas ────────────────────────
  function addImageToCanvas(dataUrl, isInitial = false) {
    fabric.Image.fromURL(dataUrl, img => {
      if (!fabricCanvas) return;

      const cW = fabricCanvas.getWidth();
      const cH = fabricCanvas.getHeight();

      // Fit to 85% of canvas initially
      const scaleX = (cW * 0.88) / img.width;
      const scaleY = (cH * 0.88) / img.height;
      const scale = Math.min(scaleX, scaleY, 1.0);

      img.set({
        scaleX: scale,
        scaleY: scale,
        left: (cW - img.width * scale) / 2,
        top: (cH - img.height * scale) / 2,
      });

      fabricCanvas.add(img);
      fabricCanvas.setActiveObject(img);
      fabricCanvas.renderAll();
      updateDimBadge();
    });
  }

  // ── Duplicate / Clone Selected Object ─────────────────
  App.$('duplicateBtn').addEventListener('click', () => {
    const activeObj = fabricCanvas?.getActiveObject();
    if (!activeObj) {
      App.showToast('Please tap on an image to select it first.', 'info');
      return;
    }

    activeObj.clone(cloned => {
      fabricCanvas.discardActiveObject();
      cloned.set({
        left: Math.min(fabricCanvas.getWidth() - 40, activeObj.left + 24),
        top: Math.min(fabricCanvas.getHeight() - 40, activeObj.top + 24),
        evented: true,
      });
      fabricCanvas.add(cloned);
      fabricCanvas.setActiveObject(cloned);
      fabricCanvas.renderAll();
      App.showToast('Image duplicated!', 'success');
      updateDimBadge();
    });
  });

  // ── Rotate 90° Clockwise ──────────────────────────────
  App.$('rotateRightBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj) {
      obj.rotate((obj.angle || 0) + 90);
      fabricCanvas.renderAll();
      updateDimBadge();
    }
  });

  // ── Flip Horizontal ───────────────────────────────────
  App.$('flipHBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj) {
      obj.set('flipX', !obj.flipX);
      fabricCanvas.renderAll();
    }
  });

  // ── Flip Vertical ─────────────────────────────────────
  App.$('flipVBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj) {
      obj.set('flipY', !obj.flipY);
      fabricCanvas.renderAll();
    }
  });

  // ── Center on Page ────────────────────────────────────
  App.$('centerBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj && fabricCanvas) {
      obj.center();
      obj.setCoords();
      fabricCanvas.renderAll();
      updateDimBadge();
    }
  });

  // ── Fit to Width ──────────────────────────────────────
  App.$('fitBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj && fabricCanvas) {
      const cW = fabricCanvas.getWidth();
      const cH = fabricCanvas.getHeight();
      const scale = Math.min((cW * 0.94) / obj.width, (cH * 0.94) / obj.height);

      obj.set({
        scaleX: scale,
        scaleY: scale,
        left: (cW - obj.width * scale) / 2,
        top: (cH - obj.height * scale) / 2,
        angle: 0,
      });
      obj.setCoords();
      fabricCanvas.renderAll();
      updateDimBadge();
    }
  });

  // ── Delete Selected ───────────────────────────────────
  App.$('deleteObjBtn').addEventListener('click', () => {
    const obj = fabricCanvas?.getActiveObject();
    if (obj) {
      fabricCanvas.remove(obj);
      fabricCanvas.discardActiveObject();
      fabricCanvas.renderAll();
      clearDimBadge();
    } else {
      App.showToast('Please select an image to delete.', 'info');
    }
  });

  // ── Add Extra Image (e.g. Back of ID card) ───────────
  App.$('addImageBtn').addEventListener('click', () => App.$('addImageInput').click());
  App.$('addImageInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      addImageToCanvas(ev.target.result);
      App.showToast('Additional image added!', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // ── Front / Back Multi-page Tabs ──────────────────────
  App.$('frontTab').addEventListener('click', () => switchSide('front'));
  App.$('backTab').addEventListener('click', () => switchSide('back'));

  function switchSide(side) {
    if (!fabricCanvas || side === activeSide) return;

    if (activeSide === 'front') {
      frontData = fabricCanvas.toJSON();
    } else {
      backData = fabricCanvas.toJSON();
    }

    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#ffffff';

    activeSide = side;
    const data = side === 'front' ? frontData : backData;

    if (data) {
      fabricCanvas.loadFromJSON(data, () => fabricCanvas.renderAll());
    }

    App.$('frontTab').classList.toggle('active', side === 'front');
    App.$('backTab').classList.toggle('active', side === 'back');
  }

  // Helper: Get active object, or fallback to first object on canvas
  function getTargetObject() {
    if (!fabricCanvas) return null;
    let obj = fabricCanvas.getActiveObject();
    if (!obj) {
      const objects = fabricCanvas.getObjects();
      if (objects.length > 0) {
        obj = objects[objects.length - 1];
        fabricCanvas.setActiveObject(obj);
      }
    }
    return obj;
  }

  // ── Canvas Export for High-Res Print ──────────────────
  function exportCanvas() {
    if (!fabricCanvas) return null;

    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();

    return fabricCanvas.toDataURL({
      format: 'png',
      quality: 1.0,
      multiplier: 2.5, // Crisp high-res render for printer
    });
  }

  // ── When entering Step 3, initialize reliably ─────────
  window.addEventListener('stepChanged', e => {
    if (e.detail.step === 3) {
      // Use requestAnimationFrame so DOM transition completes
      requestAnimationFrame(() => {
        initOrResizeEditor();
      });
    }
  });

  // Expose
  window.EditorModule = {
    exportCanvas,
    getCanvas: () => fabricCanvas,
    initOrResizeEditor,
  };
})();
