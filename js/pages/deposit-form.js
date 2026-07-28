import { requireAuth } from '../auth.js';
import {
  getProjects,
  getNotifications,
  createDeposit,
  updateDeposit,
  addDepositItem,
  submitDeposit,
} from '../api.js';
import { h, renderNavbar, showError } from '../ui.js';
import { initDatePickers } from '../datepicker.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  const params        = new URLSearchParams(window.location.search);
  const preProjectId  = params.get('project_id') ?? '';

  // In-memory item list (not yet sent to server until submit)
  const items = [];

  let projects;
  try {
    const res = await getProjects();
    projects = res.data ?? [];
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  if (projects.length === 0) {
    app.innerHTML = `
      <a href="deposits.html" class="back-btn">← ฝากชั่วคราว</a>
      <div class="alert alert-warning">คุณยังไม่มีโครงการ กรุณาสร้างโครงการก่อน</div>
      <a href="projects.html" class="btn btn-primary">ไปที่โครงการ</a>`;
    return;
  }

  function renderItemList() {
    const container = document.getElementById('items-list');
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = '<p class="empty-text" style="margin:0">ยังไม่มีรายการสิ่งของ</p>';
    } else {
      container.innerHTML = `
        <div class="item-row-list">
          ${items.map((item, idx) => `
            <div class="item-row" data-idx="${idx}">
              <span class="item-row-name">${h(item.name)}</span>
              <span class="item-row-qty">× ${h(String(item.quantity))}</span>
              ${item.note ? `<span style="color:var(--text-muted);font-size:.85rem">${h(item.note)}</span>` : ''}
              <button class="btn btn-sm btn-danger remove-item-btn" data-idx="${idx}">ลบ</button>
            </div>`).join('')}
        </div>
        <div style="margin-top:.5rem;color:var(--text-muted);font-size:.85rem">รวม ${items.length} รายการ</div>`;
    }
    updateSubmitBtn();
    attachRemoveListeners();
  }

  function updateSubmitBtn() {
    const btn = document.getElementById('btn-submit');
    if (!btn) return;
    const projectVal     = document.getElementById('project-select')?.value ?? '';
    const depositDateVal = document.getElementById('deposit-date')?.value ?? '';
    const withdrawDateVal= document.getElementById('withdraw-date')?.value ?? '';
    btn.disabled = !(projectVal && depositDateVal && withdrawDateVal && items.length > 0);
  }

  function attachRemoveListeners() {
    document.querySelectorAll('.remove-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        items.splice(idx, 1);
        renderItemList();
      });
    });
  }

  app.innerHTML = `
    <a href="deposits.html" class="back-btn">← ฝากชั่วคราว</a>
    <div class="page-header">
      <h1 class="page-title">ฝากของใหม่</h1>
    </div>

    <div class="admin-grid">
      <!-- Left: deposit info -->
      <div class="card">
        <div class="card-title">ข้อมูลการฝาก</div>
        <div class="form">
          <div class="form-group">
            <label class="form-label">โครงการ <span class="form-required">*</span></label>
            <select class="form-select" id="project-select">
              <option value="">-- เลือกโครงการ --</option>
              ${projects.map(p => `
                <option value="${h(p.id)}" ${p.id === preProjectId ? 'selected' : ''}>${h(p.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">วันฝาก <span class="form-required">*</span></label>
            <input type="date" class="form-input" id="deposit-date">
          </div>
          <div class="form-group">
            <label class="form-label">วันรับคืน <span class="form-required">*</span></label>
            <input type="date" class="form-input" id="withdraw-date">
            <div class="form-hint">สูงสุด 7 วันทำการ</div>
          </div>
        </div>
      </div>

      <!-- Right: item list -->
      <div class="card">
        <div class="card-title">รายการของที่ฝาก</div>

        <!-- Add item mini-form -->
        <div class="form" style="margin-bottom:1rem">
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">ชื่อสิ่งของ</label>
              <input type="text" class="form-input" id="item-name" placeholder="ชื่อสิ่งของ" autocomplete="off">
            </div>
            <div class="form-group" style="flex:0 0 90px">
              <label class="form-label">จำนวน</label>
              <input type="number" class="form-input" id="item-quantity" value="1" min="1">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">หมายเหตุ</label>
            <input type="text" class="form-input" id="item-note" placeholder="หมายเหตุ (ไม่บังคับ)" autocomplete="off">
          </div>
          <div id="add-item-error"></div>
          <button class="btn btn-secondary btn-sm" id="btn-add-item">+ เพิ่ม</button>
        </div>

        <!-- Item list display -->
        <div id="items-list">
          <p class="empty-text" style="margin:0">ยังไม่มีรายการสิ่งของ</p>
        </div>
      </div>
    </div>

    <div id="submit-error" style="margin-top:.75rem"></div>
    <div class="form-actions" style="margin-top:.75rem">
      <button class="btn btn-primary" id="btn-submit" disabled>ส่งคำขอ</button>
      <a href="deposits.html" class="btn btn-secondary">ยกเลิก</a>
    </div>`;

  initDatePickers(app);

  // Wire up field change → update submit button state
  ['project-select', 'deposit-date', 'withdraw-date'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateSubmitBtn);
    document.getElementById(id)?.addEventListener('input', updateSubmitBtn);
  });

  // Add item
  document.getElementById('btn-add-item').addEventListener('click', () => {
    const errEl    = document.getElementById('add-item-error');
    const name     = (document.getElementById('item-name').value ?? '').trim();
    const qtyRaw   = parseInt(document.getElementById('item-quantity').value ?? '1', 10);
    const note     = (document.getElementById('item-note').value ?? '').trim();
    errEl.innerHTML = '';

    if (!name) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุชื่อสิ่งของ</div>';
      return;
    }
    const quantity = isNaN(qtyRaw) || qtyRaw < 1 ? 1 : qtyRaw;
    items.push({ name, quantity, note: note || '' });

    // Reset mini-form
    document.getElementById('item-name').value     = '';
    document.getElementById('item-quantity').value = '1';
    document.getElementById('item-note').value     = '';
    renderItemList();
  });

  // Submit
  document.getElementById('btn-submit').addEventListener('click', async () => {
    const errEl       = document.getElementById('submit-error');
    const projectId   = document.getElementById('project-select').value.trim();
    const depositDate = document.getElementById('deposit-date').value.trim();
    const withdrawDate= document.getElementById('withdraw-date').value.trim();
    errEl.innerHTML   = '';

    if (!projectId)    { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกโครงการ</div>'; return; }
    if (!depositDate)  { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันฝาก</div>'; return; }
    if (!withdrawDate) { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันรับคืน</div>'; return; }
    if (items.length === 0) { errEl.innerHTML = '<div class="alert alert-error">กรุณาเพิ่มรายการสิ่งของอย่างน้อย 1 รายการ</div>'; return; }

    const btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = 'กำลังส่งคำขอ…';

    try {
      // 1. Create draft
      const createRes = await createDeposit(projectId);
      const depositId = createRes.data.id;

      // 2. Set dates
      await updateDeposit(depositId, { deposit_date: depositDate, withdraw_date: withdrawDate });

      // 3. Add each item
      for (const item of items) {
        await addDepositItem(depositId, {
          name: item.name,
          quantity: item.quantity,
          ...(item.note ? { note: item.note } : {}),
        });
      }

      // 4. Submit
      await submitDeposit(depositId);

      // 5. Redirect
      window.location.href = `deposit-detail.html?id=${encodeURIComponent(depositId)}`;
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = 'ส่งคำขอ';
      updateSubmitBtn();
    }
  });
}

init();
