/**
 * poller.js — HTTP poll loop for pending print jobs.
 *
 * Handles:
 * - Single-side print jobs
 * - 2-page duplex print jobs
 * - Manual-flip 2-sided print jobs (prints front, prompts operator to flip sheet, prints back)
 */

const fetch = require('node-fetch');
const { Notification, dialog } = require('electron');
const { setTrayState } = require('./tray');
const { handleAccept, handleReject, printSingleUrl } = require('./printer');

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
  if (activeJobId !== null) return; // Don't poll while an active dialog is displayed

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

    const modeLabel = job.printMode === 'manual_flip' ? '2-Sided (Manual Flip)' : (job.printMode === 'duplex' ? '2-Sided (Duplex)' : 'Single Sided');

    console.log(`\n🔔 [NEW PRINT JOB #${job.id}]`);
    console.log(`   Dimensions:  ${job.widthMM} × ${job.heightMM} mm`);
    console.log(`   Copies:      ${job.copies}`);
    console.log(`   Color Mode:  ${job.colorMode === 'bw' ? 'B&W' : 'Color'}`);
    console.log(`   Paper Size:  ${job.paperSize}`);
    console.log(`   Print Mode:  ${modeLabel}`);

    setTrayState('waiting');
    showJobPrompt(job, store);

  } catch (err) {
    consecutiveErrors++;
    if (consecutiveErrors === 1 || consecutiveErrors % 6 === 0) {
      console.warn(`[Poller] Poll check (${consecutiveErrors}):`, err.message);
    }
    if (consecutiveErrors >= 3) {
      setTrayState('error');
    }
  }
}

async function showJobPrompt(job, store) {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: '🖨️ New Print Job Received!',
      body: `Job #${job.id}: ${job.widthMM}×${job.heightMM}mm • ${job.copies} copies • ${job.colorMode === 'bw' ? 'B&W' : 'Color'}`,
      urgency: 'critical',
    });
    notification.show();
  }

  const modeLabel = job.printMode === 'manual_flip' ? '2-Sided (Manual Paper Flip Required)' : (job.printMode === 'duplex' ? '2-Sided Auto Duplex' : 'Single Sided');

  // Prompt on Windows PC
  const choice = await dialog.showMessageBox({
    type: 'question',
    buttons: ['✅ Accept & Print', '❌ Reject'],
    defaultId: 0,
    cancelId: 1,
    title: `New Print Job #${job.id}`,
    message: `A new print job is ready to print:`,
    detail: `• Size: ${job.widthMM} × ${job.heightMM} mm\n• Copies: ${job.copies}\n• Color: ${job.colorMode === 'bw' ? 'Black & White' : 'Color'}\n• Paper: ${job.paperSize}\n• Mode: ${modeLabel}\n\nClick "Accept & Print" to proceed.`,
    noLink: true,
  });

  if (choice.response === 0) {
    await acceptAndProcess(job, store);
  } else {
    await rejectJob(job, store);
  }

  activeJobId = null;
}

async function acceptAndProcess(job, store) {
  const serverUrl = (store.get('serverUrl') || '').replace(/\/$/, '');
  const agentKey = store.get('agentKey');

  setTrayState('printing');
  console.log(`[Poller] Processing job #${job.id}…`);

  try {
    // 1. Notify backend: accepted
    await fetch(`${serverUrl}/api/agent/jobs/${job.id}/accept?agent_key=${encodeURIComponent(agentKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const printer = store.get('printer') || undefined;

    if (job.printMode === 'manual_flip' && job.backImageUrl) {
      // ── Step 1: Print Front ─────────────────────────────
      console.log(`[Poller] Printing Front Side of Job #${job.id}…`);
      await printSingleUrl(job.imageUrl, job.widthMM, job.heightMM, job.copies, printer);

      // ── Step 2: Show Manual Flip Dialog ─────────────────
      setTrayState('waiting');
      await dialog.showMessageBox({
        type: 'info',
        buttons: ['🖨️ Print Back Side Now'],
        defaultId: 0,
        title: `Flip Paper — Job #${job.id}`,
        message: `Front side printed successfully!`,
        detail: `Please take the printed sheet from the output tray, flip it over according to your printer's tray orientation, reinsert it into the feed tray, and click "Print Back Side Now".`,
        noLink: true,
      });

      // ── Step 3: Print Back ──────────────────────────────
      setTrayState('printing');
      console.log(`[Poller] Printing Back Side of Job #${job.id}…`);
      await printSingleUrl(job.backImageUrl, job.widthMM, job.heightMM, job.copies, printer);

    } else {
      // Standard Single or Auto-Duplex
      await handleAccept(job, printer);
    }

    // 4. Notify backend: complete
    await fetch(`${serverUrl}/api/agent/jobs/${job.id}/complete?agent_key=${encodeURIComponent(agentKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    });

    setTrayState('idle');
    console.log(`✅ [Poller] Job #${job.id} completed successfully!`);

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
