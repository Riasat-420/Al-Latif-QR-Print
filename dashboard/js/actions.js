/**
 * actions.js — Dashboard per-job actions: view, delete, reprint, edit-then-reprint.
 *
 * Manages the job detail modal and its action buttons.
 */

(() => {
  const { API_BASE, $, showToast } = DashAuth;

  let currentJobId = null;

  // ── Open job modal ────────────────────────────────────
  async function openJobModal(jobId) {
    currentJobId = jobId;

    try {
      const res = await fetch(`${API_BASE}/api/admin/jobs/${jobId}`, { credentials: 'include' });
      if (!res.ok) {
        showToast('Failed to load job details.', 'error');
        return;
      }
      const job = await res.json();

      // Populate modal
      $('modalImage').src = job.imageUrl || job.thumbnailUrl || '';
      $('modalId').textContent = `#${job.id}`;
      $('modalStatus').innerHTML = `<span class="job-status-badge badge-${job.status}">${job.status}</span>`;
      $('modalSize').textContent = `${job.width_mm} × ${job.height_mm} mm`;
      $('modalPaper').textContent = job.paper_size;
      $('modalColor').textContent = job.color_mode === 'bw' ? 'Black & White' : 'Color';
      $('modalCopies').textContent = job.copies;
      $('modalCreated').textContent = formatDate(job.created_at);
      $('modalPrinted').textContent = job.printed_at ? formatDate(job.printed_at) : '—';

      $('jobModal').style.display = 'flex';
    } catch (err) {
      showToast('Error loading job.', 'error');
    }
  }

  // ── Close modal ───────────────────────────────────────
  $('modalClose').addEventListener('click', closeModal);
  $('jobModal').addEventListener('click', e => {
    if (e.target === $('jobModal')) closeModal();
  });

  function closeModal() {
    $('jobModal').style.display = 'none';
    currentJobId = null;
  }

  // ── Reprint ───────────────────────────────────────────
  $('modalReprint').addEventListener('click', async () => {
    if (!currentJobId) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/jobs/${currentJobId}/reprint`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Reprint failed.', 'error');
        return;
      }

      const data = await res.json();
      showToast(`Reprint queued as job #${data.job_id}`, 'success');
      closeModal();

      // Refresh lists
      window.DashJobs?.loadJobs();
      window.DashStats?.loadStats();
    } catch (err) {
      showToast('Reprint failed.', 'error');
    }
  });

  // ── Delete ────────────────────────────────────────────
  $('modalDelete').addEventListener('click', async () => {
    if (!currentJobId) return;

    if (!confirm('Delete this job and its files permanently?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/jobs/${currentJobId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Delete failed.', 'error');
        return;
      }

      showToast('Job deleted.', 'success');
      closeModal();

      // Refresh lists
      window.DashJobs?.loadJobs();
      window.DashStats?.loadStats();
    } catch (err) {
      showToast('Delete failed.', 'error');
    }
  });

  // ── Utility ───────────────────────────────────────────
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
           ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // Expose
  window.DashActions = { openJobModal };
})();
