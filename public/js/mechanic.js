// ============================================================
// Mechanic Dashboard - Velo Shop
// ============================================================

let MECH_STATE = {
  jobs: [],
  tab: 'pending',
  attendance: null,
  mechanicInfo: null
};

let mechanicComplaints = [];

// ===== Init =====
init();

async function init() {
  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await window.api('/api/auth/logout/mechanic', { method: 'POST' });
    window.location.href = '/login/mechanic.html';
  });

  // Tabs
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      MECH_STATE.tab = btn.dataset.tab;
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
      renderJobs();
    });
  });

  // Attendance buttons
  document.getElementById('checkInBtn').addEventListener('click', () => mark('check_in'));
  document.getElementById('checkOutBtn').addEventListener('click', () => mark('check_out'));

  // New Job button
  document.getElementById('newJobBtn').addEventListener('click', openJobModal);

  // Job form submission
  document.getElementById('jobForm').addEventListener('submit', submitMechanicJobForm);

  // Add complaint button
  document.getElementById('addComplaintBtn').addEventListener('click', addMechComplaintFromInput);

  await Promise.all([loadMechanicInfo(), loadAttendance(), loadJobs()]);
}

async function loadMechanicInfo() {
  try {
    const info = await window.api('/api/mechanic/me');
    MECH_STATE.mechanicInfo = info;
    document.getElementById('mechNameDisplay').textContent = info.name;
    document.getElementById('mechCodeDisplay').textContent = info.mechanic_code;
    document.getElementById('mechAvatar').textContent = info.name.charAt(0).toUpperCase();
  } catch (e) {}
}

async function loadAttendance() {
  try {
    const att = await window.api('/api/mechanic/attendance/today');
    MECH_STATE.attendance = att;
    renderAttendance();
  } catch (e) {
    if (e.message !== 'License expired') window.toast(e.message, 'error');
  }
}

function renderAttendance() {
  const att = MECH_STATE.attendance;
  const statusEl = document.getElementById('attStatusText');
  const statusDot = document.getElementById('attStatusDot');

  if (!att) {
    statusEl.textContent = 'Not checked in yet';
    statusDot.className = 'status-dot unknown';
  } else if (att.check_in && !att.check_out) {
    statusEl.textContent = `Checked in at ${att.check_in}`;
    statusDot.className = 'status-dot present';
  } else if (att.check_in && att.check_out) {
    statusEl.textContent = `Worked ${att.check_in} - ${att.check_out}`;
    statusDot.className = 'status-dot present';
  } else {
    statusEl.textContent = 'Marked present';
    statusDot.className = 'status-dot present';
  }
}

async function mark(action) {
  try {
    const att = await window.api('/api/mechanic/attendance/mark', { method: 'POST', body: { action } });
    MECH_STATE.attendance = att;
    renderAttendance();
    window.toast(action === 'check_in' ? '✅ Checked in' : '✅ Checked out', 'success');
  } catch (e) {
    window.toast(e.message, 'error');
  }
}

async function loadJobs() {
  try {
    MECH_STATE.jobs = await window.api('/api/mechanic/jobs');
    renderJobs();
  } catch (e) {
    if (e.message !== 'License expired') window.toast(e.message, 'error');
  }
}

function renderJobs() {
  const list = document.getElementById('jobList');
  if (!list) return;

  const filtered = MECH_STATE.jobs.filter((j) =>
    MECH_STATE.tab === 'pending' ? j.status === 'pending' : ['in_progress', 'on_hold'].includes(j.status)
  );

  const pendingCount = MECH_STATE.jobs.filter(j => j.status === 'pending').length;
  const ongoingCount = MECH_STATE.jobs.filter(j => ['in_progress', 'on_hold'].includes(j.status)).length;
  document.getElementById('pendingCount').textContent = pendingCount;
  document.getElementById('ongoingCount').textContent = ongoingCount;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <h3>${MECH_STATE.tab === 'pending' ? 'No Pending Jobs' : 'No Ongoing Jobs'}</h3>
        <p>${MECH_STATE.tab === 'pending' ? 'All caught up!' : 'You don\'t have any jobs in progress.'}</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((j) => `
    <div class="job-card">
      <div class="job-header">
        <div>
          <div class="job-order">${j.order_number}</div>
          <div class="job-customer">${window.escapeHtml(j.customer_name)}</div>
        </div>
        <span class="badge badge-${j.status}">${window.statusLabel(j.status)}</span>
      </div>
      <div class="job-details">
        <span>🚲 ${window.escapeHtml(j.bike_model)}</span>
        <span>🔢 ${window.escapeHtml(j.bike_number)}</span>
        ${j.amount ? `<span>💰 ₹${j.amount}</span>` : ''}
      </div>
      ${j.complaints && j.complaints.length ? `
        <div class="job-checklist">
          <div class="checklist-label">📝 Checklist</div>
          ${j.complaints.map((c, i) => `
            <label class="checklist-item ${c.done ? 'done' : ''}">
              <input type="checkbox" ${c.done ? 'checked' : ''} onchange="window.toggleItem('${j.id}', ${i}, this.checked)" />
              <span>${window.escapeHtml(c.text)}</span>
            </label>
          `).join('')}
        </div>
      ` : ''}
      <div class="job-actions">
        ${j.status === 'pending' ? `<button class="btn-primary" onclick="window.setStatus('${j.id}', 'in_progress')">▶ Start Work</button>` : ''}
        ${j.status === 'in_progress' ? `
          <button class="btn-success" onclick="window.showCompleteModal('${j.id}')">✅ Complete Job</button>
          <button class="btn-ghost" onclick="window.setStatus('${j.id}', 'on_hold')">⏸ Hold</button>
        ` : ''}
        ${j.status === 'on_hold' ? `<button class="btn-primary" onclick="window.setStatus('${j.id}', 'in_progress')">▶ Resume Work</button>` : ''}
      </div>
    </div>
  `).join('');
}

