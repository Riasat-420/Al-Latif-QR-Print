/**
 * preview.js — Step 5: Review preview and submit.
 *
 * Shows a rendered preview of the canvas, a summary of all settings,
 * and the Submit button that POSTs the job to the backend.
 */

(() => {
  const { state } = App;

  // ── Populate review when entering step 5 ──────────────
  window.addEventListener('stepChanged', e => {
    if (e.detail.step !== 5) return;
    populateReview();
  });

  function populateReview() {
    // Render canvas preview
    const previewDataUrl = window.EditorModule?.exportCanvas();
    if (previewDataUrl) {
      App.$('reviewPreviewImg').src = previewDataUrl;
    }

    // Fill summary
    App.$('reviewSize').textContent = state.sizeName || `${state.widthMM} × ${state.heightMM} mm`;
    App.$('reviewPaper').textContent = state.paperSize;
    App.$('reviewColor').textContent = state.colorMode === 'color' ? 'Color' : 'Black & White';
    App.$('reviewOrientation').textContent = state.orientation === 'portrait' ? 'Portrait' : 'Landscape';
    App.$('reviewCopies').textContent = state.copies;

    // Simple sheet estimate: 1 sheet per copy (MVP — no multi-page)
    App.$('reviewSheets').textContent = `${state.copies} sheet${state.copies > 1 ? 's' : ''}`;
  }

  // ── Submit ────────────────────────────────────────────
  App.$('submitBtn').addEventListener('click', submitJob);

  async function submitJob() {
    const submitBtn = App.$('submitBtn');
    submitBtn.disabled = true;

    App.showLoading('Submitting your print job…');

    try {
      // Get the canvas image as a blob (more efficient than base64)
      const canvasDataUrl = window.EditorModule?.exportCanvas();
      if (!canvasDataUrl) throw new Error('No image to submit');

      // Convert data URL to Blob for multipart upload
      const blob = dataURLToBlob(canvasDataUrl);

      // Build multipart form
      const formData = new FormData();
      formData.append('image', blob, 'print-job.png');
      formData.append('shop_token', state.shopToken || '');
      formData.append('widthMM', state.widthMM);
      formData.append('heightMM', state.heightMM);
      formData.append('copies', state.copies);
      formData.append('colorMode', state.colorMode);
      formData.append('paperSize', state.paperSize);
      formData.append('orientation', state.orientation);

      const res = await fetch(`${state.apiBase}/api/jobs`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit job');
      }

      state.jobId = data.job_id;
      App.hideLoading();
      App.showToast('Print job submitted!', 'success');
      App.goNext(); // Go to status screen

    } catch (err) {
      App.hideLoading();
      console.error('Submit error:', err);
      App.showToast(err.message || 'Failed to submit. Please try again.', 'error');
      submitBtn.disabled = false;
    }
  }

  // ── Utility: data URL → Blob ──────────────────────────
  function dataURLToBlob(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
})();
