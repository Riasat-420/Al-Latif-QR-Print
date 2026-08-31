/**
 * settings.js — Step 4: Print settings (paper size, color mode, orientation, copies).
 *
 * Reads user selections and stores them in App.state.
 * Uses simple option-button toggle pattern.
 */

(() => {
  const { state } = App;

  // ── Option button groups ──────────────────────────────
  function setupOptionGroup(containerId, stateKey, defaultValue) {
    const container = App.$(containerId);
    if (!container) return;

    const buttons = container.querySelectorAll('.option-btn');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state[stateKey] = btn.dataset.value;
      });
    });

    // Set default
    state[stateKey] = defaultValue;
  }

  setupOptionGroup('paperSizeOptions', 'paperSize', 'A4');
  setupOptionGroup('colorModeOptions', 'colorMode', 'color');
  setupOptionGroup('orientationOptions', 'orientation', 'portrait');

  // ── Copies stepper ────────────────────────────────────
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

  // ── Navigation: step 4 → step 5 via swipe or we add
  //    a "Next" action at bottom. For now, we rely on
  //    a next button being added, or the user tapping
  //    the progress bar step. Let's add a continue button. ─
  // We'll append a "Continue" button dynamically
  const settingsContent = App.$('step4').querySelector('.step-content');
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-primary btn-lg';
  nextBtn.style.marginTop = '24px';
  nextBtn.innerHTML = 'Continue to Review →';
  nextBtn.addEventListener('click', () => App.goNext());
  settingsContent.appendChild(nextBtn);

  // Also add continue button on step 3 (editor)
  const editorContent = App.$('step3').querySelector('.step-content');
  const editorNextBtn = document.createElement('button');
  editorNextBtn.className = 'btn btn-primary btn-lg';
  editorNextBtn.style.marginTop = '12px';
  editorNextBtn.innerHTML = 'Continue to Settings →';
  editorNextBtn.addEventListener('click', () => App.goNext());
  editorContent.appendChild(editorNextBtn);
})();
