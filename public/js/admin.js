// ============================================================
// Admin Dashboard - Velo Shop
// ============================================================

let ADMIN_STATE = {
  view: 'overview',
  shops: []
};

const VIEW_META = {
  overview: { title: 'Overview', sub: 'Your client base at a glance.' },
  shops: { title: 'Shops', sub: 'Every garage running MechShop Suite.' },
  licenses: { title: 'License Expiry', sub: 'Renew before a shop\'s software locks up.' },
};

init();

async function init() {
  document.querySelectorAll('#nav button').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.api('/api/auth/logout/admin', { method: 'POST' });
      window.location.href = '/login/index.html';
    });
  }

  const shopForm = document.getElementById('shopForm');
  if (shopForm) shopForm.addEventListener('submit', submitShopForm);

  await refreshShops();
  switchView('overview');
}

function switchView(view) {
  ADMIN_STATE.view = view;
  document.querySelectorAll('#nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach((v) => {
    v.style.display = 'none';
  });
  const viewEl = document.getElementById('view-' + view);
  if (viewEl) viewEl.style.display = 'block';

  const titleEl = document.getElementById('viewTitle');
  if (titleEl) titleEl.textContent = VIEW_META[view].title;
  const subEl = document.getElementById('viewSub');
  if (subEl) subEl.textContent = VIEW_META[view].sub;

  renderHeaderActions();
  renderCurrentView();
}

function renderHeaderActions() {
  const box = document.getElementById('headerActions');
  if (!box) return;
  box.innerHTML = '';

  if (ADMIN_STATE.view === 'shops') {
    box.innerHTML = `<button class="btn-primary" id="newShopBtn">+ Add New Shop</button>`;
    document.getElementById('newShopBtn')?.addEventListener('click', () => window.openModal('shopModalOverlay'));
  }
}

function renderCurrentView() {
  if (ADMIN_STATE.view === 'overview') renderOverview();
  else if (ADMIN_STATE.view === 'shops') renderShopsTable();
  else if (ADMIN_STATE.view === 'licenses') renderLicenseGroups();
}

async function refreshShops() {
  try {
    ADMIN_STATE.shops = await window.api('/api/admin/shops');
  } catch (e) {
    window.toast(e.message, 'error');
  }
}
window.refreshShops = refreshShops;

