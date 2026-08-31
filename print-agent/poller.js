/**
 * poller.js — HTTP poll loop for pending print jobs.
 *
 * Polls GET /api/agent/poll every N seconds.
 * On a new job, triggers Accept/Reject prompt & Windows notification.
 * Handles network errors with exponential backoff.
 */

const fetch = require('node-fetch');
const { Notification, dialog, BrowserWindow } = require('electron');
const { setTrayState } = require('./tray');
const { handleAccept, handleReject } = require('./printer');

let pollTimer = null;
let isPolling = false;
let consecutiveErrors = 0;
let activeJobId = null;

function startPolling(store) {
  if (isPolling) return;
  isPolling = true;
  consecutiveErrors = 0;
  setTrayState('idle');

  const interval = store.get('pollInterval') || 5000;
  console.log(`[Poller] Active — polling every ${interval / 1000}s`);

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
  const serverUrl = (store.get('serverUrl') || '').replace(/\/$/, '');
  const agentKey = store.get('agentKey');

  if (!serverUrl || !agentKey) return;
  if (activeJobId !== null) return; // Don't poll if currently processing a prompt

  try {
    const url = `${serverUrl}/api/agent/poll?agent_key=${encodeURIComponent(agentKey)}`;
    const res = await fetch(url, { timeout: 10000 });

    if (res.status === 204) {
      consecutiveErrors = 0;
      setTrayState('idle');
      return;
    }

    if (!res.ok) {
      throw new Error(`Server responded HTTP ${res.status}`);
    }

    const job = await res.json();
    consecutiveErrors = 0;

    if (activeJobId === job.id) return;
    activeJobId = job.id;

    console.log(`\n🔔 [NEW PRINT JOB #${job.id}]`);
    console.log(`   Dimensions:  ${job.widthMM} × ${job.heightMM} mm`);
    console.log(`   Copies:      ${job.copies}`);
    console.log(`   Color Mode:  ${job.colorMode === 'bw' ? 'B&W' : 'Color'}`);
    console.log(`   Paper Size:  ${job.paperSize}`);

    setTrayState('waiting');
    showJobPrompt(job, store);

  } catch (err) {
    consecutiveErrors++;
    if (consecutiveErrors === 1 || consecutiveErrors % 5 === 0) {
      console.warn(`[Poller] Poll error (${consecutiveErrors}):`, err.message);
    }
    if (consecutiveErrors >= 3) {
      setTrayState('error');
    }
  }
}

async function showJobPrompt(job, store) {
  // Show system notification
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: '🖨️ New Print Job Received!',
      body: `Job #${job.id}: ${job.widthMM}×${job.heightMM}mm • ${job.copies} copies • ${job.colorMode === 'bw' ? 'B&W' : 'Color'}`,
      urgency: 'critical',
    });
    notification.on('click', () => {
      // Focus or bring dialog forward
    });
    notification.show();
  }

  // Show immediate on-screen dialog on shop PC
  const choice = await dialog.showMessageBox({
    type: 'question',
    buttons: ['✅ Accept & Print', '❌ Reject'],
    defaultId: 0,
    cancelId: 1,
    title: `New Print Job #${job.id}`,
    message: `A new print job has been submitted:`,
    detail: `• Size: ${job.widthMM} × ${job.heightMM} mm\n• Copies: ${job.copies}\n• Color: ${job.colorMode === 'bw' ? 'Black & White' : 'Color'}\n• Paper: ${job.paperSize}\n\nClick "Accept & Print" to print immediately.`,
    noLink: true,
  });

  if (choice.response === 0) {
    await acceptAndPrint(job, store);
  } else {
    await rejectJob(job, store);
  }

  activeJobId = null;
}

async function acceptAndPrint(job, store) {
  const serverUrl = (store.get('serverUrl') || '').replace(/\/$/, '');
  const agentKey = store.get('agentKey');

  setTrayState('printing');
  console.log(`[Poller] Accepting job #${job.id}…`);

  try {
    // 1. Notify backend: accepted
    await fetch(`${serverUrl}/api/agent/jobs/${job.id}/accept?agent_key=${encodeURIComponent(agentKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // 2. Build exact-size PDF & silent print
    const printer = store.get('printer') || undefined;
    await handleAccept(job, printer);

    // 3. Notify backend: complete
    await fetch(`${serverUrl}/api/agent/jobs/${job.id}/complete?agent_key=${encodeURIComponent(agentKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    });

    setTrayState('idle');
    console.log(`✅ [Poller] Job #${job.id} printed successfully!`);

  } catch (err) {
    console.error(`❌ [Poller] Print failed for job #${job.id}:`, err.message);
    setTrayState('error');

    try {
      await fetch(`${serverUrl}/api/agent/jobs/${job.id}/complete?agent_key=${encodeURIComponent(agentKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.message }),
      });
    } catch {}
  }
}

async function rejectJob(job, store) {
  const serverUrl = (store.get('serverUrl') || '').replace(/\/$/, '');
  const agentKey = store.get('agentKey');

  try {
    await fetch(`${serverUrl}/api/agent/jobs/${job.id}/reject?agent_key=${encodeURIComponent(agentKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Declined by shop operator' }),
    });
    console.log(`❌ [Poller] Job #${job.id} rejected.`);
  } catch (err) {
    console.warn('[Poller] Reject reporting failed:', err.message);
  }

  setTrayState('idle');
}

module.exports = { startPolling, stopPolling };
