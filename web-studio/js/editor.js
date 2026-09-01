/**
 * editor.js — Step 2 (Type & Batch Selector) + Step 3 (Full Page & A4 Sheet Canvas Editor).
 *
 * Supports:
 * 1. full_page (DEFAULT): Full Page Document / PDF / Certificate / Photo (covers whole A4 sheet)
 * 2. cnic_same_page: Front + Back on same A4 sheet (Pakistani CNIC copy format)
 * 3. grid_batch: 2×4 Batch Multi-Card Grid on A4
 * 4. free_canvas: Free dragging, scaling, rotating, and placement
 */

(() => {
  const { state } = App;

  // Standard Physical Dimensions (in mm)
  const A4_W = 210, A4_H = 297;
  const ID_W = 85.6, ID_H = 54.0;
  const COLS = 2, ROWS = 4;

  let fabricCanvas = null;
  let activePage = 'front';
  let frontPageDataUrl = null;
  let backPageDataUrl = null;

  // Layout State
  let printType = 'full_page'; // 'full_page', 'cnic_same_page', 'grid_batch', 'free_canvas'
  let cards = [];
  let nextCardId = 1;

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
  // STEP 2: PRINT TYPE & BATCH CARD SELECTOR
  // ═══════════════════════════════════════════════════════

  function initStep2() {
    if (cards.length === 0) {
      cards.push(newCard(state.scannedImage));
    } else if (state.scannedImage && !cards[0].frontData) {
      cards[0].frontData = state.scannedImage;
    }

    renderPrintTypeSelection();
    renderBatchCardsList();
  }

  function renderPrintTypeSelection() {
    const cardsEl = document.querySelectorAll('.print-type-card');
    const batchWrap = App.$('batchCardManagerWrap');

    cardsEl.forEach(card => {
      card.addEventListener('click', () => {
        cardsEl.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        printType = card.dataset.type;

        if (batchWrap) {
          batchWrap.style.display = (printType === 'cnic_same_page' || printType === 'grid_batch') ? 'block' : 'none';
        }
      });
    });
  }

  function renderBatchCardsList() {
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
            <b>Card #${idx + 1}</b>
          </div>
          ${cards.length > 1 ? `<button class="btn-remove-card" data-id="${c.id}">✕ Remove</button>` : ''}
        </div>

        <div class="batch-card-uploads">
          <!-- Front Side -->
          <div class="upload-slot ${c.frontData ? 'has-image' : ''}" data-side="front" data-id="${c.id}">
            <div class="slot-label">Front Side *</div>
            <div class="slot-preview">
              ${c.frontData ? `<img src="${c.frontData}" alt="Front">` : `<div class="slot-placeholder">📷 Upload Front</div>`}
            </div>
            <input type="file" accept="image/*" class="slot-file-input" style="display:none">
          </div>

          <!-- Back Side -->
          <div class="upload-slot ${c.backData ? 'has-image' : ''}" data-side="back" data-id="${c.id}">
            <div class="slot-label">Back Side (Optional)</div>
            <div class="slot-preview">
              ${c.backData ? `<img src="${c.backData}" alt="Back">` : `<div class="slot-placeholder">📷 Upload Back</div>`}
            </div>
            <input type="file" accept="image/*" class="slot-file-input" style="display:none">
          </div>
        </div>

        <div class="batch-card-footer">
          <label>Copies on sheet:</label>
          <div class="mini-stepper">
            <button class="mini-step-btn minus" data-id="${c.id}">−</button>
            <span class="mini-step-val">${c.copies}</span>
            <button class="mini-step-btn plus" data-id="${c.id}">+</button>
          </div>
        </div>
      `;

      list.appendChild(cardBox);
    });

    bindCardListEvents();
  }

  function bindCardListEvents() {
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
            renderBatchCardsList();
          }
        };
        reader.readAsDataURL(file);
      });
    });

    document.querySelectorAll('.btn-remove-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        cards = cards.filter(x => x.id !== id);
        renderBatchCardsList();
      });
    });

    document.querySelectorAll('.mini-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const card = cards.find(x => x.id === id);
        if (!card) return;
        if (btn.classList.contains('plus')) card.copies = Math.min(16, card.copies + 1);
        else card.copies = Math.max(1, card.copies - 1);
        renderBatchCardsList();
      });
    });
  }

  App.$('addNewCardBtn').addEventListener('click', () => {
    cards.push(newCard());
    renderBatchCardsList();
  });

  App.$('goToLayoutBtn').addEventListener('click', () => {
    state.widthMM = A4_W;
    state.heightMM = A4_H;
    state.paperSize = 'A4';
    App.goNext(); // Step 3
  });

  // ═══════════════════════════════════════════════════════
  // STEP 3: PHYSICAL A4 PAPER SHEET WORKSPACE
  // ═══════════════════════════════════════════════════════

  function initOrBuildSheet() {
    const container = App.$('canvasContainer');
    const canvasEl = App.$('editorCanvas');

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

    badge.textContent = `Document: ${realW_mm} × ${realH_mm} mm`;
    badge.classList.add('active');
  }

  function clearDimBadge() {
    const badge = App.$('dimBadge');
    if (badge) {
      badge.textContent = `A4 Sheet: 210 × 297 mm`;
      badge.classList.remove('active');
    }
  }

  // ── Layout Generator for Full Page & ID Cards ─────────
  async function buildPageLayout(pageSide = 'front') {
    if (!fabricCanvas) return;
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#ffffff';

    const cW = fabricCanvas.getWidth();
    const cH = fabricCanvas.getHeight();
    const scaleFactor = cW / A4_W;

    const mainImage = state.scannedImage || cards[0]?.frontData;

    if (printType === 'full_page') {
      // 📄 Full Page Document: Fill the A4 sheet proportionally (96% fit with neat margins)
      if (mainImage) {
        await addFullPageImage(mainImage, cW, cH);
      }

    } else if (printType === 'cnic_same_page') {
      // 🪪 CNIC Mode: Front on top, Back on bottom
      const cardPxW = ID_W * scaleFactor;
      const cardPxH = ID_H * scaleFactor;
      const gapPx = 12 * scaleFactor;
      const firstCard = cards[0] || newCard();
      const topY = (cH - (cardPxH * 2 + gapPx)) / 2;

      if (firstCard.frontData) {
        await addCardImageAt(firstCard.frontData, (cW - cardPxW) / 2, topY, cardPxW, cardPxH);
      }
      if (firstCard.backData) {
        await addCardImageAt(firstCard.backData, (cW - cardPxW) / 2, topY + cardPxH + gapPx, cardPxW, cardPxH);
      }

    } else if (printType === 'grid_batch') {
      // 📑 Batch Grid Mode: 2x4 on A4
      const cardPxW = ID_W * scaleFactor;
      const cardPxH = ID_H * scaleFactor;
      const gapPx = 8 * scaleFactor;
      const gridW = COLS * cardPxW + (COLS - 1) * gapPx;
      const gridH = ROWS * cardPxH + (ROWS - 1) * gapPx;
      const startX = (cW - gridW) / 2;
      const startY = (cH - gridH) / 2;

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
      // Free Canvas
      if (mainImage) {
        await addFullPageImage(mainImage, cW, cH, 0.85);
      }
    }

    fabricCanvas.renderAll();
  }

  function addFullPageImage(dataUrl, cW, cH, fillRatio = 0.96) {
    return new Promise(resolve => {
      fabric.Image.fromURL(dataUrl, img => {
        if (!fabricCanvas) { resolve(); return; }

        const maxW = cW * fillRatio;
        const maxH = cH * fillRatio;
        const scale = Math.min(maxW / img.width, maxH / img.height);

        img.set({
          scaleX: scale,
          scaleY: scale,
          left: (cW - img.width * scale) / 2,
          top: (cH - img.height * scale) / 2,
        });

        fabricCanvas.add(img);
        fabricCanvas.setActiveObject(img);
        resolve(img);
      });
    });
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

  // ── Toolbar Actions ───────────────────────────────────
  App.$('fitFullPageBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj && fabricCanvas) {
      const cW = fabricCanvas.getWidth();
      const cH = fabricCanvas.getHeight();
      const scale = Math.min((cW * 0.96) / obj.width, (cH * 0.96) / obj.height);

      obj.set({
        scaleX: scale,
        scaleY: scale,
        left: (cW - obj.width * scale) / 2,
        top: (cH - obj.height * scale) / 2,
        angle: 0,
      });
      obj.setCoords();
      fabricCanvas.renderAll();
      App.showToast('Fitted to Full A4 Page margins', 'info');
      updateDimBadge();
    }
  });

  App.$('fitIdBtn').addEventListener('click', () => {
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
      App.showToast('Snapped to ID Card size (85.6 × 54 mm)', 'info');
      updateDimBadge();
    }
  });

  App.$('duplicateBtn').addEventListener('click', () => {
    const activeObj = fabricCanvas?.getActiveObject();
    if (!activeObj) {
      App.showToast('Tap on document to select it first.', 'info');
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
      App.showToast('Item duplicated!', 'success');
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

  App.$('centerBtn').addEventListener('click', () => {
    const obj = getTargetObject();
    if (obj && fabricCanvas) {
      obj.center();
      obj.setCoords();
      fabricCanvas.renderAll();
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
      App.showToast('Select an item to delete.', 'info');
    }
  });

  App.$('addImageBtn').addEventListener('click', () => App.$('addImageInput').click());
  App.$('addImageInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const cW = fabricCanvas.getWidth();
      const cH = fabricCanvas.getHeight();
      addFullPageImage(ev.target.result, cW, cH, 0.7);
      App.showToast('Added image to sheet!', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  App.$('frontTab').addEventListener('click', () => switchSheetSide('front'));
  App.$('backTab').addEventListener('click', () => switchSheetSide('back'));

  async function switchSheetSide(side) {
    if (side === activePage) return;

    if (activePage === 'front') frontPageDataUrl = exportCanvas();
    else backPageDataUrl = exportCanvas();

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
      multiplier: 3.0, // Crisp 300 DPI high-res output
    });
  }

  App.$('goToSettingsBtn').addEventListener('click', () => {
    if (activePage === 'front') frontPageDataUrl = exportCanvas();
    else backPageDataUrl = exportCanvas();
    App.goNext();
  });

  window.addEventListener('stepChanged', e => {
    if (e.detail.step === 2) {
      initStep2();
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
