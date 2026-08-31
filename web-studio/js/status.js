/**
 * status.js — Step 6: Job status polling.
 *
 * Polls GET /api/jobs/:id/status every 3 seconds.
 * Shows animated status transitions:
 *   pending → accepted → printed (success)
 *   pending → rejected (with reason)
 *   accepted → failed (print error)
 */

(() => {
  const { state } = App;
  let pollTimer = null;

  const STATUS_CONFIG = {
    pending: {
      icon: '<div class="spinner"></div>',
      title: 'Waiting for shop…',
      message: 'Your print job has been submitted. The shop operator will review it shortly.',
    },
    accepted: {
      icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
      title: 'Printing…',
      message: 'The operator accepted your job. It\'s being printed now.',
    },
    printed: {
      icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      title: 'Done — please collect!',
      message: 'Your document has been printed. Please collect it from the shop counter.',
    },
    rejected: {
      icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      title: 'Job rejected',
      message: 'The shop operator declined this print job.',
    },
    failed: {
      icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      title: 'Print failed',
      message: 'Something went wrong during printing. Please ask the shop operator.',
    },
    expired: {
      icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      title: 'Job expired',
      message: 'This job was not accepted in time and has expired.',
    },
  };

  // ── Start polling when entering step 6 ────────────────
  window.addEventListener('stepChanged', e => {
    if (e.detail.step === 6) {
      startPolling();
    } else {
      stopPolling();
    }
  });

  function startPolling() {
    if (!state.jobId) return;
    updateUI('pending');
    poll(); // Immediate first poll
    pollTimer = setInterval(poll, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function poll() {
    if (!state.jobId) return;

    try {
      const res = await fetch(`${state.apiBase}/api/jobs/${state.jobId}/status`);
      if (!res.ok) {
        console.warn('Status poll failed:', res.status);
        return;
      }
      const data = await res.json();
      updateUI(data.status, data.reject_reason);

      // Stop polling on terminal statuses
      if (['printed', 'rejected', 'failed', 'expired'].includes(data.status)) {
        stopPolling();
        App.$('newJobBtn').style.display = 'block';
      }
    } catch (err) {
      console.warn('Status poll error:', err.message);
    }
  }

  function updateUI(status, rejectReason) {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const card = App.$('statusCard');

    // Update CSS class for color theming
    card.className = `status-card ${status}`;

    App.$('statusIcon').innerHTML = config.icon;
    App.$('statusTitle').textContent = config.title;

    let message = config.message;
    if (status === 'rejected' && rejectReason) {
      message += ` Reason: "${rejectReason}"`;
    }
    App.$('statusMessage').textContent = message;
  }
})();
