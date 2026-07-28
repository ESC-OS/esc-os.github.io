import { requireAuth } from '../auth.js';
import {
  getProjects,
  getItems,
  createDonation,
  addDonationItem,
  submitDonation,
  getNotifications,
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

  const params       = new URLSearchParams(window.location.search);
  const preProjectId = params.get('project_id') ?? '';

  let projects = [];
  let allItems = [];

  try {
    const [projRes, itemsRes] = await Promise.all([getProjects(), getItems()]);
    projects = projRes.data  ?? [];
    allItems = itemsRes.data ?? [];
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  if (projects.length === 0) {
    app.innerHTML = `
      <a href="donations.html" class="back-btn">← การบริจาค</a>
      <div class="alert alert-warning">คุณยังไม่มีโครงการ กรุณาสร้างโครงการก่อน</div>
      <a href="projects.html" class="btn btn-primary">ไปที่โครงการ</a>`;
    return;
  }

  // In-memory item list (before server submission)
  // Each entry: { mode, item_id?, proposed_name?, proposed_category_code?, quantity, label }
  const items = [];

  // Current add-mode state
  let addMode = 'existing'; // 'existing' | 'new'

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
              <span class="item-row-name">${h(item.label)}</span>
              <span class="item-row-qty">× ${h(String(item.quantity))}</span>
              <span style="font-size:.8rem;color:var(--text-muted);padding:0 .25rem">
                ${item.mode === 'existing' ? 'จากคลัง' : 'เสนอใหม่'}
              </span>
              <button class="btn btn-sm btn-danger remove-item-btn" data-idx="${idx}">ลบ</button>
            </div>`).join('')}
        </div>
        <div style="margin-top:.4rem;color:var(--text-muted);font-size:.85rem">รวม ${items.length} รายการ</div>`;
    }
    updateSubmitBtn();
    attachRemoveListeners();
  }

  function updateSubmitBtn() {
    const btn = document.getElementById('btn-submit');
    if (!btn) return;
    const projectVal = document.getElementById('project-select')?.value ?? '';
    const dateVal    = document.getElementById('donation-date')?.value ?? '';
    btn.disabled = !(projectVal && dateVal && items.length > 0);
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

  function showModeFields() {
    document.getElementById('fields-existing').style.display = addMode === 'existing' ? '' : 'none';
    document.getElementById('fields-new').style.display      = addMode === 'new'      ? '' : 'none';
    document.getElementById('tab-existing').classList.toggle('btn-primary',   addMode === 'existing');
    document.getElementById('tab-existing').classList.toggle('btn-secondary',  addMode !== 'existing');
    document.getElementById('tab-new').classList.toggle('btn-primary',   addMode === 'new');
    document.getElementById('tab-new').classList.toggle('btn-secondary',  addMode !== 'new');
  }

  app.innerHTML = `
    <a href="donations.html" class="back-btn">← การบริจาค</a>
    <h1 class="page-title">บริจาคอุปกรณ์</h1>

    <!-- Section 1: General info -->
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-title">ข้อมูลทั่วไป</div>
      <div class="form-group">
        <label class="form-label" for="project-select">โครงการ <span class="form-required">*</span></label>
        <select class="form-select" id="project-select">
          <option value="">-- เลือกโครงการ --</option>
          ${projects.map(p =>
            `<option value="${h(p.id)}" ${p.id === preProjectId ? 'selected' : ''}>${h(p.name)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="donation-date">วันบริจาค <span class="form-required">*</span></label>
        <input type="date" class="form-input" id="donation-date" style="max-width:240px">
      </div>
    </div>

    <!-- Section 2: Add items -->
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-title">เพิ่มสิ่งของ</div>
      <div id="add-error"></div>

      <!-- Mode tabs -->
      <div style="display:flex;gap:.5rem;margin-bottom:1rem">
        <button class="btn btn-primary" id="tab-existing">เลือกจากคลัง</button>
        <button class="btn btn-secondary" id="tab-new">บรรยายใหม่</button>
      </div>

      <!-- Mode A: existing item from catalogue -->
      <div id="fields-existing">
        <div class="form-group">
          <label class="form-label" for="f-item-id">อุปกรณ์ <span class="form-required">*</span></label>
          <select class="form-select" id="f-item-id">
            <option value="">-- เลือกอุปกรณ์ --</option>
            ${allItems.map(it =>
              `<option value="${h(it.id)}">${h(it.name)}${it.category_name ? ` (${h(it.category_name)})` : ''}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <!-- Mode B: describe new item -->
      <div id="fields-new" style="display:none">
        <div class="form-group">
          <label class="form-label" for="f-proposed-name">ชื่อสิ่งของ <span class="form-required">*</span></label>
          <input type="text" class="form-input" id="f-proposed-name" placeholder="ชื่อสิ่งของ">
        </div>
        <div class="form-group">
          <label class="form-label" for="f-proposed-cat">ประเภท (รหัส) <span class="form-required">*</span></label>
          <input type="text" class="form-input" id="f-proposed-cat" placeholder="เช่น ELEC, FURNI">
        </div>
      </div>

      <!-- Qty (shared) -->
      <div class="form-group">
        <label class="form-label" for="f-qty">จำนวน <span class="form-required">*</span></label>
        <input type="number" class="form-input" id="f-qty" min="1" value="1" style="max-width:160px">
      </div>

      <button class="btn btn-secondary" id="btn-add-item">+ เพิ่ม</button>
    </div>

    <!-- Section 3: Items list + submit -->
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-title">รายการที่จะบริจาค</div>
      <div id="items-list"></div>
    </div>

    <div id="submit-error"></div>
    <div class="form-actions">
      <button class="btn btn-primary" id="btn-submit" disabled>ส่งคำขอ</button>
      <a href="donations.html" class="btn btn-secondary">ยกเลิก</a>
    </div>`;

  initDatePickers(app);

  // Init list
  renderItemList();

  // Mode tab events
  document.getElementById('tab-existing').addEventListener('click', () => {
    addMode = 'existing';
    showModeFields();
  });
  document.getElementById('tab-new').addEventListener('click', () => {
    addMode = 'new';
    showModeFields();
  });

  // Update submit button when project/date changes
  document.getElementById('project-select').addEventListener('change', updateSubmitBtn);
  document.getElementById('donation-date').addEventListener('change', updateSubmitBtn);

  // Add item
  document.getElementById('btn-add-item').addEventListener('click', () => {
    const errEl = document.getElementById('add-error');
    errEl.innerHTML = '';
    const qty = parseInt(document.getElementById('f-qty').value);

    if (!qty || qty < 1) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุจำนวนให้ถูกต้อง</div>';
      return;
    }

    if (addMode === 'existing') {
      const itemId = document.getElementById('f-item-id').value;
      if (!itemId) {
        errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกอุปกรณ์</div>';
        return;
      }
      const found = allItems.find(it => it.id === itemId);
      items.push({ mode: 'existing', item_id: itemId, quantity: qty, label: found?.name ?? itemId });
      document.getElementById('f-item-id').value = '';
    } else {
      const name = document.getElementById('f-proposed-name').value.trim();
      const cat  = document.getElementById('f-proposed-cat').value.trim();
      if (!name) {
        errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุชื่อสิ่งของ</div>';
        return;
      }
      if (!cat) {
        errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุประเภท</div>';
        return;
      }
      items.push({ mode: 'new', proposed_name: name, proposed_category_code: cat, quantity: qty, label: `${name} (${cat})` });
      document.getElementById('f-proposed-name').value = '';
      document.getElementById('f-proposed-cat').value  = '';
    }

    document.getElementById('f-qty').value = '1';
    renderItemList();
  });

  // Submit
  document.getElementById('btn-submit').addEventListener('click', async () => {
    const errEl     = document.getElementById('submit-error');
    errEl.innerHTML = '';

    const projectId   = document.getElementById('project-select').value;
    const donationDate = document.getElementById('donation-date').value;

    if (!projectId) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกโครงการ</div>';
      return;
    }
    if (!donationDate) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันบริจาค</div>';
      return;
    }
    if (items.length === 0) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาเพิ่มสิ่งของอย่างน้อย 1 รายการ</div>';
      return;
    }

    const btn = document.getElementById('btn-submit');
    btn.disabled    = true;
    btn.textContent = 'กำลังส่ง...';

    try {
      // 1. Create donation draft
      const createRes  = await createDonation(projectId);
      const donationId = createRes.data.id;

      // 2. Add all items
      for (const item of items) {
        const payload = { quantity: item.quantity };
        if (item.mode === 'existing') {
          payload.item_id = item.item_id;
        } else {
          payload.proposed_name          = item.proposed_name;
          payload.proposed_category_code = item.proposed_category_code;
        }
        await addDonationItem(donationId, payload);
      }

      // 3. Submit
      await submitDonation(donationId);

      window.location.href = `donation-detail.html?id=${donationId}`;
    } catch (err) {
      errEl.innerHTML  = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled     = false;
      btn.textContent  = 'ส่งคำขอ';
    }
  });
}

init();
