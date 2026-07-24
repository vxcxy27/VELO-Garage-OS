// ============================================================
// Shop Dashboard - Velo Shop (MSG91 WhatsApp + SMS)
// ============================================================

let STATE = {
  jobs: [],
  mechanics: [],
  view: 'dashboard',
  attendanceDate: new Date().toISOString().slice(0, 10),
  shop: null
};

const VIEW_META = {
  dashboard: { title: 'Dashboard', sub: 'Quick overview of your shop\'s performance.' },
  jobs: { title: 'All Jobs', sub: 'Every work order ever created at your shop.' },
  mechanics: { title: 'Mechanics', sub: 'Your team roster and contact details.' },
  attendance: { title: 'Attendance', sub: 'Daily presence log for your mechanics.' },
  workload: { title: 'Workload Balance', sub: 'Live load score per mechanic.' },
  sales: { title: 'Sales', sub: 'Revenue from completed & delivered jobs.' },
  performance: { title: 'Employee Performance', sub: 'Jobs handled and revenue generated per mechanic.' },
  settings: { title: 'Shop Settings', sub: 'Update your shop details and information.' },
};

let currentComplaints = [];
let salesChartInstance = null;

// ===== Init =====
init();

async function init() {
  document.querySelectorAll('#nav button').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.api('/api/auth/logout/owner', { method: 'POST' });
      window.location.href = '/login/index.html';
    });
  }

  const jobForm = document.getElementById('jobForm');
  if (jobForm) jobForm.addEventListener('submit', submitJobForm);

  const mechForm = document.getElementById('mechForm');
  if (mechForm) mechForm.addEventListener('submit', submitMechForm);

  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) settingsForm.addEventListener('submit', submitSettingsForm);

  const addBtn = document.getElementById('addComplaintBtn');
  if (addBtn) addBtn.addEventListener('click', addComplaintFromInput);

  const mechSelect = document.getElementById('mechanic_id');
  if (mechSelect) mechSelect.addEventListener('change', checkWorkloadWarning);

  await loadMe();
  await refreshAll();
  switchView('dashboard');
}

async function loadMe() {
  try {
    const shop = await window.api('/api/shop/me');
    STATE.shop = shop;
    const foot = document.getElementById('shopFoot');
    if (foot) {
      foot.innerHTML = `<strong style="color:white">${window.escapeHtml(shop.shop_name)}</strong><br/>${window.escapeHtml(shop.owner_name)}`;
    }
    persistSettingsToForm(shop);
  } catch (e) {}
}

function persistSettingsToForm(shop) {
  if (!shop) return;
  const map = {
    settings_shop_name: 'shop_name',
    settings_owner_name: 'owner_name',
    settings_phone: 'phone',
    settings_location: 'location',
    settings_msg91_auth_key: 'msg91_auth_key',
    settings_msg91_whatsapp_number: 'msg91_whatsapp_number',
    settings_msg91_whatsapp_template: 'msg91_whatsapp_template',
    settings_msg91_whatsapp_namespace: 'msg91_whatsapp_namespace',
  };
  for (const [id, key] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el && shop[key] !== undefined) {
      el.value = shop[key] || '';
    }
  }
}

async function refreshAll() {
  try {
    const [jobs, mechanics] = await Promise.all([
      window.api('/api/shop/jobs'),
      window.api('/api/shop/mechanics')
    ]);
    STATE.jobs = jobs || [];
    STATE.mechanics = mechanics || [];
    renderCurrentView();
  } catch (e) {
    if (e.message !== 'License expired') window.toast(e.message, 'error');
  }
}
window.refreshAll = refreshAll;

