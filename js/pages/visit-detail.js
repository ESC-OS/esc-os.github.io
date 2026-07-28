import { requireAuth } from '../auth.js';
import {
  getVisit,
  confirmVisit,
  rejectVisit,
  completeVisit,
  cancelVisit,
  getNotifications,
} from '../api.js';
import { h, statusBadge, formatDate, formatDateTime, renderNavbar, showError, openModal } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.replace('visits.html'); return; }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  async function renderPage() {
    app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

    let visit;
    try {
      const res = await getVisit(id);
      visit = res.data;
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    const isAdmin = user.role === 'admin' || user.role === 'staff';
    const isOwner = user.id === visit.user_id;
    const status  = visit.status;

    const canUserCancel   = isOwner && (status === 'pending' || status === 'confirmed');
    const canAdminApprove = isAdmin && status === 'pending';
    const canAdminReject  = isAdmin && status === 'pending';
    const canAdminComplete = isAdmin && status === 'confirmed';

    app.innerHTML = `
      <a href="visits.html" class="back-btn">← กลับ</a>

      <div class="page-header" style="margin-top:.75rem">
        <h1 class="page-title" style="margin:0">รายละเอียดการเยี่ยมชม</h1>
        <div class="page-header-actions">${statusBadge(status)}</div>
      </div>

      <div id="action-error"></div>

      <div class="card" style="margin-top:1rem">
        <div class="card-title">ข้อมูลการเยี่ยมชม</div>
        <div class="req-info-grid">
          <div class="info-row">
            <span class="info-label">โครงการ</span>
            <span>${h(visit.project_name || visit.project_id)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">วันเยี่ยมชม</span>
            <span>${formatDate(visit.visit_date)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">เวลา</span>
            <span>${h(visit.visit_time || '-')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">จำนวนผู้เข้าร่วม</span>
            <span>${h(String(visit.num_people ?? '-'))} คน</span>
          </div>
          ${visit.borrow_request_id ? `
          <div class="info-row">
            <span class="info-label">คำขอยืมที่เชื่อมโยง</span>
            <span><a href="request-detail.html?id=${h(visit.borrow_request_id)}" style="color:var(--primary)">#${h(visit.borrow_request_id.slice(0, 8))}</a></span>
          </div>` : ''}
          <div class="info-row">
            <span class="info-label">วันที่สร้าง</span>
            <span>${formatDateTime(visit.created_at)}</span>
          </div>
        </div>

        ${visit.admin_note ? `
        <div class="alert alert-info" style="margin-top:.75rem">
          <strong>หมายเหตุจากเจ้าหน้าที่:</strong> ${h(visit.admin_note)}
        </div>` : ''}

        ${status === 'rejected' ? `
        <div class="alert alert-warning" style="margin-top:.75rem">
          การเยี่ยมชมนี้ถูกปฏิเสธ${visit.admin_note ? '' : ' กรุณาจองวันอื่น'}
        </div>` : ''}
      </div>

      ${canUserCancel ? `
      <div class="card" style="margin-top:1rem">
        <div class="card-title">การดำเนินการ</div>
        <div class="actions-bar">
          <button class="btn btn-danger" id="btn-cancel">ยกเลิกการเยี่ยมชม</button>
        </div>
      </div>` : ''}

      ${canAdminApprove || canAdminComplete ? `
      <div class="card" style="margin-top:1rem">
        <div class="card-title">การดำเนินการ (เจ้าหน้าที่)</div>
        <div id="admin-action-area">
          ${canAdminApprove ? `
          <div class="form-group">
            <label class="form-label">หมายเหตุ (ไม่บังคับ)</label>
            <textarea class="form-textarea" id="approve-note" style="min-height:60px" placeholder="หมายเหตุสำหรับการอนุมัติ"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">เหตุผลการปฏิเสธ (จำเป็นหากปฏิเสธ)</label>
            <input class="form-input" id="reject-note" placeholder="ระบุเหตุผล…">
          </div>
          <div class="actions-bar">
            <button class="btn btn-success" id="btn-approve">อนุมัติ</button>
            <button class="btn btn-danger" id="btn-reject">ปฏิเสธ</button>
          </div>` : ''}
          ${canAdminComplete ? `
          <div class="actions-bar">
            <button class="btn btn-primary" id="btn-complete">บันทึกว่าเยี่ยมชมแล้ว</button>
          </div>` : ''}
        </div>
      </div>` : ''}`;

    function errBox(msg) {
      document.getElementById('action-error').innerHTML =
        `<div class="alert alert-error">${h(msg)}</div>`;
    }

    // ── User cancel ─────────────────────────────────────────────────
    document.getElementById('btn-cancel')?.addEventListener('click', () => {
      const close = openModal('ยืนยันการยกเลิก', `
        <p style="margin:.25rem 0 1rem">คุณต้องการยกเลิกการเยี่ยมชมนี้ใช่หรือไม่?</p>
        <div class="form-group">
          <label class="form-label">เหตุผล (ไม่บังคับ)</label>
          <input class="form-input" id="cancel-reason" placeholder="ระบุเหตุผล…">
        </div>
        <div class="form-actions" style="display:flex;gap:.5rem;margin-top:1rem">
          <button class="btn btn-danger" id="mc-confirm">ยืนยันยกเลิก</button>
          <button class="btn btn-secondary" id="mc-cancel">ไม่ยกเลิก</button>
        </div>`);
      document.getElementById('mc-cancel').addEventListener('click', () => close());
      document.getElementById('mc-confirm').addEventListener('click', async () => {
        const reason = document.getElementById('cancel-reason').value || undefined;
        try {
          await cancelVisit(id, reason ? { reason } : {});
          close();
          await renderPage();
        } catch (err) { errBox(err.message); close(); }
      });
    });

    // ── Admin approve ────────────────────────────────────────────────
    document.getElementById('btn-approve')?.addEventListener('click', async () => {
      const note = document.getElementById('approve-note').value.trim();
      try {
        await confirmVisit(id, note ? { admin_note: note } : {});
        await renderPage();
      } catch (err) { errBox(err.message); }
    });

    // ── Admin reject ─────────────────────────────────────────────────
    document.getElementById('btn-reject')?.addEventListener('click', async () => {
      const note = document.getElementById('reject-note').value.trim();
      if (!note) { errBox('กรุณาระบุเหตุผลการปฏิเสธ'); return; }
      try {
        await rejectVisit(id, { admin_note: note });
        await renderPage();
      } catch (err) { errBox(err.message); }
    });

    // ── Admin complete ───────────────────────────────────────────────
    document.getElementById('btn-complete')?.addEventListener('click', () => {
      const close = openModal('ยืนยันการเยี่ยมชม', `
        <p style="margin:.25rem 0 1rem">บันทึกว่าผู้ใช้เยี่ยมชมเสร็จสิ้นแล้วใช่หรือไม่?</p>
        <div class="form-actions" style="display:flex;gap:.5rem;margin-top:1rem">
          <button class="btn btn-primary" id="mc-ok">ยืนยัน</button>
          <button class="btn btn-secondary" id="mc-no">ยกเลิก</button>
        </div>`);
      document.getElementById('mc-no').addEventListener('click', () => close());
      document.getElementById('mc-ok').addEventListener('click', async () => {
        try {
          await completeVisit(id);
          close();
          await renderPage();
        } catch (err) { errBox(err.message); close(); }
      });
    });
  }

  await renderPage();
}

init();
