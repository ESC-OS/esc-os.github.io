import { requireAuth } from '../auth.js';
import { getVisits, confirmVisit, rejectVisit, completeVisit, cancelVisit, getNotifications } from '../api.js';
import { h, statusBadge, formatDate, renderNavbar, openModal } from '../ui.js';

const STATUS_OPTS = [
  ['pending',   'รอยืนยัน'],
  ['confirmed', 'ยืนยันแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['cancelled', 'ยกเลิกแล้ว'],
  ['rejected',  'ถูกปฏิเสธ'],
  ['',          'ทุกสถานะ'],
];

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  const app = document.getElementById('app');
  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  let currentStatus = 'pending';

  function errBox(msg) {
    const el = document.getElementById('action-error');
    if (el) el.innerHTML = `<div class="alert alert-error">${h(msg)}</div>`;
  }

  async function renderList(status) {
    const container = document.getElementById('list-container');
    if (!container) return;
    container.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const params = { limit: 100 };
      if (status) params.status = status;
      const res = await getVisits(params);
      const visits = res?.data ?? [];

      if (visits.length === 0) {
        container.innerHTML = '<p class="empty-text">ไม่มีนัดชม</p>';
        return;
      }

      container.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>โครงการ</th>
                <th>วันที่</th>
                <th>เวลา</th>
                <th>จำนวนคน</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${visits.map(v => `
                <tr>
                  <td>
                    <div style="font-weight:600;font-size:.88rem">${h(v.project_name || '-')}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${h(v.user_name || '')}</div>
                  </td>
                  <td style="white-space:nowrap">${formatDate(v.visit_date)}</td>
                  <td>${h(v.visit_time ? v.visit_time.slice(0, 5) : '-')}</td>
                  <td style="text-align:center">${h(String(v.num_people ?? 1))}</td>
                  <td>${statusBadge(v.status)}</td>
                  <td>
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap">
                      ${v.status === 'pending' ? `
                        <button class="btn btn-sm btn-success do-confirm" data-id="${h(String(v.id))}">ยืนยัน</button>
                        <button class="btn btn-sm btn-danger do-reject"  data-id="${h(String(v.id))}">ปฏิเสธ</button>
                      ` : ''}
                      ${v.status === 'confirmed' ? `
                        <button class="btn btn-sm btn-primary do-complete" data-id="${h(String(v.id))}">เสร็จสิ้น</button>
                        <button class="btn btn-sm btn-danger do-cancel"   data-id="${h(String(v.id))}">ยกเลิก</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      bindActions();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  function bindActions() {
    document.querySelectorAll('.do-confirm').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const close = openModal('ยืนยันนัดชม', `
          <div class="form-group">
            <label class="form-label">หมายเหตุ <span style="color:var(--text-muted);font-size:.85em">(ไม่บังคับ)</span></label>
            <textarea class="form-textarea" id="confirm-note" style="min-height:60px" placeholder="หมายเหตุถึงผู้ขอ"></textarea>
          </div>
          <div id="modal-err"></div>
          <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
            <button class="btn btn-secondary" id="modal-cancel">ยกเลิก</button>
            <button class="btn btn-success" id="modal-confirm">ยืนยัน</button>
          </div>`);
        document.getElementById('modal-cancel').onclick = close;
        document.getElementById('modal-confirm').onclick = async () => {
          const note = document.getElementById('confirm-note').value.trim();
          const b = document.getElementById('modal-confirm');
          b.disabled = true; b.textContent = 'กำลังบันทึก…';
          try {
            await confirmVisit(id, note ? { admin_note: note } : {});
            close(); renderList(currentStatus);
          } catch (err) {
            document.getElementById('modal-err').innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
            b.disabled = false; b.textContent = 'ยืนยัน';
          }
        };
      });
    });

    document.querySelectorAll('.do-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const close = openModal('ปฏิเสธนัดชม', `
          <div class="form-group">
            <label class="form-label">เหตุผล <span style="color:var(--text-muted);font-size:.85em">(ไม่บังคับ)</span></label>
            <textarea class="form-textarea" id="reject-note" style="min-height:60px" placeholder="เหตุผลที่ปฏิเสธ"></textarea>
          </div>
          <div id="modal-err"></div>
          <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
            <button class="btn btn-secondary" id="modal-cancel">ยกเลิก</button>
            <button class="btn btn-danger" id="modal-confirm">ปฏิเสธ</button>
          </div>`);
        document.getElementById('modal-cancel').onclick = close;
        document.getElementById('modal-confirm').onclick = async () => {
          const note = document.getElementById('reject-note').value.trim();
          const b = document.getElementById('modal-confirm');
          b.disabled = true; b.textContent = 'กำลังบันทึก…';
          try {
            await rejectVisit(id, note ? { admin_note: note } : {});
            close(); renderList(currentStatus);
          } catch (err) {
            document.getElementById('modal-err').innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
            b.disabled = false; b.textContent = 'ปฏิเสธ';
          }
        };
      });
    });

    document.querySelectorAll('.do-complete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('ยืนยันว่านัดชมเสร็จสิ้น?')) return;
        btn.disabled = true;
        try {
          await completeVisit(btn.dataset.id);
          renderList(currentStatus);
        } catch (err) { errBox(err.message); btn.disabled = false; }
      });
    });

    document.querySelectorAll('.do-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('ยกเลิกนัดชมนี้?')) return;
        btn.disabled = true;
        try {
          await cancelVisit(btn.dataset.id, {});
          renderList(currentStatus);
        } catch (err) { errBox(err.message); btn.disabled = false; }
      });
    });
  }

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">จัดการนัดชม</h1>
      <div class="filter-row">
        <select class="filter-select" id="status-filter">
          ${STATUS_OPTS.map(([v, l]) => `<option value="${h(v)}" ${v === currentStatus ? 'selected' : ''}>${h(l)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="action-error"></div>
    <div id="list-container"></div>`;

  document.getElementById('status-filter').addEventListener('change', e => {
    currentStatus = e.target.value;
    renderList(currentStatus);
  });

  renderList(currentStatus);
}

init();