function switchView(view) {
  STATE.view = view;
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

  if (STATE.view === 'jobs') {
    box.innerHTML = `<button class="btn-primary" id="newJobBtn">+ New Job</button>`;
    document.getElementById('newJobBtn')?.addEventListener('click', () => openJobModal());
  } else if (STATE.view === 'mechanics') {
    box.innerHTML = `<button class="btn-primary" id="newMechBtn">+ Add Mechanic</button>`;
    document.getElementById('newMechBtn')?.addEventListener('click', () => window.openModal('mechModalOverlay'));
  } else if (STATE.view === 'attendance') {
    let filterHtml = `<select id="attendanceMechanicFilter" style="width:auto;min-width:150px;color:#fff;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:8px 12px;">
      <option value="">All Mechanics</option>`;
    STATE.mechanics.forEach(m => {
      filterHtml += `<option value="${m.id}">${window.escapeHtml(m.name)}</option>`;
    });
    filterHtml += `</select>`;
    filterHtml += `<input type="date" id="attDate" value="${STATE.attendanceDate}" style="width:auto;color:#fff;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:8px 12px;" />`;
    box.innerHTML = filterHtml;
    document.getElementById('attDate')?.addEventListener('change', (e) => {
      STATE.attendanceDate = e.target.value;
      renderAttendance();
    });
    document.getElementById('attendanceMechanicFilter')?.addEventListener('change', renderAttendance);
  } else if (STATE.view === 'sales') {
    box.innerHTML = `<a class="btn-primary" style="text-decoration:none;display:inline-block" href="/api/shop/sales/export">⬇ Export Completed Jobs Excel</a>`;
  }
}

function renderCurrentView() {
  const v = STATE.view;
  if (v === 'dashboard') renderDashboard();
  else if (v === 'jobs') renderJobsTable();
  else if (v === 'mechanics') renderMechanics();
  else if (v === 'attendance') renderAttendance();
  else if (v === 'workload') renderWorkload();
  else if (v === 'sales') renderSales();
  else if (v === 'performance') renderPerformance();
  else if (v === 'settings') renderSettings();
}

async function renderDashboard() {
  try {
    const data = await window.api('/api/shop/dashboard');
    const box = document.getElementById('dashboardContent');
    if (!box) return;
    box.innerHTML = `
      <div class="card stat-card">
        <div class="label">Total Jobs</div>
        <div class="value">${data.jobs.total}</div>
        <div class="sub">All work orders</div>
      </div>
      <div class="card stat-card">
        <div class="label">Completed</div>
        <div class="value">${data.jobs.completed}</div>
        <div class="sub">Jobs finished</div>
      </div>
      <div class="card stat-card">
        <div class="label">Revenue</div>
        <div class="value">₹${data.revenue.total}</div>
        <div class="sub">Total earned</div>
      </div>
      <div class="card stat-card">
        <div class="label">Active Mechanics</div>
        <div class="value">${data.mechanics.active}</div>
        <div class="sub">Your team</div>
      </div>
    `;
  } catch (e) {
    if (e.message !== 'License expired') window.toast(e.message, 'error');
  }
}

