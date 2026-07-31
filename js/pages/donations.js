import { requireAuth } from '../auth.js';
import { getDonations, getNotifications } from '../api.js';
import { h, statusBadge, formatDate, renderNavbar } from '../ui.js';

const STATUS_OPTS = [
  ['',          'ทุกสถานะ'],
  ['draft',     'ร่าง'],
  ['pending',   'รอดำเนินการ'],
  ['approved',  'อนุมัติแล้ว'],
  ['donated',   'บริจาคแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['rejected',  'ถูกปฏิเสธ'],
];

function renderList(list) {
  if (list.length === 0) {
    return '<p class="empty-text">ไม่มีรายการบริจาค</p>';
  }
  return `<div class="svc-list">
    ${list.map(d => `
    <a href="donation-detail.html?id=${h(d.id)}" class="svc-row">
      <span class="svc-row-id">#${h(d.id)}</span>
      <span class="svc-row-name">${h(d.project_name || d.project_id || '-')}</span>
      <span class="svc-row-meta">${d.item_count ?? 0} รายการ · ${formatDate(d.donation_date)}</span>
      ${statusBadge(d.status)}
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

  let donations = [];
  try {
    const res = await getDonations({ limit: 100 });
    donations = res?.data ?? [];
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">การบริจาค</h1>
      <div class="page-header-actions">
        <a href="donation-form.html" class="btn btn-primary">+ บริจาค</a>
      </div>
    </div>
    <div class="filter-row">
      <select class="filter-select" id="status-filter">
        ${STATUS_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
    </div>
    <div id="list-container">${renderList(donations)}</div>`;

  document.getElementById('status-filter').addEventListener('change', async (e) => {
    const status    = e.target.value;
    const container = document.getElementById('list-container');
    container.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const res = await getDonations(status || undefined);
      container.innerHTML = renderList(res.data ?? []);
    } catch (err) {
      container.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  });
}

init();
