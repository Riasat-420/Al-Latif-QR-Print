/**
 * editor.js — Step 2 (Batch ID Cards Manager) + Step 3 (A4 Physical Sheet Canvas Editor).
 *
 * Implements the batch multi-card placement workflow inspired by id-card-printer-batch:
 * - Multi-card list (Card 1, Card 2, Card 3...) with separate Front & Back uploads and copy counts
 * - A4 default physical sheet (210×297mm) with physical mm scale & rulers
 * - 3 Layout modes:
 *     1. cnic_same_page: Front & Back together on same A4 sheet (standard CNIC copy)
 *     2. grid_batch: 2×4 auto-flowing A4 grid (Page 1 Fronts, Page 2 Backs)
 *     3. free_canvas: Free dragging, scaling, rotating, and duplicating
 * - Multi-page export (Front & Back payloads) for duplex / manual flip printing
 */

(() => {
  const { state } = App;

  // Standard Dimensions (in mm)
  const A4_W = 210, A4_H = 297;
  const ID_W = 85.6, ID_H = 54.0;
  const COLS = 2, ROWS = 4;

  let fabricCanvas = null;
  let activePage = 'front'; // 'front' or 'back'
  let frontPageDataUrl = null;
  let backPageDataUrl = null;

  // Batch Cards State
  let cards = [];
  let nextCardId = 1;
  let layoutMode = 'cnic_same_page'; // 'cnic_same_page', 'grid_batch', 'free_canvas'
  let cardGapMM = 8;

  function newCard(initialFront = null) {
    return {
      id: nextCardId++,
      name: `Card ${nextCardId - 1}`,
      frontData: initialFront || null,
      backData: null,
      copies: 1,
    };
  }

  // ═══════════════════════════════════════════════════════
  // STEP 2: BATCH ID CARDS LIST & CONTROLLER
  // ═══════════════════════════════════════════════════════

  function initBatchCards() {
    if (cards.length === 0) {
      cards.push(newCard(state.scannedImage));
    } else if (state.scannedImage && !cards[0].frontData) {
      cards[0].frontData = state.scannedImage;
    }
    renderCardsList();
  }

  function renderCardsList() {
    const list = App.$('batchCardsList');
    if (!list) return;
    list.innerHTML = '';

    cards.forEach((c, idx) => {
      const cardBox = document.createElement('div');
      cardBox.className = 'batch-card-box';

      cardBox.innerHTML = `
        <div class="batch-card-header">
          <div class="batch-card-title">
            <span class="status-indicator ${c.frontData ? 'ok' : 'empty'}"></span>
            <b>Document / ID Card #${idx + 1}</b>
          </div>
          ${cards.length > 1 ? `<button class="btn-remove-card" data-id="${c.id}">✕ Remove</button>` : ''}
        </div>

        <div class="batch-card-uploads">
          <!-- Front Side -->
          <div class="upload-slot ${c.frontData ? 'has-image' : ''}" data-side="front" data-id="${c.id}">
            <div class="slot-label">Front Side *</div>
            <div class="slot-preview">
              ${c.frontData ? `<img src="${c.frontData}" alt="Front">` : `<div class="slot-placeholder">📷 Tap to upload Front</div>`}
            </div>
            <input type="file" accept="image/*" class="slot-file-input" style="display:none">
          </div>

          <!-- Back Side -->
          <div class="upload-slot ${c.backData ? 'has-image' : ''}" data-side="back" data-id="${c.id}">
            <div class="slot-label">Back Side (Optional)</div>
            <div class="slot-preview">
              ${c.backData ? `<img src="${c.backData}" alt="Back">` : `<div class="slot-placeholder">📷 Tap to upload Back</div>`}
            </div>
            <input type="file" accept="image/*" class="slot-file-input" style="display:none">
          </div>
        </div>

        <div class="batch-card-footer">
          <label>Copies of this card on sheet:</label>
          <div class="mini-stepper">
            <button class="mini-step-btn minus" data-id="${c.id}">−</button>
            <span class="mini-step-val">${c.copies}</span>
            <button class="mini-step-btn plus" data-id="${c.id}">+</button>
          </div>
        </div>
      `;

      list.appendChild(cardBox);
    });

    // Bind event listeners
    bindCardListEvents();
  }

  function bindCardListEvents() {
    // Slot click to upload
    document.querySelectorAll('.upload-slot').forEach(slot => {
      const input = slot.querySelector('.slot-file-input');
      const cardId = parseInt(slot.dataset.id);
      const side = slot.dataset.side;

      slot.addEventListener('click', e => {
        if (e.target !== input) input.click();
      });

      input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          const targetCard = cards.find(x => x.id === cardId);
          if (targetCard) {
            if (side === 'front') targetCard.frontData = ev.target.result;
            else targetCard.backData = ev.target.result;
            renderCardsList();
          }
        };
        reader.readAsDataURL(file);
      });
    });

    // Remove Card
    document.querySelectorAll('.btn-remove-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        cards = cards.filter(x => x.id !== id);
        renderCardsList();
      });
    });

    // Copies plus/minus
    document.querySelectorAll('.mini-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const card = cards.find(x => x.id === id);
        if (!card) return;
        if (btn.classList.contains('plus')) card.copies = Math.min(16, card.copies + 1);
        else card.copies = Math.max(1, card.copies - 1);
        renderCardsList();
      });
    });
  }

  // Add Card button
  App.$('addNewCardBtn').addEventListener('click', () => {
    cards.push(newCard());
    renderCardsList();
  });

  // Direct shortcut from Step 1
  const batchDirect = App.$('batchDirectBtn');
  if (batchDirect) {
    batchDirect.addEventListener('click', () => {
      initBatchCards();
      App.goToStep(2);
    });
  }

  // Layout mode buttons
  const modeOptions = App.$('layoutModeOptions');
  if (modeOptions) {
    modeOptions.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modeOptions.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        layoutMode = btn.dataset.value;
      });
    });
  }

  // Gap slider
  const gapRange = App.$('gapRange');
  const gapValue = App.$('gapValue');
  if (gapRange && gapValue) {
    gapRange.addEventListener('input', () => {
      cardGapMM = parseInt(gapRange.value, 10);
      gapValue.textContent = `${cardGapMM} mm`;
    });
  }

  // Go to Layout
  App.$('goToLayoutBtn').addEventListener('click', () => {
    state.widthMM = A4_W;
    state.heightMM = A4_H;
    state.paperSize = 'A4';
    App.goNext();
  });

  // ═══════════════════════════════════════════════════════
  // STEP 3: PHYSICAL A4 PAPER WORKSPACE & FABRIC.JS CANVAS
  // ═══════════════════════════════════════════════════════

  function initOrBuildSheet() {
    const container = App.$('canvasContainer');
    const canvasEl = App.$('editorCanvas');

    // Default sheet is A4 (210 × 297mm)
    const sheetW = state.widthMM || A4_W;
    const sheetH = state.heightMM || A4_H;
    const ratio = sheetH / sheetW;

    const availableW = Math.max(280, Math.min(container.clientWidth || (window.innerWidth - 64), 380));
    const cWidth = availableW;
    const cHeight = Math.round(cWidth * ratio);

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

      fabric.Object.prototype.set({
        transparentCorners: false,
        cornerColor: '#ff4d00',
        cornerStrokeColor: '#ffffff',
        borderColor: '#ff4d00',
        cornerSize: 12,
        cornerStyle: 'circle',
        padding: 4,
      });

      fabricCanvas.on('selection:created', updateDimBadge);
      fabricCanvas.on('selection:updated', updateDimBadge);
      fabricCanvas.on('selection:cleared', clearDimBadge);
      fabricCanvas.on('object:scaling', updateDimBadge);
      fabricCanvas.on('object:modified', updateDimBadge);
    } else {
      fabricCanvas.setWidth(cWidth);
      fabricCanvas.setHeight(cHeight);
    }

    updateRulers(sheetW, sheetH);

    // Build the page layout onto Fabric Canvas based on cards & layoutMode
    buildPageLayout(activePage);
  }

  function updateRulers(wMM, hMM) {
    const rulerTop = App.$('rulerTop');
    const rulerLeft = App.$('rulerLeft');
    if (rulerTop) {
      rulerTop.innerHTML = `
        <span class="ruler-marker" style="left: 0%">0mm</span>
        <span class="ruler-marker" style="left: 25%">${Math.round(wMM * 0.25)}mm</span>
        <span class="ruler-marker" style="left: 50%">${Math.round(wMM * 0.5)}mm</span>
        <span class="ruler-marker" style="left: 75%">${Math.round(wMM * 0.75)}mm</span>
        <span class="ruler-marker" style="left: 100%">${Math.round(wMM)}mm</span>
      `;
    }
    if (rulerLeft) {
      rulerLeft.innerHTML = `
        <span class="ruler-marker-v" style="top: 0%">0</span>
        <span class="ruler-marker-v" style="top: 33%">${Math.round(hMM * 0.33)}</span>
        <span class="ruler-marker-v" style="top: 66%">${Math.round(hMM * 0.66)}</span>
        <span class="ruler-marker-v" style="top: 100%">${Math.round(hMM)}</span>
      `;
    }
  }

  function updateDimBadge() {
    const obj = fabricCanvas?.getActiveObject();
    const badge = App.$('dimBadge');
    if (!obj || !badge || !fabricCanvas) return;

    const paperW = state.widthMM || A4_W;
    const paperH = state.heightMM || A4_H;

    const realW_mm = ((obj.getScaledWidth() / fabricCanvas.getWidth()) * paperW).toFixed(1);
    const realH_mm = ((obj.getScaledHeight() / fabricCanvas.getHeight()) * paperH).toFixed(1);

    badge.textContent = `Card: ${realW_mm} × ${realH_mm} mm`;
    badge.classList.add('active');
  }

  function clearDimBadge() {
    const badge = App.$('dimBadge');
    if (badge) {
      badge.textContent = `A4 Sheet: 210 × 297 mm`;
      badge.classList.remove('active');
    }
  }

  // ── Auto-Layout Generator for A4 Sheet ────────────────
  async function buildPageLayout(pageSide = 'front') {
    if (!fabricCanvas) return;
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#ffffff';

    const cW = fabricCanvas.getWidth();
    const cH = fabricCanvas.getHeight();
    const scaleFactor = cW / A4_W; // pixels per mm

    const cardPxW = ID_W * scaleFactor;
    const cardPxH = ID_H * scaleFactor;
    const gapPx = cardGapMM * scaleFactor;

    if (layoutMode === 'cnic_same_page') {
      // 🪪 CNIC Mode: Front on top, Back on bottom centered on A4 sheet
      const firstCard = cards[0] || newCard();
      const topY = (cH - (cardPxH * 2 + gapPx)) / 2;

      // Front
      if (firstCard.frontData) {
        await addCardImageAt(firstCard.frontData, (cW - cardPxW) / 2, topY, cardPxW, cardPxH);
      }
      // Back
      if (firstCard.backData) {
        await addCardImageAt(firstCard.backData, (cW - cardPxW) / 2, topY + cardPxH + gapPx, cardPxW, cardPxH);
      }

    } else if (layoutMode === 'grid_batch') {
      // 📄 Grid Mode: 2x4 grid on A4
      const gridW = COLS * cardPxW + (COLS - 1) * gapPx;
      const gridH = ROWS * cardPxH + (ROWS - 1) * gapPx;
      const startX = (cW - gridW) / 2;
      const startY = (cH - gridH) / 2;

      // Build card slots sequence
      const slots = [];
      cards.forEach(c => {
        const src = pageSide === 'front' ? c.frontData : c.backData;
        for (let i = 0; i < c.copies; i++) {
          if (src) slots.push(src);
        }
      });

      for (let i = 0; i < Math.min(slots.length, COLS * ROWS); i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = startX + col * (cardPxW + gapPx);
        const y = startY + row * (cardPxH + gapPx);
        await addCardImageAt(slots[i], x, y, cardPxW, cardPxH);
      }

    } else {
      // Free Canvas Mode: Load primary image centered
      const initialImg = cards[0]?.frontData || state.scannedImage;
      if (initialImg) {
        await addCardImageAt(initialImg, (cW - cardPxW) / 2, (cH - cardPxH) / 2, cardPxW, cardPxH);
      }
    }

    fabricCanvas.renderAll();
  }

  function addCardImageAt(dataUrl, left, top, width, height) {
    return new Promise(resolve => {
      fabric.Image.fromURL(dataUrl, img => {
        if (!fabricCanvas) { resolve(); return; }

        img.set({
          left,
          top,
          scaleX: width / img.width,
          scaleY: height / img.height,
        });

        fabricCanvas.add(img);
        resolve(img);
      });
    });
  }

  // ── Precision Toolbar Controls ────────────────────────
  App.$('duplicateBtn').addEventListener('click', () => {
    const activeObj = fabricCanvas?.getActiveObject();
    if (!activeObj) {
      App.showToast('Tap on a card/image to select it first.', 'info');
      return;
    }

    activeObj.clone(cloned => {
      fabricCanvas.discardActiveObject();
      cloned.set({
        left: Math.min(fabricCanvas.getWidth() - 30, activeObj.left + 16),
        top: Math.min(fabricCanvas.getHeight() - 30, activeObj.top + 16),
        evented: true,
      });
      fabricCanvas.add(cloned);
      fabricCanvas.setActiveObject(cloned);
      fabricCanvas.renderAll();
      App.showToast('Card duplicated!', 'success');
      updateDimBadge();
    });
  });

  App.$('rotateRightBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj) {
      obj.rotate((obj.angle || 0) + 90);
      fabricCanvas.renderAll();
      updateDimBadge();
    }
  });

  App.$('flipHBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj) { obj.set('flipX', !obj.flipX); fabricCanvas.renderAll(); }
  });

  App.$('flipVBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj) { obj.set('flipY', !obj.flipY); fabricCanvas.renderAll(); }
  });

  App.$('centerBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj && fabricCanvas) {
      obj.center();
      obj.setCoords();
      fabricCanvas.renderAll();
      updateDimBadge();
    }
  });

  App.$('fitBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj && fabricCanvas) {
      const scaleFactor = fabricCanvas.getWidth() / A4_W;
      const targetW = ID_W * scaleFactor;
      const targetH = ID_H * scaleFactor;

      obj.set({
        scaleX: targetW / obj.width,
        scaleY: targetH / obj.height,
        angle: 0,
      });
      obj.setCoords();
      fabricCanvas.renderAll();
      App.showToast('Snapped to standard ID Card size (85.6 × 54 mm)', 'info');
      updateDimBadge();
    }
  });

  App.$('deleteObjBtn').addEventListener('click', () => {
    const obj = fabricCanvas?.getActiveObject();
    if (obj) {
      fabricCanvas.remove(obj);
      fabricCanvas.discardActiveObject();
      fabricCanvas.renderAll();
      clearDimBadge();
    } else {
      App.showToast('Please select a card to delete.', 'info');
    }
  });

  App.$('addImageBtn').addEventListener('click', () => App.$('addImageInput').click());
  App.$('addImageInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const scaleFactor = fabricCanvas.getWidth() / A4_W;
      addCardImageAt(ev.target.result, 40, 40, ID_W * scaleFactor, ID_H * scaleFactor);
      App.showToast('Added image to sheet!', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // Page 1 / Page 2 Tabs
  App.$('frontTab').addEventListener('click', () => switchSheetSide('front'));
  App.$('backTab').addEventListener('click', () => switchSheetSide('back'));

  async function switchSheetSide(side) {
    if (side === activePage) return;

    if (activePage === 'front') {
      frontPageDataUrl = exportCanvas();
    } else {
      backPageDataUrl = exportCanvas();
    }

    activePage = side;
    App.$('frontTab').classList.toggle('active', side === 'front');
    App.$('backTab').classList.toggle('active', side === 'back');

    await buildPageLayout(side);
  }

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

  function exportCanvas() {
    if (!fabricCanvas) return null;
    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();

    return fabricCanvas.toDataURL({
      format: 'png',
      quality: 1.0,
      multiplier: 3.0, // High-res 300 DPI for clean physical print
    });
  }

  // Navigation from Step 3 to Step 4
  App.$('goToSettingsBtn').addEventListener('click', () => {
    // Save current canvas state
    if (activePage === 'front') frontPageDataUrl = exportCanvas();
    else backPageDataUrl = exportCanvas();

    App.goNext();
  });

  // ── Step transition hooks ─────────────────────────────
  window.addEventListener('stepChanged', e => {
    if (e.detail.step === 2) {
      initBatchCards();
    } else if (e.detail.step === 3) {
      requestAnimationFrame(() => {
        initOrBuildSheet();
      });
    }
  });

  window.EditorModule = {
    exportCanvas,
    getExportPayload: () => {
      if (activePage === 'front') frontPageDataUrl = exportCanvas();
      else backPageDataUrl = exportCanvas();

      return {
        front: frontPageDataUrl,
        back: backPageDataUrl || null,
        hasBackSide: !!backPageDataUrl || cards.some(c => !!c.backData),
      };
    },
  };
})();