function renderJobsTable() {
  const tbody = document.getElementById('jobsTbody');
  if (!tbody) return;

  if (!STATE.jobs.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>No jobs yet</h3><p>Click "+ New Job" to create your first work order.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = STATE.jobs.map((j) => {
    const mechName = j.mechanics?.name || 'Unassigned';
    return `
    <tr>
      <td class="mono">${j.order_number}</td>
      <td>${window.escapeHtml(j.customer_name)}<br/><span style="color:var(--steel-400);font-size:12px">${window.escapeHtml(j.phone_number)}</span></td>
      <td>${window.escapeHtml(j.bike_model)}<br/><span style="color:var(--steel-400);font-size:12px">${window.escapeHtml(j.bike_number)}</span></td>
      <td>${mechName}</td>
      <td><span class="badge badge-${j.status}">${window.statusLabel(j.status)}</span></td>
      <td>₹${j.amount || 0}</td>
      <td>
        <button class="btn-ghost" style="padding:6px 10px;font-size:12px" onclick="openJobModal('${j.id}')">Edit</button>
        <button class="btn-danger" style="padding:6px 10px;font-size:12px" onclick="deleteJob('${j.id}')">Delete</button>
      </td>
    </tr>
  `}).join('');
}

async function deleteJob(id) {
  if (!confirm('Delete this job permanently?')) return;
  try {
    await window.api(`/api/shop/jobs/${id}`, { method: 'DELETE' });
    window.toast('Job deleted', 'success');
    await refreshAll();
  } catch (e) {
    window.toast(e.message, 'error');
  }
}
window.deleteJob = deleteJob;

function openJobModal(jobId) {
  const job = jobId ? STATE.jobs.find((j) => String(j.id) === String(jobId)) : null;
  const titleEl = document.getElementById('jobModalTitle');
  if (titleEl) titleEl.textContent = job ? `Edit ${job.order_number}` : 'New Job';

  document.getElementById('jobId').value = job ? job.id : '';
  document.getElementById('customer_name').value = job ? job.customer_name : '';
  document.getElementById('phone_number').value = job ? job.phone_number : '';
  document.getElementById('bike_model').value = job ? job.bike_model : '';
  document.getElementById('bike_number').value = job ? job.bike_number : '';
  document.getElementById('amount').value = job ? job.amount : 0;

  currentComplaints = job ? [...(job.complaints || [])] : [];
  renderComplaintList();

  const mechSelect = document.getElementById('mechanic_id');
  if (mechSelect) {
    mechSelect.innerHTML = '<option value="">Unassigned</option>' +
      STATE.mechanics.filter(m => m.active).map(m =>
        `<option value="${m.id}">${window.escapeHtml(m.name)} (${m.mechanic_code})</option>`
      ).join('');
    mechSelect.value = job && job.mechanic_id ? job.mechanic_id : '';
  }

  const statusWrap = document.getElementById('statusFieldWrap');
  if (statusWrap) statusWrap.style.display = job ? 'block' : 'none';
  if (job) document.getElementById('status').value = job.status;

  window.openModal('jobModalOverlay');
}
window.openJobModal = openJobModal;

function addComplaintFromInput() {
  const input = document.getElementById('newComplaintText');
  if (!input || !input.value.trim()) return;
  currentComplaints.push({ text: input.value.trim(), done: false });
  input.value = '';
  renderComplaintList();
}

function renderComplaintList() {
  const box = document.getElementById('complaintList');
  if (!box) return;

  if (!currentComplaints.length) {
    box.innerHTML = `<p style="color:var(--steel-400);font-size:13px;margin:4px 0">No items yet - add the customer's complaints as checklist items.</p>`;
    return;
  }
  box.innerHTML = currentComplaints.map((c, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">
      <input type="checkbox" ${c.done ? 'checked' : ''} onchange="toggleComplaint(${i})" />
      <span style="flex:1;font-size:13.5px;${c.done ? 'text-decoration:line-through;color:var(--steel-400)' : ''}">${window.escapeHtml(c.text)}</span>
      <button type="button" class="btn-ghost" style="padding:3px 8px;font-size:11px" onclick="removeComplaint(${i})">Remove</button>
    </div>
  `).join('');
}

function toggleComplaint(i) {
  currentComplaints[i].done = !currentComplaints[i].done;
  renderComplaintList();
}
window.toggleComplaint = toggleComplaint;

function removeComplaint(i) {
  currentComplaints.splice(i, 1);
  renderComplaintList();
}
window.removeComplaint = removeComplaint;

async function checkWorkloadWarning() {
  const mechId = document.getElementById('mechanic_id')?.value;
  if (!mechId) return;
  try {
    const report = await window.api(`/api/shop/mechanics/${mechId}/workload`);
    if (report.overloaded) {
      window.toast(`Heads up: this mechanic already has a high workload (score ${report.score}). Consider another mechanic.`, 'error');
    }
  } catch (e) {}
}

async function submitJobForm(e) {
  e.preventDefault();
  const jobId = document.getElementById('jobId').value;
  const mechanicIdValue = document.getElementById('mechanic_id').value;

  const payload = {
    customer_name: document.getElementById('customer_name').value,
    phone_number: document.getElementById('phone_number').value,
    bike_model: document.getElementById('bike_model').value,
    bike_number: document.getElementById('bike_number').value,
    complaints: currentComplaints,
    mechanic_id: mechanicIdValue ? mechanicIdValue : null,
    amount: Number(document.getElementById('amount').value) || 0,
  };
  if (jobId) payload.status = document.getElementById('status').value;

  try {
    if (jobId) {
      await window.api(`/api/shop/jobs/${jobId}`, { method: 'PATCH', body: payload });
    } else {
      await window.api('/api/shop/jobs', { method: 'POST', body: payload });
    }
    window.toast('Job saved', 'success');
    window.closeModal('jobModalOverlay');
    await refreshAll();
  } catch (err) {
    window.toast(err.message, 'error');
  }
}

function renderMechanics() {
  const grid = document.getElementById('mechanicsGrid');
  if (!grid) return;

  if (!STATE.mechanics.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>No mechanics yet</h3><p>Add your first mechanic to start assigning jobs.</p></div>`;
    return;
  }

  grid.innerHTML = STATE.mechanics.map((m) => `
    <div class="card" style="padding:18px;color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h3 style="font-size:16px;color:#fff;">${window.escapeHtml(m.name)}</h3>
          <div class="mono" style="font-size:12px;color:var(--steel-400);margin-top:2px">${m.mechanic_code}</div>
        </div>
        <span class="badge ${m.active ? 'badge-active' : 'badge-inactive'}">${m.active ? 'Active' : 'Inactive'}</span>
      </div>
      <div style="margin-top:12px;font-size:13.5px;color:#ccc;line-height:1.9">
        📞 ${window.escapeHtml(m.phone)}<br/>
        ⭐ ${m.years_experience} yrs experience
        ${m.specialization ? `<br/>🔧 ${window.escapeHtml(m.specialization)}` : ''}
        ${m.emergency_contact ? `<br/>🆘 ${window.escapeHtml(m.emergency_contact)}` : ''}
        ${m.address ? `<br/>📍 ${window.escapeHtml(m.address)}` : ''}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        <button class="btn-ghost" style="flex:1;color:#fff;border-color:#555;" onclick="openMechModal('${m.id}')">Edit</button>
        <button class="btn-ghost" style="flex:1;color:#fff;border-color:#555;" onclick="toggleMechActive('${m.id}', ${m.active ? 0 : 1})">${m.active ? 'Deactivate' : 'Activate'}</button>
      </div>
    </div>
  `).join('');
}

function openMechModal(mechId) {
  const mech = mechId ? STATE.mechanics.find((m) => String(m.id) === String(mechId)) : null;
  document.getElementById('mechModalTitle').textContent = mech ? `Edit ${mech.name}` : 'Add Mechanic';
  document.getElementById('mechId').value = mech ? mech.id : '';
  document.getElementById('mech_name').value = mech ? mech.name : '';
  document.getElementById('mech_phone').value = mech ? mech.phone : '';
  document.getElementById('mech_years').value = mech ? mech.years_experience : 0;
  document.getElementById('mech_specialization').value = mech ? mech.specialization || '' : '';
  document.getElementById('mech_emergency_contact').value = mech ? mech.emergency_contact || '' : '';
  document.getElementById('mech_address').value = mech ? mech.address || '' : '';
  document.getElementById('mech_email').value = mech ? mech.email || '' : '';
  window.openModal('mechModalOverlay');
}
window.openMechModal = openMechModal;

async function toggleMechActive(id, active) {
  try {
    await window.api(`/api/shop/mechanics/${id}`, { method: 'PATCH', body: { active } });
    window.toast('Updated', 'success');
    await refreshAll();
  } catch (e) {
    window.toast(e.message, 'error');
  }
}
window.toggleMechActive = toggleMechActive;

async function submitMechForm(e) {
  e.preventDefault();
  const mechId = document.getElementById('mechId').value;
  const payload = {
    name: document.getElementById('mech_name').value,
    phone: document.getElementById('mech_phone').value,
    years_experience: Number(document.getElementById('mech_years').value) || 0,
    specialization: document.getElementById('mech_specialization').value || '',
    emergency_contact: document.getElementById('mech_emergency_contact').value || '',
    address: document.getElementById('mech_address').value || '',
    email: document.getElementById('mech_email').value || '',
  };

  try {
    if (mechId) {
      await window.api(`/api/shop/mechanics/${mechId}`, { method: 'PATCH', body: payload });
    } else {
      await window.api('/api/shop/mechanics', { method: 'POST', body: payload });
    }
    window.toast('Mechanic saved', 'success');
    window.closeModal('mechModalOverlay');
    document.getElementById('mechForm').reset();
    await refreshAll();
  } catch (err) {
    window.toast(err.message, 'error');
  }
}

async function renderAttendance() {
  try {
    const filter = document.getElementById('attendanceMechanicFilter');
    const mechanicId = filter ? filter.value : '';
    const url = `/api/shop/attendance?date=${STATE.attendanceDate}${mechanicId ? '&mechanic_id=' + mechanicId : ''}`;
    const rows = await window.api(url);

    const tbody = document.getElementById('attendanceTbody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>No attendance records</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td style="color:#fff;">${window.escapeHtml(r.name)}</td>
        <td class="mono" style="color:#aaa;">${r.mechanic_code}</td>
        <td>
          <select onchange="setAttendance('${r.id}', this.value)" style="width:auto;color:#fff;background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:4px 8px;">
            ${['present', 'absent', 'half_day', 'leave'].map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s.replace('_', ' ').toUpperCase()}</option>`).join('')}
          </select>
        </td>
        <td style="color:#ccc;">${r.check_in || '—'}</td>
        <td style="color:#ccc;">${r.check_out || '—'}</td>
        <td>
          <button class="btn-ghost" style="padding:4px 10px;font-size:11px;color:#fff;border-color:#555;" onclick="showMechanicAttendance('${r.mechanic_id}')">View History</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    if (e.message !== 'License expired') window.toast(e.message, 'error');
  }
}

async function setAttendance(mechanicId, status) {
  try {
    await window.api('/api/shop/attendance', { method: 'POST', body: { mechanic_id: mechanicId, date: STATE.attendanceDate, status } });
    window.toast('Attendance updated', 'success');
  } catch (e) {
    window.toast(e.message, 'error');
  }
}
window.setAttendance = setAttendance;

async function showMechanicAttendance(mechanicId) {
  try {
    const rows = await window.api(`/api/shop/attendance/history/${mechanicId}`);
    const body = document.getElementById('attendanceHistoryBody');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">No attendance history found.</p>';
    } else {
      let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:10px 0;">';
      rows.forEach(r => {
        const statusColor = r.status === 'present' ? '#4CAF50' : r.status === 'absent' ? '#f44336' : r.status === 'half_day' ? '#FF9800' : '#9E9E9E';
        html += `<div style="background:#1a1a1a;padding:12px;border-radius:8px;border:1px solid #333;text-align:center;">
          <div style="font-size:14px;color:#fff;">${r.date}</div>
          <div style="font-size:12px;color:${statusColor};margin-top:4px;font-weight:600;">${r.status.toUpperCase()}</div>
          ${r.check_in ? `<div style="font-size:11px;color:#aaa;">IN: ${r.check_in}</div>` : ''}
          ${r.check_out ? `<div style="font-size:11px;color:#aaa;">OUT: ${r.check_out}</div>` : ''}
        </div>`;
      });
      html += '</div>';
      body.innerHTML = html;
    }
    window.openModal('attendanceHistoryModal');
  } catch (e) {
    window.toast(e.message, 'error');
  }
}
window.showMechanicAttendance = showMechanicAttendance;

async function renderWorkload() {
  try {
    const report = await window.api('/api/shop/workload-report');
    const grid = document.getElementById('workloadGrid');
    if (!grid) return;

    if (!report.mechanics.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>No active mechanics</h3></div>`;
      return;
    }

    grid.innerHTML = report.mechanics.map((m) => `
      <div class="card" style="padding:18px;color:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="font-size:15px;color:#fff;">${window.escapeHtml(m.name)}</h3>
          ${m.overloaded ? '<span class="badge badge-on_hold">Overloaded</span>' : '<span class="badge badge-active">Healthy</span>'}
        </div>
        <div style="font-family:var(--font-display);font-size:28px;margin-top:10px;color:#fff;">${m.score}<span style="font-size:13px;color:var(--steel-400);font-family:var(--font-body)"> / ${report.threshold} threshold</span></div>
        <div style="margin-top:10px;height:8px;background:#333;border-radius:100px;overflow:hidden">
          <div style="height:100%;width:${Math.min(100, (m.score / report.threshold) * 100)}%;background:${m.overloaded ? 'var(--red-500)' : 'var(--green-500)'}"></div>
        </div>
        <div style="margin-top:12px;font-size:12.5px;color:#aaa;">
          ${m.counts.in_progress || 0} in progress · ${m.counts.pending || 0} pending · ${m.counts.on_hold || 0} on hold
        </div>
      </div>
    `).join('');
  } catch (e) {
    if (e.message !== 'License expired') window.toast(e.message, 'error');
  }
}

// ---- Sales Chart (Self-contained) ----
async function renderSales() {
  try {
    const rows = await window.api('/api/shop/sales/monthly');
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!rows || rows.length === 0) {
      parent.innerHTML = `<div class="empty-state"><h3>No sales data yet</h3><p>Complete jobs to see revenue here.</p></div>`;
      return;
    }

    canvas.style.display = 'block';
    canvas.width = canvas.clientWidth || 600;
    canvas.height = canvas.clientHeight || 300;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const labels = rows.map(r => r.month);
    const values = rows.map(r => r.total || 0);
    const maxVal = Math.max(...values, 1);

    const pad = { top: 20, bottom: 30, left: 40, right: 20 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const barWidth = Math.min(chartW / values.length * 0.6, 40);
    const gap = (chartW - barWidth * values.length) / (values.length + 1);

    ctx.strokeStyle = '#8a9a91';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.lineTo(pad.left + chartW, pad.top + chartH);
    ctx.stroke();

    ctx.shadowColor = 'rgba(49, 233, 129, 0.3)';
    ctx.shadowBlur = 8;
    for (let i = 0; i < values.length; i++) {
      const x = pad.left + gap + i * (barWidth + gap);
      const barH = (values[i] / maxVal) * chartH;
      const y = pad.top + chartH - barH;

      const gradient = ctx.createLinearGradient(0, y, 0, pad.top + chartH);
      gradient.addColorStop(0, '#31e981');
      gradient.addColorStop(1, '#1aad5a');
      ctx.fillStyle = gradient;
      ctx.shadowBlur = 8;

      const radius = 4;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, pad.top + chartH);
      ctx.lineTo(x, pad.top + chartH);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#f4f8f5';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('₹' + values[i], x + barWidth/2, y - 4);

      ctx.fillStyle = '#8a9a91';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(labels[i], x + barWidth/2, pad.top + chartH + 6);
    }

    ctx.fillStyle = '#8a9a91';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('₹' + maxVal, pad.left - 6, pad.top);
    ctx.fillText('0', pad.left - 6, pad.top + chartH);
  } catch (e) {
    console.error('Sales chart error:', e);
    const canvas = document.getElementById('salesChart');
    if (canvas && canvas.parentElement) {
      canvas.parentElement.innerHTML = `<div class="empty-state"><h3>Chart unavailable</h3><p>${e.message || 'Please try again later.'}</p></div>`;
    }
  }
}

async function renderPerformance() {
  try {
    const rows = await window.api('/api/shop/performance');
    const tbody = document.getElementById('perfTbody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>No data yet</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td style="color:#fff;">${window.escapeHtml(r.name)}</td>
        <td class="mono" style="color:#aaa;">${r.mechanic_code}</td>
        <td style="color:#fff;">${r.total_jobs || 0}</td>
        <td style="color:#fff;">${r.completed_jobs || 0}</td>
        <td style="color:#fff;">₹${r.revenue_generated || 0}</td>
      </tr>
    `).join('');
  } catch (e) {
    if (e.message !== 'License expired') window.toast(e.message, 'error');
  }
}

function renderSettings() {
  if (!STATE.shop) {
    loadMe();
  }
}

// ---- Submit Settings (with MSG91 fields) ----
async function submitSettingsForm(e) {
  e.preventDefault();
  const payload = {
    shop_name: document.getElementById('settings_shop_name').value,
    owner_name: document.getElementById('settings_owner_name').value,
    phone: document.getElementById('settings_phone').value,
    location: document.getElementById('settings_location').value,
    msg91_auth_key: document.getElementById('settings_msg91_auth_key').value,
    msg91_whatsapp_number: document.getElementById('settings_msg91_whatsapp_number').value,
    msg91_whatsapp_template: document.getElementById('settings_msg91_whatsapp_template').value,
    msg91_whatsapp_namespace: document.getElementById('settings_msg91_whatsapp_namespace').value,
  };

  try {
    await window.api('/api/shop/settings', { method: 'PATCH', body: payload });
    window.toast('Settings saved successfully', 'success');
    await loadMe();
    await refreshAll();
  } catch (err) {
    window.toast(err.message, 'error');
  }
}

// ============================================================
// Globally Expose Functions
// ============================================================
window.deleteJob = deleteJob;
window.openJobModal = openJobModal;
window.openMechModal = openMechModal;
window.toggleMechActive = toggleMechActive;
window.setAttendance = setAttendance;
window.showMechanicAttendance = showMechanicAttendance;
window.toggleComplaint = toggleComplaint;
window.removeComplaint = removeComplaint;
window.refreshAll = refreshAll;