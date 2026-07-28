import { requireAuth } from '../auth.js';
import {
  getDeposit,
  getNotifications,
  submitDeposit,
  approveDeposit,
  rejectDeposit,
  depositItems,
  completeDeposit,
  uploadPhoto,
  photoUrl,
} from '../api.js';
import { h, statusBadge, formatDate, formatCountdown, renderNavbar, showError, openModal } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.href = 'deposits.html'; return; }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  async function renderPage() {
    app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

    let deposit;
    try {
      const res = await getDeposit(id);
      deposit = res.data;
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    const isAdmin   = user.role === 'admin' || user.role === 'staff';
    const isOwner   = user.id === deposit.user_id;
    const status    = deposit.status;
    const items     = deposit.items ?? [];

    // ── Items table ───────────────────────────────────────────────────────────
    function itemsTable() {
      if (items.length === 0) {
        return '<p class="empty-text">ยังไม่มีรายการสิ่งของ</p>';
      }
      return `
        <div class="req-items-table">
          <table>
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th style="text-align:center">จำนวน</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${h(item.name)}</td>
                  <td style="text-align:center">${h(String(item.quantity ?? 1))}</td>
                  <td>${h(item.note || item.description || '-')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // ── Photo section ─────────────────────────────────────────────────────────
    function photoSection() {
      const hasDeposit    = (status === 'deposited' || status === 'completed') && deposit.deposit_photo_r2_key;
      const hasWithdrawal = status === 'completed' && deposit.withdrawal_photo_r2_key;
      if (!hasDeposit && !hasWithdrawal) return '';
      return `
        <div class="card">
          <div class="card-title">รูปภาพหลักฐาน</div>
          ${hasDeposit ? `
            <div style="margin-bottom:1rem">
              <div class="info-label" style="margin-bottom:.4rem">รูปภาพการฝากของ</div>
              <img src="${h(photoUrl(deposit.deposit_photo_r2_key))}"
                alt="รูปภาพการฝากของ" class="return-photo">
            </div>` : ''}
          ${hasWithdrawal ? `
            <div>
              <div class="info-label" style="margin-bottom:.4rem">รูปภาพการรับของคืน</div>
              <img src="${h(photoUrl(deposit.withdrawal_photo_r2_key))}"
                alt="รูปภาพการรับของคืน" class="return-photo">
            </div>` : ''}
        </div>`;
    }

    // ── Actions card ──────────────────────────────────────────────────────────
    function actionsCard() {
      // draft + owner → ส่งคำขอ / ยกเลิก
      if (status === 'draft' && isOwner) {
        return `
          <div class="card">
            <div class="card-title">การดำเนินการ</div>
            <div class="actions-bar">
              <button class="btn btn-primary" id="btn-submit">ส่งคำขอ</button>
              <button class="btn btn-danger"  id="btn-cancel">ยกเลิก</button>
            </div>
          </div>`;
      }

      // pending + admin → อนุมัติ / ปฏิเสธ
      if (status === 'pending' && isAdmin) {
        return `
          <div class="card">
            <div class="card-title">การดำเนินการ (เจ้าหน้าที่)</div>
            <div id="admin-error"></div>
            <div class="actions-bar">
              <button class="btn btn-success" id="btn-approve">อนุมัติ</button>
              <button class="btn btn-danger"  id="btn-reject">ปฏิเสธ</button>
            </div>
          </div>`;
      }

      // approved + owner → นำของมาฝาก (photo upload)
      if (status === 'approved' && isOwner) {
        return `
          <div class="card">
            <div class="card-title">การดำเนินการ</div>
            <div class="actions-bar">
              <button class="btn btn-primary" id="btn-deposit-items">นำของมาฝาก</button>
            </div>
          </div>`;
      }

      // deposited + owner → รับของคืน (photo upload)
      if (status === 'deposited' && isOwner) {
        return `
          <div class="card">
            <div class="card-title">การดำเนินการ</div>
            <div class="actions-bar">
              <button class="btn btn-primary" id="btn-complete">รับของคืน</button>
            </div>
          </div>`;
      }

      return '';
    }

    // ── Render ────────────────────────────────────────────────────────────────
    const countdownHtml = status === 'deposited' && deposit.withdraw_date
      ? `<span style="color:var(--primary);font-size:.9rem;margin-left:.5rem">(${formatCountdown(deposit.withdraw_date)})</span>`
      : '';

    app.innerHTML = `
      <a href="deposits.html" class="back-btn">← ฝากชั่วคราว</a>

      <div class="page-header">
        <h1 class="page-title">#${h(id.slice(0, 8))} ${statusBadge(status)}</h1>
        <div style="color:var(--text-muted)">${h(deposit.project_name || deposit.project_id || '-')}</div>
      </div>

      ${deposit.admin_note ? `
        <div class="alert alert-info" style="margin-bottom:1rem">
          <strong>หมายเหตุจากเจ้าหน้าที่:</strong> ${h(deposit.admin_note)}
        </div>` : ''}

      <div class="card">
        <div class="card-title">ข้อมูลการฝาก</div>
        <div class="req-info-grid">
          <div class="info-row">
            <span class="info-label">โครงการ</span>
            <span>${h(deposit.project_name || deposit.project_id || '-')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">วันฝาก</span>
            <span>${formatDate(deposit.deposit_date)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">วันรับคืน</span>
            <span>${formatDate(deposit.withdraw_date)}${countdownHtml}</span>
          </div>
          <div class="info-row">
            <span class="info-label">ผู้ฝาก</span>
            <span>${h(deposit.user_name || '-')}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">รายการสิ่งของ (${items.length} รายการ)</div>
        ${itemsTable()}
      </div>

      ${photoSection()}
      ${actionsCard()}`;

    // ── Events ────────────────────────────────────────────────────────────────

    // Submit draft
    document.getElementById('btn-submit')?.addEventListener('click', async () => {
      if (!confirm('ยืนยันการส่งคำขอฝากของ?')) return;
      try {
        await submitDeposit(id);
        await renderPage();
      } catch (err) { showError(err.message); }
    });

    // Cancel draft
    document.getElementById('btn-cancel')?.addEventListener('click', () => {
      if (!confirm('ยืนยันการยกเลิกคำขอ?')) return;
      showError('ไม่สามารถลบคำขอร่างได้ในขณะนี้');
    });

    // Admin: approve
    document.getElementById('btn-approve')?.addEventListener('click', async () => {
      const errEl = document.getElementById('admin-error');
      // Optional note modal
      const close = openModal('อนุมัติคำขอฝากของ', `
        <div class="form-group">
          <label class="form-label">หมายเหตุ (ไม่บังคับ)</label>
          <textarea class="form-textarea" id="approve-note" placeholder="หมายเหตุเพิ่มเติม…" style="min-height:70px"></textarea>
        </div>
        <div id="approve-modal-error"></div>
        <div class="form-actions">
          <button class="btn btn-success" id="confirm-approve-btn">ยืนยันการอนุมัติ</button>
          <button class="btn btn-secondary" id="cancel-approve-btn">ยกเลิก</button>
        </div>`);

      document.getElementById('cancel-approve-btn').addEventListener('click', close);
      document.getElementById('confirm-approve-btn').addEventListener('click', async () => {
        const note    = (document.getElementById('approve-note')?.value ?? '').trim();
        const modalErr = document.getElementById('approve-modal-error');
        const btn      = document.getElementById('confirm-approve-btn');
        btn.disabled = true;
        btn.textContent = 'กำลังดำเนินการ…';
        try {
          await approveDeposit(id, note ? { admin_note: note } : {});
          close();
          await renderPage();
        } catch (err) {
          modalErr.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false;
          btn.textContent = 'ยืนยันการอนุมัติ';
        }
      });
    });

    // Admin: reject
    document.getElementById('btn-reject')?.addEventListener('click', () => {
      const close = openModal('ปฏิเสธคำขอฝากของ', `
        <div class="form-group">
          <label class="form-label">เหตุผลการปฏิเสธ <span class="form-required">*</span></label>
          <textarea class="form-textarea" id="reject-note" placeholder="ระบุเหตุผล…" style="min-height:80px"></textarea>
        </div>
        <div id="reject-modal-error"></div>
        <div class="form-actions">
          <button class="btn btn-danger"    id="confirm-reject-btn">ยืนยันการปฏิเสธ</button>
          <button class="btn btn-secondary" id="cancel-reject-btn">ยกเลิก</button>
        </div>`);

      document.getElementById('cancel-reject-btn').addEventListener('click', close);
      document.getElementById('confirm-reject-btn').addEventListener('click', async () => {
        const note    = (document.getElementById('reject-note')?.value ?? '').trim();
        const modalErr = document.getElementById('reject-modal-error');
        if (!note) {
          modalErr.innerHTML = '<div class="alert alert-error">กรุณาระบุเหตุผลการปฏิเสธ</div>';
          return;
        }
        const btn = document.getElementById('confirm-reject-btn');
        btn.disabled = true;
        btn.textContent = 'กำลังดำเนินการ…';
        try {
          await rejectDeposit(id, { admin_note: note });
          close();
          await renderPage();
        } catch (err) {
          modalErr.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false;
          btn.textContent = 'ยืนยันการปฏิเสธ';
        }
      });
    });

    // Owner: นำของมาฝาก (approved → deposited)
    document.getElementById('btn-deposit-items')?.addEventListener('click', () => {
      const close = openModal('อัปโหลดรูปภาพ', `
        <div class="form-group">
          <label class="form-label">รูปภาพการนำของมาฝาก</label>
          <input type="file" accept="image/*" id="photo-input" class="form-input">
        </div>
        <div id="upload-error"></div>
        <div class="form-actions">
          <button class="btn btn-primary"   id="upload-btn">ยืนยัน</button>
          <button class="btn btn-secondary" id="cancel-upload-btn">ยกเลิก</button>
        </div>`);

      document.getElementById('cancel-upload-btn').addEventListener('click', close);
      document.getElementById('upload-btn').addEventListener('click', async () => {
        const file    = document.getElementById('photo-input').files[0];
        const errEl   = document.getElementById('upload-error');
        if (!file) { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกรูปภาพ</div>'; return; }
        const btn = document.getElementById('upload-btn');
        btn.disabled = true;
        btn.textContent = 'กำลังอัปโหลด…';
        try {
          const r2Key = await uploadPhoto(file);
          await depositItems(id, { photo_r2_key: r2Key });
          close();
          await renderPage();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false;
          btn.textContent = 'ยืนยัน';
        }
      });
    });

    // Owner: รับของคืน (deposited → completed)
    document.getElementById('btn-complete')?.addEventListener('click', () => {
      const close = openModal('อัปโหลดรูปภาพ', `
        <div class="form-group">
          <label class="form-label">รูปภาพการรับของคืน</label>
          <input type="file" accept="image/*" id="photo-input" class="form-input">
        </div>
        <div id="upload-error"></div>
        <div class="form-actions">
          <button class="btn btn-primary"   id="upload-btn">ยืนยัน</button>
          <button class="btn btn-secondary" id="cancel-upload-btn">ยกเลิก</button>
        </div>`);

      document.getElementById('cancel-upload-btn').addEventListener('click', close);
      document.getElementById('upload-btn').addEventListener('click', async () => {
        const file  = document.getElementById('photo-input').files[0];
        const errEl = document.getElementById('upload-error');
        if (!file) { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกรูปภาพ</div>'; return; }
        const btn = document.getElementById('upload-btn');
        btn.disabled = true;
        btn.textContent = 'กำลังอัปโหลด…';
        try {
          const r2Key = await uploadPhoto(file);
          await completeDeposit(id, { photo_r2_key: r2Key });
          close();
          await renderPage();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false;
          btn.textContent = 'ยืนยัน';
        }
      });
    });
  }

  await renderPage();
}

init();
