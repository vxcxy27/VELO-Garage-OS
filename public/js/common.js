window.toast = function(message, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
};

window.showLockScreen = function(message) {
  const root = document.getElementById('lockScreenRoot');
  if (!root) return;
  root.innerHTML = `
    <div class="lock-screen" style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(12px);">
      <div style="max-width:420px;padding:40px;text-align:center;background:rgba(14,22,17,0.95);border-radius:24px;border:1px solid rgba(244,67,54,0.3);">
        <div style="font-size:48px;margin-bottom:16px;">🔒</div>
        <h2 style="color:#fff;font-size:22px;margin-bottom:8px;">Software Locked</h2>
        <p style="color:#aaa;font-size:14px;line-height:1.6;">${message || 'This shop\'s license has expired. All features are locked until it is renewed by the software provider.'}</p>
        <p style="margin-top:16px;color:#6a7a71;font-size:13px;">Contact your software provider to renew your license.</p>
      </div>
    </div>`;
};

window.api = async function(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (options.body) opts.body = JSON.stringify(options.body);

  try {
    const res = await fetch(path, opts);
    if (res.status === 401) {
      window.location.href = '/login/index.html';
      throw new Error('Not authenticated');
    }
    if (res.status === 402) {
      const data = await res.json().catch(() => ({}));
      window.showLockScreen(data.message);
      throw new Error('License expired');
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return res;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    if (err.message === 'License expired' || err.message === 'Not authenticated') throw err;
    window.toast(err.message, 'error');
    throw err;
  }
};

window.openModal = function(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; };
window.closeModal = function(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; };

document.addEventListener('click', (e) => {
  if (e.target.dataset?.closeModal) window.closeModal(e.target.dataset.closeModal);
  if (e.target.classList.contains('modal-overlay')) e.target.style.display = 'none';
});

window.escapeHtml = function(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
};

window.timeAgo = function(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr + 'Z').getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
};

window.statusLabel = function(s) {
  const map = {
    pending: 'Pending',
    in_progress: 'In Progress',
    on_hold: 'On Hold',
    completed: 'Completed',
    delivered: 'Delivered'
  };
  return map[s] || s;
};

window.reloadData = function() {
  if (window.STATE && typeof window.refreshAll === 'function') {
    window.refreshAll();
  } else if (window.ADMIN_STATE && typeof window.refreshShops === 'function') {
    window.refreshShops();
  } else if (window.MECH_STATE && typeof window.loadJobs === 'function') {
    window.loadJobs();
    window.loadAttendance();
  }
};