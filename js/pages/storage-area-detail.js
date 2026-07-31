import { requireAuth } from '../auth.js';
import {
  getStorageArea,
  submitStorageArea,
  approveStorageArea,
  rejectStorageArea,
  checkoutStorageArea,
  uploadPhoto,
  photoUrl,
  getNotifications,
} from '../api.js';
import { h, statusBadge, formatDate, formatCountdown, renderNavbar, showError, openModal, showConfirmModal } from '../ui.js';

function daysBetween(start, end) {
  if (!start || !end) return '-';
  const diff = Math.round((new Date(end) - new Date(start)) / 864e5);
  return diff > 0 ? diff : '-';
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.href = 'storage-areas.html'; return; }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  async function renderPage() {
    app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

    let area;
    try {
      const res = await getStorageArea(id);
      area = res.data;
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    const isAdmin = user.role === 'admin' || user.role === 'staff';
    const isOwner = user.id === area.user_id;
    const status  = area.status;

    // ── Actions bar ───────────────────────────────────────────────────────────
    let actionsHtml = '';

    if (status === 'draft' && isOwner) {
      actionsHtml = `
        <button class="btn btn-primary" id="btn-submit">ส่งคำขอ</button>`;
    }

    if (status === 'pending' && isAdmin) {
      actionsHtml = `
        <button class="btn btn-success" id="btn-approve">อนุมัติ</button>
        <button class="btn btn-danger"  id="btn-reject-open">ปฏิเสธ</button>`;
    }

    if (status === 'in_use' && isOwner) {
      actionsHtml = `
        <button class="btn btn-primary" id="btn-checkout-open">คืนพื้นที่</button>`;
    }

    // ── Alerts ───────────────────────────────────────────────────────────────
    const adminNoteAlert = area.admin_note
      ? `<div class="alert alert-info" style="margin-top:.75rem">หมายเหตุจากเจ้าหน้าที่: ${h(area.admin_note)}</div>`
      : '';

    const approvedAlert = status === 'approved'
      ? `<div class="alert alert-info" style="margin-top:.75rem">ระบบจะเปิดใช้งานอัตโนมัติเมื่อถึงวันเริ่มต้น</div>`
      : '';

    const inUseCountdown = status === 'in_use' && area.end_date
      ? `<div class="info-row">
           <span class="info-label">เวลาที่เหลือ</span>
           <span><span class="countdown">${h(formatCountdown(area.end_date))}</span></span>
         </div>`
      : '';

    // ── Photo evidence ───────────────────────────────────────────────────────
    const photoSection = area.checkout_photo_r2_key
      ? `<div class="card" style="margin-top:1.25rem">
           <div class="card-title">รูปภาพหลักฐานการคืนพื้นที่</div>
           <img src="${h(photoUrl(area.checkout_photo_r2_key))}"
             alt="รูปถ่ายการคืนพื้นที่"
             class="return-photo"
             style="max-width:100%;max-height:360px;border-radius:6px;border:1px solid var(--border);margin-top:.5rem">
         </div>`
      : '';

    app.innerHTML = `
      <a href="storage-areas.html" class="back-btn">← พื้นที่จัดเก็บ</a>

      <div class="req-header">
        <div class="req-title-row">
          <h1 class="page-title" style="margin:0">#${h(id)}</h1>
          ${statusBadge(status)}
        </div>
        <div class="page-title" style="font-size:1.1rem;font-weight:500;color:var(--text-muted)">
          ${h(area.project_name || area.project_id || '-')}
        </div>
        ${actionsHtml ? `<div class="actions-bar" id="actions-bar">${actionsHtml}</div>` : ''}
      </div>

      <div id="action-error"></div>

      <div class="card" style="margin-top:1.25rem">
        <div class="card-title">ข้อมูลพื้นที่จัดเก็บ</div>
        <div class="req-info-grid">
          <div class="info-row">
            <span class="info-label">โครงการ</span>
            <span>${h(area.project_name || area.project_id || '-')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">วันเริ่มต้น</span>
            <span>${formatDate(area.start_date)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">วันสิ้นสุด</span>
            <span>${formatDate(area.end_date)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">จำนวนวัน</span>
            <span>${daysBetween(area.start_date, area.end_date)} วัน</span>
          </div>
          <div class="info-row">
            <span class="info-label">ผู้ขอ</span>
            <span>${h(area.user_name || '-')}</span>
          </div>
          ${inUseCountdown}
        </div>
        ${adminNoteAlert}
        ${approvedAlert}
      </div>

      ${photoSection}`;

    function errBox(msg) {
      document.getElementById('action-error').innerHTML =
        `<div class="alert alert-error">${h(msg)}</div>`;
    }

    // ── Submit ────────────────────────────────────────────────────────────────
    document.getElementById('btn-submit')?.addEventListener('click', () => {
      showConfirmModal('ยืนยันการส่งคำขอพื้นที่จัดเก็บ?', async () => {
        try {
          await submitStorageArea(id);
          await renderPage();
        } catch (err) { errBox(err.message); }
      }, { confirmLabel: 'ส่งคำขอ' });
    });

    // ── Approve ───────────────────────────────────────────────────────────────
    document.getElementById('btn-approve')?.addEventListener('click', () => {
      showConfirmModal('ยืนยันการอนุมัติคำขอนี้?', async () => {
        try {
          await approveStorageArea(id, {});
          await renderPage();
        } catch (err) { errBox(err.message); }
      }, { confirmLabel: 'อนุมัติ' });
    });

    // ── Reject (modal) ────────────────────────────────────────────────────────
    document.getElementById('btn-reject-open')?.addEventListener('click', () => {
      const bodyHtml = `
        <div id="reject-modal-error"></div>
        <div class="form">
          <div class="form-group">
            <label class="form-label" for="reject-note">
              เหตุผลการปฏิเสธ <span class="form-required">*</span>
            </label>
            <textarea class="form-textarea" id="reject-note" rows="3"
              placeholder="ระบุเหตุผล…"></textarea>
          </div>
          <div class="form-actions">
            <button class="btn btn-danger"     id="m-confirm-reject">ปฏิเสธคำขอ</button>
            <button class="btn btn-secondary"  id="m-cancel-reject">ยกเลิก</button>
          </div>
        </div>`;

      const close = openModal('ปฏิเสธคำขอพื้นที่จัดเก็บ', bodyHtml);

      document.getElementById('m-cancel-reject').addEventListener('click', close);
      document.getElementById('m-confirm-reject').addEventListener('click', async () => {
        const note   = document.getElementById('reject-note').value.trim();
        const errEl  = document.getElementById('reject-modal-error');
        if (!note) {
          errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุเหตุผล</div>';
          return;
        }
        const btn = document.getElementById('m-confirm-reject');
        btn.disabled    = true;
        btn.textContent = 'กำลังดำเนินการ...';
        try {
          await rejectStorageArea(id, { admin_note: note });
          close();
          await renderPage();
        } catch (err) {
          errEl.innerHTML  = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled     = false;
          btn.textContent  = 'ปฏิเสธคำขอ';
        }
      });
    });

    // ── Checkout / คืนพื้นที่ (modal + photo upload) ──────────────────────────
    document.getElementById('btn-checkout-open')?.addEventListener('click', () => {
      const bodyHtml = `
        <div id="checkout-modal-error"></div>
        <div class="form">
          <div class="form-group">
            <label class="form-label" for="checkout-photo">
              รูปถ่ายยืนยันการเก็บของออกและทำความสะอาด <span class="form-required">*</span>
            </label>
            <input type="file" accept="image/*" class="form-input" id="checkout-photo">
          </div>
          <div class="form-actions">
            <button class="btn btn-primary"   id="m-confirm-checkout">ยืนยันคืนพื้นที่</button>
            <button class="btn btn-secondary" id="m-cancel-checkout">ยกเลิก</button>
          </div>
        </div>`;

      const close = openModal('คืนพื้นที่จัดเก็บ', bodyHtml);

      document.getElementById('m-cancel-checkout').addEventListener('click', close);
      document.getElementById('m-confirm-checkout').addEventListener('click', async () => {
        const file  = document.getElementById('checkout-photo').files[0];
        const errEl = document.getElementById('checkout-modal-error');
        if (!file) {
          errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกรูปถ่าย</div>';
          return;
        }
        const btn = document.getElementById('m-confirm-checkout');
        btn.disabled    = true;
        btn.textContent = 'กำลังอัปโหลด...';
        try {
          const r2Key = await uploadPhoto(file);
          await checkoutStorageArea(id, { photo_r2_key: r2Key });
          close();
          await renderPage();
        } catch (err) {
          errEl.innerHTML  = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled     = false;
          btn.textContent  = 'ยืนยันคืนพื้นที่';
        }
      });
    });
  }

  await renderPage();
}

init();
