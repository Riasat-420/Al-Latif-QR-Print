/**
 * settings.js — Step 4: Print Settings & Duplex Configuration.
 *
 * Configures:
 * - 2-Sided / Duplex Mode (Single, Manual Flip Non-Duplex, Auto Duplex)
 * - Paper Format (A4, Letter, A5)
 * - Color Mode (Color, Black & White)
 * - Sheet Orientation (Portrait, Landscape)
 * - Sheet Copies
 */

(() => {
  const { state } = App;

  state.printMode = 'single'; // 'single', 'manual_flip', 'duplex'
  state.paperSize = 'A4';
  state.colorMode = 'color';
  state.orientation = 'portrait';
  state.copies = 1;

  // ── Duplex Options ────────────────────────────────────
  const duplexOptions = App.$('duplexOptions');
  const duplexHelp = App.$('duplexHelpText');

  const helpMessages = {
    single: 'Prints Page 1 directly. Both Front & Back can be arranged on the same page.',
    manual_flip: 'Recommended for standard (non-duplex) printers: Page 1 prints out, then the operator flips the paper in the tray to print Page 2.',
    duplex: 'For double-sided printers: both sides are printed automatically in a single pass.',
  };

  if (duplexOptions) {
    duplexOptions.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        duplexOptions.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.printMode = btn.dataset.value;
        if (duplexHelp) duplexHelp.textContent = helpMessages[state.printMode] || '';
      });
    });
  }

  // ── Other Option Groups ───────────────────────────────
  function setupOptionGroup(containerId, stateKey, defaultValue) {
    const container = App.$(containerId);
    if (!container) return;

    container.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state[stateKey] = btn.dataset.value;
      });
    });

    state[stateKey] = defaultValue;
  }

  setupOptionGroup('paperSizeOptions', 'paperSize', 'A4');
  setupOptionGroup('colorModeOptions', 'colorMode', 'color');
  setupOptionGroup('orientationOptions', 'orientation', 'portrait');

  // ── Copies Stepper ────────────────────────────────────
  const copiesValue = App.$('copiesValue');

  App.$('copiesMinus').addEventListener('click', () => {
    if (state.copies > 1) {
      state.copies--;
      copiesValue.textContent = state.copies;
    }
  });

  App.$('copiesPlus').addEventListener('click', () => {
    if (state.copies < 99) {
      state.copies++;
      copiesValue.textContent = state.copies;
    }
  });

  // ── Navigation to Step 5 (Review) ─────────────────────
  const goToReview = App.$('goToReviewBtn');
  if (goToReview) {
    goToReview.addEventListener('click', () => {
      App.goNext();
    });
  }
})();
