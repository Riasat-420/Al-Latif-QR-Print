/**
 * auth.js — Dashboard login/logout and session management.
 */

const DashAuth = (() => {
  const API_BASE = '';
  const $ = id => document.getElementById(id);

  // Check existing session on load
  async function checkSession() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/session`, { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated) {
        showDashboard(data.shopName);
        return true;
      }
    } catch (err) {
      console.warn('Session check failed:', err.message);
    }
    showLogin();
    return false;
  }

  function showLogin() {
    $('loginScreen').style.display = '';
    $('dashboardMain').style.display = 'none';
  }

  function showDashboard(shopName) {
    $('loginScreen').style.display = 'none';
    $('dashboardMain').style.display = '';
    if (shopName) $('dashShopName').textContent = shopName;

    // Trigger data load
    window.dispatchEvent(new CustomEvent('dashboardReady'));
  }

  // Login form
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const password = $('loginPassword').value;
    const errorEl = $('loginError');
    errorEl.style.display = 'none';

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Login failed';
        errorEl.style.display = 'block';
        return;
      }

      showDashboard(data.shop?.name);
    } catch (err) {
      errorEl.textContent = 'Could not connect to server.';
      errorEl.style.display = 'block';
    }
  });

  // Logout
  $('logoutBtn').addEventListener('click', async () => {
    try {
      await fetch(`${API_BASE}/api/admin/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
    showLogin();
  });

  // Toast helper
  function showToast(message, type = 'info') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkSession);
  } else {
    checkSession();
  }

  return { API_BASE, $, showToast };
})();
