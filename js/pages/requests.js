import { requireAuth } from '../auth.js';
import { getRequests, getNotifications } from '../api.js';
import { h, statusBadge, formatDate, renderNavbar } from '../ui.js';

const STATUS_OPTS = [
  ['', 'ทุกสถานะ'],
  ['draft', 'ร่าง'],
  ['pending', 'รอดำเนินการ'],
  ['processing', 'กำลังดำเนินการ'],
  ['ready_for_pickup', 'พร้อมรับ'],
  ['in_lend', 'กำลังยืม'],
  ['returned', 'คืนแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['rejected', 'ถูกปฏิเสธ'],
  ['cancelled', 'ยกเลิกแล้ว'],
];

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  const isAdmin   = user.role === 'admin';
  const adminView = isAdmin && new URLSearchParams(window.location.search).get('view') === 'admin';

  // Default to pending for admin queue view
  let currentStatus = adminView ? 'pending' : '';

  function renderList(requests) {
    if (!requests || requests.length === 0) {
      return '<p class="empty-text">ไม่มีคำขอ</p>';
    }
    return `<div class="svc-list">
      ${requests.map(r => `
        <a href="request-detail.html?id=${h(r.id)}" class="svc-row">
          <span class="svc-row-id">#${h(r.id)}</span>
          <span class="svc-row-name">${h(r.name || '-')}</span>
          ${adminView && r.user_name ? `<span class="svc-row-meta" style="color:var(--text-muted)">${h(r.user_name)}</span>` : ''}
          <span>${statusBadge(r.status)}${r.is_overdue ? ' <span class="badge badge-overdue">เกินกำหนด</span>' : ''}</span>
          <span class="svc-row-meta">${formatDate(r.requested_pickup_datetime)}</span>
          <span class="svc-row-arrow">›</span>
        </a>`).join('')}
    </div>`;
  }

  async function loadAndRender(status) {
    const container = document.getElementById('list-container');
    if (container) container.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const params = { limit: 100 };
      if (status) params.status = status;
      const res = await getRequests(params);
      if (container) container.innerHTML = renderList(res?.data ?? []);
    } catch (err) {
      if (container) container.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  // Initial load
  let requests;
  try {
    const params = { limit: 100 };
    if (currentStatus) params.status = currentStatus;
    const res = await getRequests(params);
    requests = res?.data ?? [];
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  const statusFilterHtml = `
    <select class="filter-select" id="status-filter">
      ${STATUS_OPTS.map(([v, l]) => `<option value="${h(v)}" ${v === currentStatus ? 'selected' : ''}>${h(l)}</option>`).join('')}
    </select>`;

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${adminView ? 'คำขอยืม (ทั้งหมด)' : 'คำขอยืม'}</h1>
      <div class="page-header-actions">
        <div class="filter-row">
          ${statusFilterHtml}
        </div>
        ${!adminView ? '<a href="new-request.html" class="btn btn-primary">+ สร้างคำขอ</a>' : ''}
      </div>
    </div>
    <div id="list-container">${renderList(requests)}</div>`;

  document.getElementById('status-filter').addEventListener('change', async (e) => {
    currentStatus = e.target.value;
    await loadAndRender(currentStatus);
  });
}

init();
