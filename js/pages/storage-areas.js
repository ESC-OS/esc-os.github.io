import { requireAuth } from '../auth.js';
import {
  getStorageAreas,
  getProjects,
  createStorageArea,
  updateStorageArea,
  submitStorageArea,
  getNotifications,
} from '../api.js';
import { h, statusBadge, formatDate, renderNavbar, showError, openModal } from '../ui.js';

const STATUS_OPTS = [
  ['',          'ทุกสถานะ'],
  ['draft',     'ร่าง'],
  ['pending',   'รอดำเนินการ'],
  ['approved',  'อนุมัติแล้ว'],
  ['in_use',    'กำลังใช้งาน'],
  ['completed', 'เสร็จสิ้น'],
  ['rejected',  'ถูกปฏิเสธ'],
];

function renderList(areas) {
  if (areas.length === 0) {
    return '<p class="empty-text">ไม่มีคำขอพื้นที่จัดเก็บ</p>';
  }
  return `<div class="svc-list">
    ${areas.map(a => `
    <a href="storage-area-detail.html?id=${h(a.id)}" class="svc-row">
      <span class="svc-row-id">#${h(a.id)}</span>
      <span class="svc-row-name">${h(a.project_name || a.project_id || '-')}</span>
      <span class="svc-row-meta">${formatDate(a.start_date)} – ${formatDate(a.end_date)}</span>
      ${statusBadge(a.status)}
      <span class="svc-row-arrow">›</span>
    </a>`).join('')}
  </div>`;
}

function calcDays(start, end) {
  if (!start || !end) return null;
  const diff = (new Date(end) - new Date(start)) / 864e5;
  return Math.round(diff);
}

async function openRequestModal(preProjectId, projects, onSuccess) {
  const projectOptions = projects.map(p =>
    `<option value="${h(p.id)}" ${p.id === preProjectId ? 'selected' : ''}>${h(p.name)}</option>`
  ).join('');

  const bodyHtml = `
    <div id="modal-error"></div>
    <div class="form">
      <div class="form-group">
        <label class="form-label" for="m-project">โครงการ <span class="form-required">*</span></label>
        <select class="form-select" id="m-project">
          <option value="">-- เลือกโครงการ --</option>
          ${projectOptions}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="m-start">วันเริ่มใช้งาน <span class="form-required">*</span></label>
          <input type="date" class="form-input" id="m-start">
        </div>
        <div class="form-group">
          <label class="form-label" for="m-end">วันสิ้นสุด <span class="form-required">*</span></label>
          <input type="date" class="form-input" id="m-end">
        </div>
      </div>
      <div class="form-group">
        <div class="form-hint" id="m-duration-note" style="color:var(--text-muted);min-height:1.2em"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="m-submit-btn">ส่งคำขอ</button>
        <button class="btn btn-secondary" id="m-cancel-btn">ยกเลิก</button>
      </div>
    </div>`;

  const close = openModal('ขอพื้นที่จัดเก็บ', bodyHtml);

  function updateDurationNote() {
    const start = document.getElementById('m-start').value;
    const end   = document.getElementById('m-end').value;
    const note  = document.getElementById('m-duration-note');
    if (!start || !end) { note.textContent = ''; return; }
    const days = calcDays(start, end);
    if (days <= 0) {
      note.textContent = 'วันสิ้นสุดต้องหลังวันเริ่มต้น';
      note.style.color = 'var(--danger)';
    } else if (days > 30) {
      note.textContent = `${days} วัน — เกินขีดสูงสุด 30 วัน`;
      note.style.color = 'var(--danger)';
    } else {
      note.textContent = `${days} วัน (สูงสุด 30 วัน)`;
      note.style.color = 'var(--text-muted)';
    }
  }

  document.getElementById('m-start').addEventListener('input', updateDurationNote);
  document.getElementById('m-end').addEventListener('input', updateDurationNote);
  document.getElementById('m-cancel-btn').addEventListener('click', close);

  document.getElementById('m-submit-btn').addEventListener('click', async () => {
    const errEl      = document.getElementById('modal-error');
    const projectId  = document.getElementById('m-project').value;
    const startDate  = document.getElementById('m-start').value;
    const endDate    = document.getElementById('m-end').value;
    errEl.innerHTML  = '';

    if (!projectId) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกโครงการ</div>';
      return;
    }
    if (!startDate || !endDate) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันเริ่มต้นและวันสิ้นสุด</div>';
      return;
    }
    const days = calcDays(startDate, endDate);
    if (days <= 0) {
      errEl.innerHTML = '<div class="alert alert-error">วันสิ้นสุดต้องหลังวันเริ่มต้น</div>';
      return;
    }
    if (days > 30) {
      errEl.innerHTML = '<div class="alert alert-error">ระยะเวลาสูงสุด 30 วัน</div>';
      return;
    }

    const btn = document.getElementById('m-submit-btn');
    btn.disabled    = true;
    btn.textContent = 'กำลังส่ง...';

    try {
      const createRes = await createStorageArea(projectId);
      const newId     = createRes.data.id;
      await updateStorageArea(newId, { start_date: startDate, end_date: endDate });
      await submitStorageArea(newId);
      close();
      onSuccess();
    } catch (err) {
      errEl.innerHTML  = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled     = false;
      btn.textContent  = 'ส่งคำขอ';
    }
  });
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  const preProjectId = new URLSearchParams(window.location.search).get('project_id') ?? '';

  let areas    = [];
  let projects = [];

  try {
    const [areasRes, projRes] = await Promise.all([getStorageAreas({ limit: 100 }), getProjects({ limit: 100 })]);
    areas    = areasRes?.data ?? [];
    projects = projRes?.data  ?? [];
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  async function refreshList(status) {
    const container = document.getElementById('list-container');
    container.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const res = await getStorageAreas(status || undefined);
      container.innerHTML = renderList(res.data ?? []);
    } catch (err) {
      container.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">พื้นที่จัดเก็บ</h1>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-request">+ ขอพื้นที่</button>
      </div>
    </div>
    <div class="filter-row">
      <select class="filter-select" id="status-filter">
        ${STATUS_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
    </div>
    <div id="list-container">${renderList(areas)}</div>`;

  document.getElementById('status-filter').addEventListener('change', async (e) => {
    await refreshList(e.target.value);
  });

  document.getElementById('btn-request').addEventListener('click', () => {
    openRequestModal(preProjectId, projects, () => {
      const status = document.getElementById('status-filter').value;
      refreshList(status);
    });
  });

  // Auto-open modal if project_id is in URL
  if (preProjectId) {
    openRequestModal(preProjectId, projects, () => {
      const status = document.getElementById('status-filter').value;
      refreshList(status);
    });
  }
}

init();
