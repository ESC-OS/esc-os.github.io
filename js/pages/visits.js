import { requireAuth } from '../auth.js';
import { getVisits, getNotifications } from '../api.js';
import { h, statusBadge, formatDate, renderNavbar } from '../ui.js';
import { openVisitModal } from '../forms.js';

const STATUS_OPTS = [
  ['',          'ทุกสถานะ'],
  ['pending',   'รอดำเนินการ'],
  ['confirmed', 'ยืนยันแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['rejected',  'ถูกปฏิเสธ'],
  ['cancelled', 'ยกเลิกแล้ว'],
];

function renderList(list) {
  if (list.length === 0) {
    return '<p class="empty-text">ไม่มีการจองเยี่ยมชม</p>';
  }
  return `<div class="svc-list">
    ${list.map(v => `
      <a href="visit-detail.html?id=${h(v.id)}" class="svc-row">
        <span class="svc-row-id">${formatDate(v.visit_date)}</span>
        <span class="svc-row-name">${h(v.project_name || v.project_id)}</span>
        <span class="svc-row-meta">${h(v.visit_time || '-')} · ${h(String(v.num_people ?? '-'))} คน</span>
        ${statusBadge(v.status)}
        <span class="svc-row-arrow">›</span>
      </a>`).join('')}
  </div>`;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  let currentStatus = '';

  async function loadAndRender(status) {
    const container = document.getElementById('list-container');
    if (container) container.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const res = await getVisits(status || undefined);
      const list = res.data ?? [];
      if (container) container.innerHTML = renderList(list);
    } catch (err) {
      if (container) container.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  // Initial render of full page structure
  let visits = [];
  try {
    const res = await getVisits({ limit: 100 });
    visits = res?.data ?? [];
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">การเยี่ยมชม</h1>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-new-visit">+ จองเยี่ยมชม</button>
      </div>
    </div>
    <div class="filter-row">
      <select class="filter-select" id="status-filter">
        ${STATUS_OPTS.map(([v, l]) => `<option value="${h(v)}">${h(l)}</option>`).join('')}
      </select>
    </div>
    <div id="list-container">${renderList(visits)}</div>`;

  document.getElementById('btn-new-visit').addEventListener('click', () => {
    openVisitModal({ onSuccess: () => loadAndRender(currentStatus) });
  });

  document.getElementById('status-filter').addEventListener('change', async (e) => {
    currentStatus = e.target.value;
    await loadAndRender(currentStatus);
  });
}

init();