async function renderOverview() {
  try {
    const s = await window.api('/api/admin/summary');
    const grid = document.getElementById('summaryGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="card stat-card">
        <div class="label">Total Shops</div>
        <div class="value">${s.totalShops}</div>
        <div class="sub">All-time onboarded clients</div>
      </div>
      <div class="card stat-card">
        <div class="label">Active Licenses</div>
        <div class="value">${s.activeShops}</div>
        <div class="sub">Currently unlocked</div>
      </div>
      <div class="card stat-card">
        <div class="label">Expiring Soon</div>
        <div class="value">${s.expiringSoon}</div>
        <div class="sub">Within 14 days</div>
      </div>
      <div class="card stat-card">
        <div class="label">Expired</div>
        <div class="value">${s.expired}</div>
        <div class="sub">Locked out right now</div>
      </div>
    `;
  } catch (e) {
    window.toast(e.message, 'error');
  }
}

function renderShopsTable() {
  const tbody = document.getElementById('shopsTbody');
  if (!tbody) return;

  if (!ADMIN_STATE.shops.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>No shops yet</h3><p>Add your first client to issue their license.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = ADMIN_STATE.shops.map((s) => `
    <tr>
      <td><strong>${window.escapeHtml(s.shop_name)}</strong><br/><span style="font-size:12px;color:var(--steel-400)">${window.escapeHtml(s.location || '')}</span></td>
      <td>${window.escapeHtml(s.owner_name)}</td>
      <td>${window.escapeHtml(s.email)}<br/><span style="font-size:12px;color:var(--steel-400)">${window.escapeHtml(s.phone)}</span></td>
      <td><span class="badge badge-${s.license_status}">${s.license_status}</span></td>
      <td>${s.license_expires_at ? new Date(s.license_expires_at).toLocaleDateString() : '—'}${s.days_remaining !== null ? `<br/><span style="font-size:12px;color:var(--steel-400)">${s.days_remaining >= 0 ? s.days_remaining + ' days left' : Math.abs(s.days_remaining) + ' days overdue'}</span>` : ''}</td>
      <td>${s.supabase_credits}</td>
      <td>
        <button class="btn-ghost" style="padding:6px 10px;font-size:12px" onclick="openRenew('${s.id}', '${window.escapeHtml(s.shop_name)}')">Renew</button>
        ${s.license_status !== 'revoked' ? `<button class="btn-danger" style="padding:6px 10px;font-size:12px" onclick="revokeShop('${s.id}')">Revoke</button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function submitShopForm(e) {
  e.preventDefault();
  const payload = {
    shop_name: document.getElementById('shop_name').value,
    owner_name: document.getElementById('owner_name').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    location: document.getElementById('location').value,
    password: document.getElementById('password').value,
    months: Number(document.getElementById('months').value),
    supabase_credits: Number(document.getElementById('supabase_credits').value) || 0,
    supabase_url: document.getElementById('supabase_url').value,
    supabase_anon_key: document.getElementById('supabase_anon_key').value,
    supabase_service_key: document.getElementById('supabase_service_key').value,
  };

  try {
    await window.api('/api/admin/shops', { method: 'POST', body: payload });
    window.toast('Shop created and license issued', 'success');
    window.closeModal('shopModalOverlay');
    document.getElementById('shopForm').reset();
    await refreshShops();
    renderCurrentView();
  } catch (err) {
    window.toast(err.message, 'error');
  }
}

async function revokeShop(id) {
  if (!confirm('Revoke this shop\'s license immediately? Their app will lock right away.')) return;
  try {
    await window.api(`/api/admin/shops/${id}/revoke`, { method: 'POST' });
    window.toast('License revoked', 'success');
    await refreshShops();
    renderCurrentView();
  } catch (e) {
    window.toast(e.message, 'error');
  }
}
window.revokeShop = revokeShop;

function openRenew(shopId, shopName) {
  document.getElementById('renewShopId').value = shopId;
  document.getElementById('renewModalTitle').textContent = `Renew License - ${shopName}`;
  window.openModal('renewModalOverlay');
}
window.openRenew = openRenew;

async function renewLicense(months) {
  const shopId = document.getElementById('renewShopId').value;
  try {
    await window.api(`/api/admin/shops/${shopId}/license/renew`, { method: 'POST', body: { months } });
    window.toast(`License renewed for ${months} month(s)`, 'success');
    window.closeModal('renewModalOverlay');
    await refreshShops();
    renderCurrentView();
  } catch (e) {
    window.toast(e.message, 'error');
  }
}
window.renewLicense = renewLicense;

async function renderLicenseGroups() {
  try {
    const data = await window.api('/api/admin/licenses/expiring');
    const box = document.getElementById('licenseGroups');
    if (!box) return;

    const groups = ['expired', 'expiring_soon', 'healthy'];
    const titles = {
      expired: '🔴 Expired',
      expiring_soon: '🟠 Expiring Within 14 Days',
      healthy: '🟢 Healthy'
    };

    let html = '';
    for (const group of groups) {
      const items = data[group];
      if (!items || !items.length) continue;
      html += `
        <h3 style="margin:22px 0 12px;font-size:15px;color:#e0e8e2;">${titles[group]} (${items.length})</h3>
        <div class="grid grid-3">
          ${items.map((s) => `
            <div class="card" style="padding:16px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <strong style="color:#fff;">${window.escapeHtml(s.shop_name)}</strong>
                  <div style="font-size:12.5px;color:var(--steel-400);margin-top:2px;">${window.escapeHtml(s.owner_name)}</div>
                </div>
                <span class="badge badge-${s.license_status}">${s.license_status}</span>
              </div>
              <div class="mono" style="font-size:11.5px;color:var(--steel-400);margin-top:10px;word-break:break-all;">${s.license_key || 'No key issued'}</div>
              <div style="font-size:13px;margin-top:8px;color:#ccc;">${s.days_remaining >= 0 ? s.days_remaining + ' days remaining' : Math.abs(s.days_remaining) + ' days overdue'}</div>
              <button class="btn-primary" style="width:100%;margin-top:12px;" onclick="openRenew('${s.id}', '${window.escapeHtml(s.shop_name)}')">Renew</button>
            </div>
          `).join('')}
        </div>`;
    }

    box.innerHTML = html || `<div class="empty-state"><h3>No licenses issued yet</h3></div>`;
  } catch (e) {
    window.toast(e.message, 'error');
  }
}