window.showCompleteModal = function(jobId) {
  const job = MECH_STATE.jobs.find(j => String(j.id) === String(jobId));
  if (!job) return;
  document.getElementById('completeJobId').value = jobId;
  document.getElementById('completeAmount').value = job.amount || 0;
  document.getElementById('completeCustomer').textContent = job.customer_name;
  document.getElementById('completeBike').textContent = `${job.bike_model} (${job.bike_number})`;
  document.getElementById('completeOrder').textContent = job.order_number;
  window.openModal('completeModalOverlay');
};

window.submitCompleteJob = async function() {
  const jobId = document.getElementById('completeJobId').value;
  const amount = Number(document.getElementById('completeAmount').value) || 0;
  try {
    await window.api(`/api/mechanic/jobs/${jobId}`, { method: 'PATCH', body: { status: 'completed', amount } });
    window.toast('✅ Job completed & WhatsApp sent!', 'success');
    window.closeModal('completeModalOverlay');
    await loadJobs();
  } catch (e) {
    window.toast(e.message, 'error');
  }
};

window.toggleItem = async function(jobId, index, checked) {
  const job = MECH_STATE.jobs.find((j) => String(j.id) === String(jobId));
  if (!job) return;
  job.complaints[index].done = checked;
  try {
    await window.api(`/api/mechanic/jobs/${jobId}`, { method: 'PATCH', body: { complaints: job.complaints } });
  } catch (e) {
    window.toast(e.message, 'error');
  }
};

window.setStatus = async function(jobId, status) {
  try {
    await window.api(`/api/mechanic/jobs/${jobId}`, { method: 'PATCH', body: { status } });
    window.toast('✅ Job updated', 'success');
    await loadJobs();
  } catch (e) {
    window.toast(e.message, 'error');
  }
};

// ============================================================
// Add Job functionality
// ============================================================

function openJobModal() {
  document.getElementById('jobModalTitle').textContent = 'New Job';
  document.getElementById('jobId').value = '';
  document.getElementById('customer_name').value = '';
  document.getElementById('phone_number').value = '';
  document.getElementById('bike_model').value = '';
  document.getElementById('bike_number').value = '';
  document.getElementById('amount').value = 0;

  mechanicComplaints = [];
  renderMechanicComplaintList();

  const mechName = MECH_STATE.mechanicInfo?.name || 'You';
  document.getElementById('mechanic_name_display').value = mechName + ' (you)';

  window.openModal('jobModalOverlay');
}

function renderMechanicComplaintList() {
  const box = document.getElementById('complaintList');
  if (!box) return;
  if (!mechanicComplaints.length) {
    box.innerHTML = `<p style="color:var(--steel-400);font-size:13px;margin:4px 0">No items yet - add the customer's complaints as checklist items.</p>`;
    return;
  }
  box.innerHTML = mechanicComplaints.map((c, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">
      <input type="checkbox" ${c.done ? 'checked' : ''} onchange="toggleMechComplaint(${i})" />
      <span style="flex:1;font-size:13.5px;${c.done ? 'text-decoration:line-through;color:var(--steel-400)' : ''}">${window.escapeHtml(c.text)}</span>
      <button type="button" class="btn-ghost" style="padding:3px 8px;font-size:11px" onclick="removeMechComplaint(${i})">Remove</button>
    </div>
  `).join('');
}

function addMechComplaintFromInput() {
  const input = document.getElementById('newComplaintText');
  if (!input || !input.value.trim()) return;
  mechanicComplaints.push({ text: input.value.trim(), done: false });
  input.value = '';
  renderMechanicComplaintList();
}

function toggleMechComplaint(i) {
  mechanicComplaints[i].done = !mechanicComplaints[i].done;
  renderMechanicComplaintList();
}

function removeMechComplaint(i) {
  mechanicComplaints.splice(i, 1);
  renderMechanicComplaintList();
}

async function submitMechanicJobForm(e) {
  e.preventDefault();
  const payload = {
    customer_name: document.getElementById('customer_name').value,
    phone_number: document.getElementById('phone_number').value,
    bike_model: document.getElementById('bike_model').value,
    bike_number: document.getElementById('bike_number').value,
    complaints: mechanicComplaints,
    amount: Number(document.getElementById('amount').value) || 0,
  };

  try {
    await window.api('/api/mechanic/jobs', { method: 'POST', body: payload });
    window.toast('✅ Job created successfully!', 'success');
    window.closeModal('jobModalOverlay');
    await loadJobs();
  } catch (err) {
    window.toast(err.message, 'error');
  }
}

window.openJobModal = openJobModal;
window.submitMechanicJobForm = submitMechanicJobForm;
window.addMechComplaintFromInput = addMechComplaintFromInput;
window.toggleMechComplaint = toggleMechComplaint;
window.removeMechComplaint = removeMechComplaint;
