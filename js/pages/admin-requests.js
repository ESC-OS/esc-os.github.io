import { requireAuth } from '../auth.js';
import { getRequests } from '../api.js';
import { h, statusBadge, formatDateTime } from '../ui.js';
import { renderSelect, initSelect } from '../select.js';

const STATUS_OPTS = [
  ['pending', 'รอดำเนินการ'], ['processing', 'กำลังดำเนินการ'],
  ['ready_for_pickup', 'พร้อมรับ'], ['in_lend', 'กำลังยืม'],
  ['overdue', 'เกินกำหนด'], ['returned', 'คืนแล้ว (รอยืนยัน)'],
  ['', 'ทุกสถานะ'], ['completed', 'เสร็จสิ้น'],
  ['rejected', 'ถูกปฏิเสธ'], ['cancelled', 'ยกเลิกแล้ว'], ['archived', 'เก็บถาวร'],
];

async function init() {
  const user = await requireAuth(['staff', 'admin']);
  if (!user) return;
  const app = document.getElementById('app');

  async function renderPage(status = 'pending') {
    app.innerHTML = `<div class="spinner">กำลังโหลด...</div>`;
    const { requests } = await getRequests(status || undefined);

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">คำขอทั้งหมด</h1>
        ${renderSelect({ id: 'status-filter', value: status, options: STATUS_OPTS })}
      </div>
      ${requests.length === 0 ? '<p class="empty-text">ไม่มีคำขอในสถานะนี้</p>' : `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>คำขอ</th><th>โครงการ</th><th>ผู้ขอ</th><th>สถานะ</th><th>วันที่รับ</th><th>วันที่คืน</th></tr>
          </thead>
          <tbody>
            ${requests.map(r => `
              <tr style="cursor:pointer" onclick="window.location.href='/request-detail/?id=${h(r.id)}'">
                <td>
                  ${r.name ? `<div style="font-weight:600;font-size:.88rem">${h(r.name)}</div>` : ''}
                  <span class="mono" style="font-size:.75rem;color:var(--text-muted)">#${h(r.id.slice(0,8))}</span>
                </td>
                <td>${h(r.project_name || '-')}</td>
                <td>${h(r.requester_name || '-')}</td>
                <td>${statusBadge(r.status)}</td>
                <td style="white-space:nowrap">${formatDateTime(r.requested_pickup_datetime)}</td>
                <td style="white-space:nowrap">${formatDateTime(r.requested_return_datetime)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}`;

    initSelect('status-filter', v => renderPage(v));
  }

  await renderPage();
}
init();
