/**
 * preview.js — Step 5: Review Preview and Submit Print Job.
 *
 * Shows rendered preview of the physical A4 sheet, summary of options,
 * and submits multipart payload containing Front Page and optional Back Page to backend.
 */

(() => {
  const { state } = App;

  // ── Populate review when entering step 5 ──────────────
  window.addEventListener('stepChanged', e => {
    if (e.detail.step !== 5) return;
    populateReview();
  });

  function populateReview() {
    const payload = window.EditorModule?.getExportPayload();
    if (payload && payload.front) {
      App.$('reviewPreviewImg').src = payload.front;
    }

    const modeLabels = {
      single: 'Single-Sided (1 Page)',
      manual_flip: 'Manual Flip 2-Sided (Non-Duplex)',
      duplex: 'Auto Double-Sided (Duplex)',
    };

    App.$('reviewPaper').textContent = `${state.paperSize || 'A4'} Sheet (${state.widthMM || 210} × ${state.heightMM || 297} mm)`;
    App.$('reviewDuplex').textContent = modeLabels[state.printMode] || 'Single-Sided';
    App.$('reviewColor').textContent = state.colorMode === 'color' ? 'Full Color' : 'Black & White';
    App.$('reviewOrientation').textContent = state.orientation === 'portrait' ? 'Portrait' : 'Landscape';
    App.$('reviewCopies').textContent = `${state.copies} ${state.copies > 1 ? 'copies' : 'copy'}`;
  }

  // ── Submit Print Job ──────────────────────────────────
  App.$('submitBtn').addEventListener('click', submitJob);

  async function submitJob() {
    const submitBtn = App.$('submitBtn');
    submitBtn.disabled = true;

    App.showLoading('Submitting your print job to shop…');

    try {
      const payload = window.EditorModule?.getExportPayload();
      if (!payload || !payload.front) throw new Error('No document sheet rendered to submit');

      const frontBlob = dataURLToBlob(payload.front);

      const formData = new FormData();
      formData.append('image', frontBlob, 'sheet-front.png');

      if (payload.back && (state.printMode === 'manual_flip' || state.printMode === 'duplex')) {
        const backBlob = dataURLToBlob(payload.back);
        formData.append('back_image', backBlob, 'sheet-back.png');
      }

      formData.append('shop_token', state.shopToken || '');
      formData.append('widthMM', state.widthMM || 210);
      formData.append('heightMM', state.heightMM || 297);
      formData.append('copies', state.copies || 1);
      formData.append('colorMode', state.colorMode || 'color');
      formData.append('paperSize', state.paperSize || 'A4');
      formData.append('orientation', state.orientation || 'portrait');
      formData.append('printMode', state.printMode || 'single');

      const res = await fetch(`${state.apiBase}/api/jobs`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit print job');
      }

      state.jobId = data.job_id;
      App.hideLoading();
      App.showToast('Print job transmitted to shop!', 'success');
      App.goNext(); // Step 6: Status

    } catch (err) {
      App.hideLoading();
      console.error('Submit error:', err);
      App.showToast(err.message || 'Failed to submit. Please try again.', 'error');
      submitBtn.disabled = false;
    }
  }

  function dataURLToBlob(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
})();
