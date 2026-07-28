import { requireAuth } from '../auth.js';
import { broadcast, getNotifications } from '../api.js';
import { h, renderNavbar, showError, openModal } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') {
    window.location.href = 'dashboard.html'; return;
  }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ส่งการแจ้งเตือน</h1>
    </div>

    <div class="admin-grid">
      <!-- Left: Form -->
      <div class="card">
        <div class="card-title">ฟอร์ม</div>

        <div id="bc-result"></div>
        <div id="bc-error"></div>

        <div class="form-group">
          <label class="form-label" for="bc-title">หัวข้อ <span style="color:var(--error)">*</span></label>
          <input type="text" class="form-input" id="bc-title"
            placeholder="หัวข้อการแจ้งเตือน" autocomplete="off">
        </div>

        <div class="form-group">
          <label class="form-label" for="bc-body">เนื้อหา <span style="color:var(--error)">*</span></label>
          <textarea class="form-textarea" id="bc-body"
            placeholder="เนื้อหาที่ต้องการส่ง…"
            style="min-height:140px;"></textarea>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" id="btn-broadcast">ส่งถึงผู้ใช้ทั้งหมด</button>
        </div>
      </div>

      <!-- Right: Preview -->
      <div class="card">
        <div class="card-title">ตัวอย่างการแจ้งเตือน</div>
        <div id="bc-preview">
          <div class="notif-item unread" style="border-radius:8px;padding:1rem;">
            <div class="notif-title" id="preview-title" style="font-weight:600;margin-bottom:.35rem;color:var(--text);">
              (หัวข้อ)
            </div>
            <div class="notif-body" id="preview-body" style="font-size:.9rem;color:var(--text-muted);white-space:pre-wrap;">
              (เนื้อหา)
            </div>
            <div class="notif-date" style="font-size:.78rem;color:var(--text-muted);margin-top:.5rem;">
              เพิ่งส่ง
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Live preview
  const titleInput = document.getElementById('bc-title');
  const bodyInput  = document.getElementById('bc-body');
  const previewTitle = document.getElementById('preview-title');
  const previewBody  = document.getElementById('preview-body');

  function updatePreview() {
    const t = titleInput.value.trim();
    const b = bodyInput.value.trim();
    previewTitle.textContent = t || '(หัวข้อ)';
    previewBody.textContent  = b || '(เนื้อหา)';
  }

  titleInput.addEventListener('input', updatePreview);
  bodyInput.addEventListener('input',  updatePreview);

  // Submit with confirm modal
  document.getElementById('btn-broadcast').addEventListener('click', () => {
    const errEl = document.getElementById('bc-error');
    const resEl = document.getElementById('bc-result');
    const title = titleInput.value.trim();
    const body  = bodyInput.value.trim();

    errEl.innerHTML = '';
    resEl.innerHTML = '';

    if (!title) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุหัวข้อ</div>';
      return;
    }
    if (!body) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุเนื้อหา</div>';
      return;
    }

    const close = openModal('ยืนยันการส่งการแจ้งเตือน', `
      <p style="margin-bottom:1.25rem;color:var(--text-muted);">
        ระบบจะส่งการแจ้งเตือนนี้ไปยังผู้ใช้ทุกคน ยืนยันหรือไม่?
      </p>
      <div class="notif-item unread" style="border-radius:8px;padding:.75rem;margin-bottom:1.25rem;">
        <div class="notif-title" style="font-weight:600;margin-bottom:.25rem;">${h(title)}</div>
        <div class="notif-body" style="font-size:.88rem;color:var(--text-muted);white-space:pre-wrap;">${h(body)}</div>
      </div>
      <div class="form-actions" style="display:flex;gap:.75rem;">
        <button class="btn btn-primary" id="modal-confirm-btn">ยืนยัน</button>
        <button class="btn btn-secondary" id="modal-cancel-btn">ยกเลิก</button>
      </div>
    `);

    document.getElementById('modal-cancel-btn').addEventListener('click', close);

    document.getElementById('modal-confirm-btn').addEventListener('click', async () => {
      const confirmBtn = document.getElementById('modal-confirm-btn');
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'กำลังส่ง…';

      try {
        await broadcast({ title, body });
        close();

        // Clear form
        titleInput.value = '';
        bodyInput.value  = '';
        updatePreview();

        resEl.innerHTML = `
          <div class="alert alert-success" style="margin-bottom:1rem;">
            ส่งการแจ้งเตือนเรียบร้อยแล้ว — ผู้ใช้ทุกคนจะได้รับข้อความนี้
          </div>`;
      } catch (err) {
        close();
        errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      }
    });
  });
}

init();

