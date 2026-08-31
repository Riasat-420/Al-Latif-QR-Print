/**
 * editor.js — Step 2 (Size Selection) + Step 3 (Fabric.js Canvas Editor).
 *
 * Step 2: Size preset grid + custom dimensions input.
 * Step 3: Fabric.js canvas for drag/resize/rotate/flip, front+back support.
 */

(() => {
  const { state } = App;

  // ── Fabric.js canvas instances ────────────────────────
  let fabricCanvas = null;
  let frontData = null;  // Serialized front canvas state
  let backData = null;   // Serialized back canvas state
  let activeSide = 'front';

  // Conversion: mm to canvas pixels (for on-screen editing)
  const CANVAS_SCALE = 3; // 3px per mm → sharp enough on mobile

  // ═══════════════════════════════════════════════════════
  // STEP 2: SIZE SELECTION
  // ═══════════════════════════════════════════════════════

  const sizeCards = document.querySelectorAll('.size-card');
  const customInputs = App.$('customSizeInputs');

  sizeCards.forEach(card => {
    card.addEventListener('click', () => {
      // Deselect all
      sizeCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      const w = parseFloat(card.dataset.width);
      const h = parseFloat(card.dataset.height);

      if (w === 0 && h === 0) {
        // Custom size
        customInputs.style.display = 'block';
        state.sizeName = 'Custom';
      } else {
        customInputs.style.display = 'none';
        state.widthMM = w;
        state.heightMM = h;
        state.sizeName = card.querySelector('.size-card-name').textContent;

        // Go to editor immediately for presets
        initEditor();
        App.goNext();
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

    initEditor();
    App.goNext();
  });

  // ═══════════════════════════════════════════════════════
  // STEP 3: FABRIC.JS EDITOR
  // ═══════════════════════════════════════════════════════

  function initEditor() {
    const container = App.$('canvasContainer');
    const canvasEl = App.$('editorCanvas');

    // Calculate canvas size based on selected mm and container width
    const containerWidth = container.clientWidth - 2; // minus border
    const ratio = state.heightMM / state.widthMM;

    let cWidth = Math.min(containerWidth, state.widthMM * CANVAS_SCALE);
    let cHeight = cWidth * ratio;

    // If height exceeds container, scale down
    const maxHeight = window.innerHeight * 0.55;
    if (cHeight > maxHeight) {
      cHeight = maxHeight;
      cWidth = cHeight / ratio;
    }

    canvasEl.width = cWidth;
    canvasEl.height = cHeight;

    // Dispose old canvas if exists
    if (fabricCanvas) {
      fabricCanvas.dispose();
    }

    fabricCanvas = new fabric.Canvas('editorCanvas', {
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
    });

    fabricCanvas.setWidth(cWidth);
    fabricCanvas.setHeight(cHeight);

    // Load the scanned image
    if (state.scannedImage) {
      loadImageOntoCanvas(state.scannedImage);
    }

    // Reset front/back
    frontData = null;
    backData = null;
    activeSide = 'front';
    App.$('frontTab').classList.add('active');
    App.$('backTab').classList.remove('active');
  }

  function loadImageOntoCanvas(dataUrl) {
    fabric.Image.fromURL(dataUrl, img => {
      if (!fabricCanvas) return;

      // Scale to fit the canvas while maintaining aspect ratio
      const scaleX = fabricCanvas.getWidth() / img.width;
      const scaleY = fabricCanvas.getHeight() / img.height;
      const scale = Math.min(scaleX, scaleY) * 0.9; // 90% of available space

      img.set({
        scaleX: scale,
        scaleY: scale,
        left: (fabricCanvas.getWidth() - img.width * scale) / 2,
        top: (fabricCanvas.getHeight() - img.height * scale) / 2,
        cornerColor: '#6366f1',
        cornerStrokeColor: '#6366f1',
        borderColor: '#6366f1',
        transparentCorners: false,
        cornerSize: 14,
        padding: 4,
      });

      fabricCanvas.add(img);
      fabricCanvas.setActiveObject(img);
      fabricCanvas.renderAll();
    });
  }

  // ── Front / Back tabs ─────────────────────────────────
  App.$('frontTab').addEventListener('click', () => switchSide('front'));
  App.$('backTab').addEventListener('click', () => switchSide('back'));

  function switchSide(side) {
    if (!fabricCanvas || side === activeSide) return;

    // Save current side
    if (activeSide === 'front') {
      frontData = fabricCanvas.toJSON();
    } else {
      backData = fabricCanvas.toJSON();
    }

    // Clear canvas
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#ffffff';

    // Load target side
    activeSide = side;
    const data = side === 'front' ? frontData : backData;

    if (data) {
      fabricCanvas.loadFromJSON(data, () => fabricCanvas.renderAll());
    }

    // Update tab UI
    App.$('frontTab').classList.toggle('active', side === 'front');
    App.$('backTab').classList.toggle('active', side === 'back');
  }

  // ── Toolbar actions ───────────────────────────────────
  App.$('rotateLeftBtn').addEventListener('click', () => {
    const obj = fabricCanvas?.getActiveObject();
    if (obj) { obj.rotate((obj.angle || 0) - 90); fabricCanvas.renderAll(); }
  });

  App.$('rotateRightBtn').addEventListener('click', () => {
    const obj = fabricCanvas?.getActiveObject();
    if (obj) { obj.rotate((obj.angle || 0) + 90); fabricCanvas.renderAll(); }
  });

  App.$('flipHBtn').addEventListener('click', () => {
    const obj = fabricCanvas?.getActiveObject();
    if (obj) { obj.set('flipX', !obj.flipX); fabricCanvas.renderAll(); }
  });

  App.$('flipVBtn').addEventListener('click', () => {
    const obj = fabricCanvas?.getActiveObject();
    if (obj) { obj.set('flipY', !obj.flipY); fabricCanvas.renderAll(); }
  });

  App.$('fitBtn').addEventListener('click', () => {
    const obj = fabricCanvas?.getActiveObject();
    if (obj && fabricCanvas) {
      const scaleX = fabricCanvas.getWidth() / obj.width;
      const scaleY = fabricCanvas.getHeight() / obj.height;
      const scale = Math.min(scaleX, scaleY);
      obj.set({
        scaleX: scale,
        scaleY: scale,
        left: (fabricCanvas.getWidth() - obj.width * scale) / 2,
        top: (fabricCanvas.getHeight() - obj.height * scale) / 2,
        angle: 0,
      });
      fabricCanvas.renderAll();
    }
  });

  App.$('deleteObjBtn').addEventListener('click', () => {
    const obj = fabricCanvas?.getActiveObject();
    if (obj) { fabricCanvas.remove(obj); fabricCanvas.renderAll(); }
  });

  // Add image
  App.$('addImageBtn').addEventListener('click', () => App.$('addImageInput').click());
  App.$('addImageInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (fabricCanvas) loadImageOntoCanvas(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // ── Export canvas as image (for submission) ───────────
  function exportCanvas() {
    if (!fabricCanvas) return null;

    // Deselect before export so selection handles don't appear
    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();

    return fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 2, // 2x for print quality
    });
  }

  // ── When entering step 3, re-init if needed ───────────
  window.addEventListener('stepChanged', e => {
    if (e.detail.step === 3 && !fabricCanvas) {
      initEditor();
    }
  });

  // Expose for other modules
  window.EditorModule = {
    exportCanvas,
    getCanvas: () => fabricCanvas,
  };
})();
