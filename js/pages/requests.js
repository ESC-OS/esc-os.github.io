import { requireAuth } from '../auth.js';
import { getRequests } from '../api.js';
import { h, statusBadge, formatDateTime } from '../ui.js';

const STATUS_OPTS = [
  ['', 'ทุกสถานะ'], ['draft', 'ร่าง'], ['pending', 'รอดำเนินการ'],
  ['processing', 'กำลังดำเนินการ'], ['ready_for_pickup', 'พร้อมรับ'],
  ['in_lend', 'กำลังยืม'], ['overdue', 'เกินกำหนด'], ['returned', 'คืนแล้ว'],
  ['completed', 'เสร็จสิ้น'], ['rejected', 'ถูกปฏิเสธ'], ['cancelled', 'ยกเลิกแล้ว'], ['return_rejected', 'คืนถูกปฏิเสธ'],
];

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');

  function renderTable(requests) {
    if (requests.length === 0) return `
      <div class="dash-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
        <p>ไม่มีคำขอยืม</p>
        <a href="/new-request/" class="btn btn-primary btn-sm">สร้างคำขอ</a>
      </div>`;
    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>คำขอ</th><th>โครงการ</th><th>สถานะ</th><th>วันที่รับ</th><th>วันที่คืน</th></tr>
          </thead>
          <tbody>
            ${requests.map(r => `
              <tr style="cursor:pointer" onclick="window.location.href='/request-detail/?id=${h(r.id)}'">
                <td>
                  ${r.name ? `<div style="font-weight:600;font-size:.88rem">${h(r.name)}</div>` : ''}
                  <span class="mono" style="font-size:.75rem;color:var(--text-muted)">#${h(r.id.slice(0,8))}</span>
                </td>
                <td>${h(r.project_name || '-')}</td>
                <td>${statusBadge(r.status)}</td>
                <td style="white-space:nowrap">${formatDateTime(r.requested_pickup_datetime)}</td>
                <td style="white-space:nowrap">${formatDateTime(r.requested_return_datetime)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  const { requests } = await getRequests();

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">คำขอยืมอุปกรณ์</h1>
      <div class="filter-row">
        <select class="filter-select" id="status-filter">
          ${STATUS_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <a href="/new-request/" class="btn btn-primary">+ สร้างคำขอ</a>
      </div>
    </div>
    <div id="req-container">${renderTable(requests)}</div>`;

  document.getElementById('status-filter').addEventListener('change', async (e) => {
    const status    = e.target.value;
    const container = document.getElementById('req-container');
    container.innerHTML = '<div class="spinner">กำลังโหลด...</div>';
    const { requests: filtered } = await getRequests(status || undefined);
    container.innerHTML = renderTable(filtered);
  });
}
init();
