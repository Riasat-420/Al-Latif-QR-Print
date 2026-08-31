/**
 * stats.js — Dashboard stats bar.
 *
 * Fetches aggregate counts from GET /api/admin/stats and populates the stat cards.
 * Auto-refreshes every 30 seconds.
 */

(() => {
  const { API_BASE, $ } = DashAuth;
  let refreshTimer = null;

  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats`, { credentials: 'include' });
      if (!res.ok) return;
      const stats = await res.json();

      $('statPrintedToday').textContent = stats.printedToday || 0;
      $('statPrintedWeek').textContent = stats.printedWeek || 0;
      $('statPrintedTotal').textContent = stats.printedTotal || 0;
      $('statPending').textContent = stats.pending || 0;
      $('statFailed').textContent = stats.failed || 0;
      $('statRejected').textContent = stats.rejected || 0;
    } catch (err) {
      console.warn('Stats load error:', err.message);
    }
  }

  window.addEventListener('dashboardReady', () => {
    loadStats();
    // Auto-refresh every 30s
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadStats, 30000);
  });

  // Expose for manual refresh (after reprint/delete)
  window.DashStats = { loadStats };
})();
