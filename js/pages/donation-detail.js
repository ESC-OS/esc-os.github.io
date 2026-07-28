import { requireAuth } from '../auth.js';
import {
  getDonation,
  submitDonation,
  reviewDonationItem,
  approveDonation,
  rejectDonation,
  donateDonation,
  completeDonation,
  uploadPhoto,
  photoUrl,
  getNotifications,
} from '../api.js';
import { h, statusBadge, formatDate, renderNavbar, showError, openModal } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.href = 'donations.html'; return; }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  async function renderPage() {
    app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

    let donation;
    try {
      const res = await getDonation(id);
      donation = res.data;
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    const isAdmin = user.role === 'admin' || user.role === 'staff';
    const isOwner = user.id === donation.user_id;
    const status  = donation.status;
    const items   = donation.items ?? [];

    // ── Item status badge ─────────────────────────────────────────────────────
    function itemStatusBadge(s) {
      const labels = { pending: 'รอพิจารณา', approved: 'อนุมัติ', rejected: 'ปฏิเสธ' };
      const cls    = { pending: 'pending',   approved: 'approved', rejected: 'rejected' };
      return `<span class="badge badge-${h(cls[s] || s)}">${h(labels[s] || s)}</span>`;
    }

    // ── Per-item review controls (admin + status=pending + item pending) ──────
    function itemReviewHtml(item) {
      if (!isAdmin || status !== 'pending' || item.status !== 'pending') return '';
      return `
        <div style="display:flex;gap:.4rem;align-items:center;margin-top:.3rem;flex-wrap:wrap">
          <input type="number" class="form-input" id="qty-${h(item.id)}"
            min="1" value="${h(String(item.quantity))}" style="width:110px"
            placeholder="จำนวนที่อนุมัติ">
          <button class="btn btn-success btn-sm" data-approve="${h(item.id)}">อนุมัติ</button>
          <button class="btn btn-danger  btn-sm" data-reject="${h(item.id)}">ปฏิเสธ</button>
        </div>`;
    }

    const allReviewed = items.length > 0 && items.every(i => i.status !== 'pending');

    // ── Items table ───────────────────────────────────────────────────────────
    function itemsTable() {
      if (items.length === 0) {
        return '<p class="empty-text">ยังไม่มีรายการสิ่งของ</p>';
      }
      return `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ชื่อ/ของที่เสนอ</th>
                <th>ประเภท</th>
                <th style="text-align:center">จำนวนขอ</th>
                <th style="text-align:center">จำนวนอนุมัติ</th>
                <th>สถานะรายการ</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${h(item.proposed_name || item.item_name || item.item_id || '-')}</td>
                  <td>${h(item.proposed_category_code || item.category_code || '-')}</td>
                  <td style="text-align:center">${h(String(item.quantity ?? '-'))}</td>
                  <td style="text-align:center">${item.quantity_approved != null ? h(String(item.quantity_approved)) : '-'}</td>
                  <td>
                    ${itemStatusBadge(item.status || 'pending')}
                    ${itemReviewHtml(item)}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // ── Actions bar HTML ──────────────────────────────────────────────────────
    let actionsHtml = '';

    if (status === 'draft' && isOwner) {
      actionsHtml = `
        <button class="btn btn-primary" id="btn-submit">ส่งคำขอ</button>`;
    }

    if (status === 'pending' && isAdmin && allReviewed) {
      actionsHtml += `
        <button class="btn btn-success" id="btn-approve-donation">อนุมัติการบริจาค</button>
        <button class="btn btn-danger"  id="btn-reject-donation">ปฏิเสธทั้งหมด</button>`;
    }

    if (status === 'approved' && isOwner) {
      actionsHtml += `
        <button class="btn btn-primary" id="btn-donate-open">นำของมามอบ</button>`;
    }

    if (status === 'donated' && isAdmin) {
      actionsHtml += `
        <button class="btn btn-success" id="btn-complete">ยืนยันรับบริจาค</button>`;
    }

    // ── Photo evidence ────────────────────────────────────────────────────────
    const photoSection = (donation.photo_r2_key && (status === 'donated' || status === 'completed'))
      ? `<div class="card" style="margin-top:1.25rem">
           <div class="card-title">รูปถ่ายการบริจาค</div>
           <img src="${h(photoUrl(donation.photo_r2_key))}"
             alt="รูปถ่ายการบริจาค"
             class="return-photo"
             style="max-width:100%;max-height:360px;border-radius:6px;border:1px solid var(--border);margin-top:.5rem">
         </div>`
      : '';

    // ── Render ────────────────────────────────────────────────────────────────
    app.innerHTML = `
      <a href="donations.html" class="back-btn">← การบริจาค</a>

      <div class="req-header">
        <div class="req-title-row">
          <h1 class="page-title" style="margin:0">#${h(id.slice(0, 8))}</h1>
          ${statusBadge(status)}
        </div>
        <div class="page-title" style="font-size:1.1rem;font-weight:500;color:var(--text-muted)">
          ${h(donation.project_name || donation.project_id || '-')}
        </div>
        ${actionsHtml ? `<div class="actions-bar" id="actions-bar">${actionsHtml}</div>` : ''}
      </div>

      <div id="action-error"></div>

      <div class="card" style="margin-top:1.25rem">
        <div class="card-title">ข้อมูลการบริจาค</div>
        <div class="req-info-grid">
          <div class="info-row">
            <span class="info-label">โครงการ</span>
            <span>${h(donation.project_name || donation.project_id || '-')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">วันบริจาค</span>
            <span>${formatDate(donation.donation_date)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">ผู้บริจาค</span>
            <span>${h(donation.user_name || '-')}</span>
          </div>
        </div>
        ${donation.admin_note
          ? `<div class="alert alert-info" style="margin-top:.75rem">หมายเหตุจากเจ้าหน้าที่: ${h(donation.admin_note)}</div>`
          : ''}
      </div>

      <div class="card" style="margin-top:1.25rem">
        <div class="card-title">รายการสิ่งของ (${items.length} รายการ)</div>
        ${itemsTable()}
      </div>

      ${photoSection}`;

    // ── Error helper ──────────────────────────────────────────────────────────
    function errBox(msg) {
      document.getElementById('action-error').innerHTML =
        `<div class="alert alert-error">${h(msg)}</div>`;
    }

    // ── Submit donation request ───────────────────────────────────────────────
    document.getElementById('btn-submit')?.addEventListener('click', async () => {
      if (!confirm('ยืนยันการส่งคำขอบริจาค?')) return;
      try {
        await submitDonation(id);
        await renderPage();
      } catch (err) { errBox(err.message); }
    });

    // ── Per-item approve ──────────────────────────────────────────────────────
    document.querySelectorAll('[data-approve]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.approve;
        const qty    = parseInt(document.getElementById(`qty-${itemId}`)?.value ?? '0');
        if (!qty || qty < 1) { errBox('กรุณาระบุจำนวนที่อนุมัติให้ถูกต้อง'); return; }
        btn.disabled = true;
        try {
          await reviewDonationItem(id, itemId, { action: 'approve', quantity_approved: qty });
          await renderPage();
        } catch (err) { errBox(err.message); btn.disabled = false; }
      });
    });

    // ── Per-item reject ───────────────────────────────────────────────────────
    document.querySelectorAll('[data-reject]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.reject;
        if (!confirm('ยืนยันการปฏิเสธรายการนี้?')) return;
        btn.disabled = true;
        try {
          await reviewDonationItem(id, itemId, { action: 'reject' });
          await renderPage();
        } catch (err) { errBox(err.message); btn.disabled = false; }
      });
    });

    // ── Approve donation (admin) ──────────────────────────────────────────────
    document.getElementById('btn-approve-donation')?.addEventListener('click', async () => {
      if (!confirm('ยืนยันการอนุมัติการบริจาค?')) return;
      try {
        await approveDonation(id, {});
        await renderPage();
      } catch (err) { errBox(err.message); }
    });

    // ── Reject donation (admin, with note modal) ──────────────────────────────
    document.getElementById('btn-reject-donation')?.addEventListener('click', () => {
      const bodyHtml = `
        <div id="reject-modal-err"></div>
        <div class="form">
          <div class="form-group">
            <label class="form-label" for="reject-note">
              เหตุผล <span class="form-required">*</span>
            </label>
            <textarea class="form-textarea" id="reject-note" rows="3" placeholder="ระบุเหตุผล…"></textarea>
          </div>
          <div class="form-actions">
            <button class="btn btn-danger"    id="m-confirm-reject">ปฏิเสธ</button>
            <button class="btn btn-secondary" id="m-cancel-reject">ยกเลิก</button>
          </div>
        </div>`;

      const close = openModal('ปฏิเสธการบริจาค', bodyHtml);
      document.getElementById('m-cancel-reject').addEventListener('click', close);
      document.getElementById('m-confirm-reject').addEventListener('click', async () => {
        const note  = document.getElementById('reject-note').value.trim();
        const errEl = document.getElementById('reject-modal-err');
        if (!note) { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุเหตุผล</div>'; return; }
        const btn = document.getElementById('m-confirm-reject');
        btn.disabled = true; btn.textContent = 'กำลังดำเนินการ...';
        try {
          await rejectDonation(id, { admin_note: note });
          close();
          await renderPage();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'ปฏิเสธ';
        }
      });
    });

    // ── Donate (owner, approved) — modal with date + photo ───────────────────
    document.getElementById('btn-donate-open')?.addEventListener('click', () => {
      const today = new Date().toISOString().slice(0, 10);
      const bodyHtml = `
        <div id="donate-modal-err"></div>
        <div class="form">
          <div class="form-group">
            <label class="form-label" for="f-donate-date">
              วันบริจาคจริง <span class="form-required">*</span>
            </label>
            <input type="date" class="form-input" id="f-donate-date" value="${h(today)}">
          </div>
          <div class="form-group">
            <label class="form-label" for="f-donate-photo">
              รูปภาพ <span class="form-required">*</span>
            </label>
            <input type="file" accept="image/*" class="form-input" id="f-donate-photo">
          </div>
          <div class="form-actions">
            <button class="btn btn-primary"   id="m-confirm-donate">ยืนยันการบริจาค</button>
            <button class="btn btn-secondary" id="m-cancel-donate">ยกเลิก</button>
          </div>
        </div>`;

      const close = openModal('นำของมามอบ', bodyHtml);
      document.getElementById('m-cancel-donate').addEventListener('click', close);
      document.getElementById('m-confirm-donate').addEventListener('click', async () => {
        const date  = document.getElementById('f-donate-date').value;
        const file  = document.getElementById('f-donate-photo').files[0];
        const errEl = document.getElementById('donate-modal-err');
        errEl.innerHTML = '';

        if (!date) { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันบริจาค</div>'; return; }
        if (!file) { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกรูปภาพ</div>'; return; }

        const btn = document.getElementById('m-confirm-donate');
        btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...';
        try {
          const r2Key = await uploadPhoto(file);
          await donateDonation(id, { photo_r2_key: r2Key, donation_date: date });
          close();
          await renderPage();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'ยืนยันการบริจาค';
        }
      });
    });

    // ── Complete (admin, donated) ─────────────────────────────────────────────
    document.getElementById('btn-complete')?.addEventListener('click', async () => {
      if (!confirm('ยืนยันการรับบริจาคและทำเครื่องหมายเสร็จสิ้น?')) return;
      try {
        await completeDonation(id);
        await renderPage();
      } catch (err) { errBox(err.message); }
    });
  }

  await renderPage();
}

init();
