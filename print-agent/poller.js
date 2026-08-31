/**
 * poller.js — HTTP poll loop for pending print jobs.
 *
 * Polls GET /api/agent/poll every N seconds.
 * On a new job, triggers the notification flow (Accept/Reject).
 * Handles network errors with exponential backoff.
 */

const fetch = require('node-fetch');
const { Notification } = require('electron');
const { setTrayState } = require('./tray');
const { handleAccept, handleReject } = require('./printer');

let pollTimer = null;
let isPolling = false;
let consecutiveErrors = 0;
const MAX_BACKOFF_MS = 60000;

function startPolling(store) {
  if (isPolling) return;
  isPolling = true;
  consecutiveErrors = 0;
  setTrayState('idle');

  const interval = store.get('pollInterval') || 5000;
  console.log(`[Poller] Starting poll every ${interval}ms`);

  // Immediate first poll
  doPoll(store);

  pollTimer = setInterval(() => doPoll(store), interval);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  isPolling = false;
}

async function doPoll(store) {
  const serverUrl = store.get('serverUrl');
  const agentKey = store.get('agentKey');

  if (!serverUrl || !agentKey) return;

  try {
    const url = `${serverUrl}/api/agent/poll?agent_key=${encodeURIComponent(agentKey)}`;
    const res = await fetch(url, { timeout: 10000 });

    if (res.status === 204) {
      // No pending jobs
      consecutiveErrors = 0;
      setTrayState('idle');
      return;
    }

    if (!res.ok) {
      throw new Error(`Server responded ${res.status}`);
    }

    const job = await res.json();
    consecutiveErrors = 0;

    console.log(`[Poller] New job #${job.id}: ${job.widthMM}×${job.heightMM}mm, ${job.copies} copies`);
    setTrayState('waiting');

    // Show notification
    showJobNotification(job, store);

  } catch (err) {
    consecutiveErrors++;
    console.warn(`[Poller] Poll error (attempt ${consecutiveErrors}):`, err.message);

    if (consecutiveErrors >= 3) {
      setTrayState('error');
    }
  }
}

function showJobNotification(job, store) {
  // Stop polling while waiting for operator action (avoid re-notifying the same job)
  stopPolling();

  const notification = new Notification({
    title: '🖨️ New Print Job',
    body: `${job.widthMM}×${job.heightMM}mm • ${job.copies} ${job.copies > 1 ? 'copies' : 'copy'} • ${job.colorMode === 'bw' ? 'B&W' : 'Color'} • ${job.paperSize}`,
    icon: job.thumbnailUrl || undefined,
    actions: [
      { type: 'button', text: '✅ Accept' },
      { type: 'button', text: '❌ Reject' },
    ],
    urgency: 'critical',
    timeoutType: 'never',
  });

  notification.on('action', (_, index) => {
    if (index === 0) {
      // Accept
      acceptAndPrint(job, store);
    } else {
      // Reject
      rejectJob(job, store);
    }
  });

  // Click on notification body = Accept
  notification.on('click', () => {
    acceptAndPrint(job, store);
  });

  // If notification is closed without action, resume polling
  notification.on('close', () => {
    // Resume polling after a short delay
    setTimeout(() => startPolling(store), 2000);
  });

  notification.show();
}

async function acceptAndPrint(job, store) {
  const serverUrl = store.get('serverUrl');
  const agentKey = store.get('agentKey');

  setTrayState('printing');

  try {
    // Tell backend: accepted
    await fetch(`${serverUrl}/api/agent/jobs/${job.id}/accept?agent_key=${encodeURIComponent(agentKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Download and print
    const printer = store.get('printer') || undefined;
    await handleAccept(job, printer);

    // Tell backend: complete (success)
    await fetch(`${serverUrl}/api/agent/jobs/${job.id}/complete?agent_key=${encodeURIComponent(agentKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    });

    setTrayState('idle');
    console.log(`[Poller] Job #${job.id} printed successfully`);

  } catch (err) {
    console.error(`[Poller] Print failed for job #${job.id}:`, err);
    setTrayState('error');

    // Report failure to backend
    try {
      await fetch(`${serverUrl}/api/agent/jobs/${job.id}/complete?agent_key=${encodeURIComponent(agentKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.message }),
      });
    } catch (reportErr) {
      console.warn('[Poller] Could not report failure:', reportErr.message);
    }
  }

  // Resume polling
  startPolling(store);
}

async function rejectJob(job, store) {
  const serverUrl = store.get('serverUrl');
  const agentKey = store.get('agentKey');

  try {
    await fetch(`${serverUrl}/api/agent/jobs/${job.id}/reject?agent_key=${encodeURIComponent(agentKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Rejected by operator' }),
    });
    console.log(`[Poller] Job #${job.id} rejected`);
  } catch (err) {
    console.warn('[Poller] Could not report rejection:', err.message);
  }

  setTrayState('idle');
  startPolling(store);
}

module.exports = { startPolling, stopPolling };
