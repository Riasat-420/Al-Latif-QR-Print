/**
 * jobs.js — Dashboard job list with filters and pagination.
 *
 * Fetches paginated jobs from GET /api/admin/jobs and renders job cards.
 * Supports filtering by status and date range.
 */

(() => {
  const { API_BASE, $ } = DashAuth;

  let currentPage = 1;
  let totalPages = 1;

  const BADGE_CLASSES = {
    pending:  'badge-pending',
    accepted: 'badge-accepted',
    printed:  'badge-printed',
    rejected: 'badge-rejected',
    failed:   'badge-failed',
    expired:  'badge-expired',
  };

  async function loadJobs(page = 1) {
    currentPage = page;

    const params = new URLSearchParams({ page });
    const status = $('filterStatus').value;
    const from = $('filterFrom').value;
    const to = $('filterTo').value;

    if (status) params.append('status', status);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    try {
      const res = await fetch(`${API_BASE}/api/admin/jobs?${params}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();

      totalPages = data.pages || 1;
      renderJobs(data.jobs);
      renderPagination(data);
    } catch (err) {
      console.warn('Jobs load error:', err.message);
      $('jobList').innerHTML = '<div class="job-list-empty">Failed to load jobs.</div>';
    }
  }

  function renderJobs(jobs) {
    const list = $('jobList');

    if (!jobs || jobs.length === 0) {
      list.innerHTML = '<div class="job-list-empty">No jobs found.</div>';
      return;
    }

    list.innerHTML = jobs.map(job => `
      <div class="job-card" data-id="${job.id}">
        <img class="job-thumb" src="${job.thumbnailUrl || ''}" alt="Preview"
             onerror="this.style.display='none'">
        <div class="job-info">
          <div class="job-id">#${job.id} ${job.reprint_of ? '(reprint of #' + job.reprint_of + ')' : ''}</div>
          <div class="job-meta">
            ${job.width_mm}×${job.height_mm}mm • ${job.copies} ${job.copies > 1 ? 'copies' : 'copy'} • ${job.color_mode === 'bw' ? 'B&W' : 'Color'}
          </div>
          <div class="job-time">${formatDate(job.created_at)}</div>
          <span class="job-status-badge ${BADGE_CLASSES[job.status] || ''}">${job.status}</span>
        </div>
      </div>
    `).join('');

    // Click handler: open modal
    list.querySelectorAll('.job-card').forEach(card => {
      card.addEventListener('click', () => {
        const jobId = card.dataset.id;
        window.DashActions?.openJobModal(jobId);
      });
    });
  }

  function renderPagination(data) {
    const pag = $('pagination');
    if (data.pages <= 1) {
      pag.style.display = 'none';
      return;
    }

    pag.style.display = 'flex';
    $('pageInfo').textContent = `Page ${data.page} of ${data.pages}`;
    $('prevPage').disabled = data.page <= 1;
    $('nextPage').disabled = data.page >= data.pages;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
           ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // Filter buttons
  $('filterApply').addEventListener('click', () => loadJobs(1));
  $('filterReset').addEventListener('click', () => {
    $('filterStatus').value = '';
    $('filterFrom').value = '';
    $('filterTo').value = '';
    loadJobs(1);
  });

  // Pagination
  $('prevPage').addEventListener('click', () => { if (currentPage > 1) loadJobs(currentPage - 1); });
  $('nextPage').addEventListener('click', () => { if (currentPage < totalPages) loadJobs(currentPage + 1); });

  // Load on dashboard ready
  window.addEventListener('dashboardReady', () => loadJobs(1));

  // Expose for other modules
  window.DashJobs = { loadJobs };
})();
