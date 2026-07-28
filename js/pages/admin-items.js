import { requireAuth } from '../auth.js';
import {
  getItems, createItem, updateItem, deleteItem,
  getCategories, createCategory, updateCategory, deleteCategory,
  uploadPhoto, photoUrl, getNotifications,
} from '../api.js';
import { h, showError, openModal, renderNavbar } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  const app = document.getElementById('app');
  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  // ── state ──────────────────────────────────────────────────────────────────
  let allItems      = [];
  let allCategories = [];
  let filterCat     = '';
  let filterSearch  = '';
  let filterLow     = false;

  // ── bootstrap ──────────────────────────────────────────────────────────────
  async function loadAll() {
    app.innerHTML = '<p class="loading-text">กำลังโหลด...</p>';
    try {
      const [itemsRes, catsRes] = await Promise.all([getItems(), getCategories()]);
      allItems      = itemsRes.data      ?? [];
      allCategories = catsRes.data       ?? [];
      renderPage();
    } catch (err) {
      showError(err.message);
    }
  }

  // ── filtered view ──────────────────────────────────────────────────────────
  function filteredItems() {
    return allItems.filter(item => {
      if (filterCat    && item.category_code !== filterCat)                            return false;
      if (filterSearch && !item.name.toLowerCase().includes(filterSearch.toLowerCase())) return false;
      if (filterLow    && item.available_quantity > 3)                                  return false;
      return true;
    });
  }

  // ── main render ────────────────────────────────────────────────────────────
  function renderPage() {
    const items = filteredItems();
    const catOptions = allCategories.map(c =>
      `<option value="${h(c.code)}" ${filterCat === c.code ? 'selected' : ''}>${h(c.name)}</option>`
    ).join('');

    app.innerHTML = `
      <!-- Page header -->
      <div class="page-header">
        <h1 class="page-title">จัดการอุปกรณ์</h1>
        <button class="btn btn-primary" id="btn-add-item">+ เพิ่มอุปกรณ์</button>
      </div>

      <!-- Category management -->
      <div class="card" style="margin-bottom:1.25rem">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
          <div class="card-title" style="margin:0">หมวดหมู่</div>
          <button class="btn btn-outline-primary btn-sm" id="btn-add-cat">+ เพิ่มหมวดหมู่</button>
        </div>
        <div id="cat-list" style="display:flex;flex-wrap:wrap;gap:.5rem">
          ${allCategories.length === 0
            ? '<span style="color:var(--text-muted);font-size:.88rem">ยังไม่มีหมวดหมู่</span>'
            : allCategories.map(c => `
                <div class="cat-chip" style="display:flex;align-items:center;gap:.4rem;background:var(--bg-secondary);border-radius:6px;padding:.25rem .6rem;font-size:.85rem">
                  <span>${h(c.code)}: ${h(c.name)}</span>
                  <button class="btn-icon do-edit-cat" data-code="${h(c.code)}" data-name="${h(c.name)}" title="แก้ไข" style="color:var(--primary)">✏️</button>
                  <button class="btn-icon do-delete-cat" data-code="${h(c.code)}" data-name="${h(c.name)}" title="ลบ" style="color:var(--error)">🗑</button>
                </div>`).join('')}
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-row" style="display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem;align-items:center">
        <select class="filter-select" id="filter-cat">
          <option value="">ทุกหมวดหมู่</option>
          ${catOptions}
        </select>
        <input class="form-input" id="filter-search" placeholder="ค้นหาชื่ออุปกรณ์..." value="${h(filterSearch)}" style="flex:1;min-width:160px">
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.88rem;cursor:pointer">
          <input type="checkbox" id="filter-low" ${filterLow ? 'checked' : ''}> สินค้าใกล้หมด
        </label>
      </div>

      <!-- Items table -->
      <div class="table-wrap">
        ${items.length === 0
          ? '<p class="empty-text">ไม่พบอุปกรณ์</p>'
          : `<table class="data-table">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>หมวดหมู่</th>
                  <th>ทั้งหมด</th>
                  <th>พร้อมใช้</th>
                  <th>ซ่อม</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => {
                  const cat = allCategories.find(c => c.code === item.category_code);
                  return `
                    <tr class="${item.is_active === 0 ? 'item-inactive' : ''}">
                      <td>
                        ${item.image_r2_key
                          ? `<img src="${photoUrl(item.image_r2_key)}" alt="" style="width:32px;height:32px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:.4rem">`
                          : ''}
                        ${h(item.name)}
                        ${item.is_active === 0 ? '<span style="font-size:.75rem;color:var(--text-muted);margin-left:.3rem">(ปิดใช้งาน)</span>' : ''}
                      </td>
                      <td>${cat ? h(cat.name) : h(item.category_code ?? '-')}</td>
                      <td>${item.total_quantity}</td>
                      <td>${item.available_quantity}</td>
                      <td>${item.repair_quantity}</td>
                      <td>
                        <div class="actions-bar">
                          <button class="btn btn-outline-primary btn-sm do-edit" data-id="${h(String(item.id))}">แก้ไข</button>
                          <a href="admin-stock.html?id=${h(String(item.id))}" class="btn btn-sm" style="color:var(--info);border:1px solid var(--info)">สต็อก</a>
                          <button class="btn btn-danger btn-sm do-delete" data-id="${h(String(item.id))}" data-name="${h(item.name)}">ลบ</button>
                        </div>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>`}
      </div>`;

    bindEvents();
  }

  // ── event binding ──────────────────────────────────────────────────────────
  function bindEvents() {
    // Filters
    document.getElementById('filter-cat').addEventListener('change', e => {
      filterCat = e.target.value; renderPage();
    });
    document.getElementById('filter-search').addEventListener('input', e => {
      filterSearch = e.target.value; renderPage();
    });
    document.getElementById('filter-low').addEventListener('change', e => {
      filterLow = e.target.checked; renderPage();
    });

    // Add item
    document.getElementById('btn-add-item').addEventListener('click', () => openItemModal(null));

    // Edit item
    document.querySelectorAll('.do-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = allItems.find(i => String(i.id) === btn.dataset.id);
        if (item) openItemModal(item);
      });
    });

    // Delete item
    document.querySelectorAll('.do-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`ลบ "${btn.dataset.name}"?`)) return;
        try {
          await deleteItem(btn.dataset.id);
          allItems = allItems.filter(i => String(i.id) !== btn.dataset.id);
          renderPage();
        } catch (err) { alert(err.message); }
      });
    });

    // Add category
    document.getElementById('btn-add-cat').addEventListener('click', () => openCategoryModal(null));

    // Edit category
    document.querySelectorAll('.do-edit-cat').forEach(btn => {
      btn.addEventListener('click', () => openCategoryModal({ code: btn.dataset.code, name: btn.dataset.name }));
    });

    // Delete category
    document.querySelectorAll('.do-delete-cat').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`ลบหมวดหมู่ "${btn.dataset.name}" (${btn.dataset.code})?`)) return;
        try {
          await deleteCategory(btn.dataset.code);
          allCategories = allCategories.filter(c => c.code !== btn.dataset.code);
          renderPage();
        } catch (err) { alert(err.message); }
      });
    });
  }

  // ── item modal ─────────────────────────────────────────────────────────────
  function openItemModal(item) {
    const isEdit = Boolean(item);
    const val    = (f, fb = '') => item ? h(item[f] ?? fb) : fb;
    const catOpts = allCategories.map(c =>
      `<option value="${h(c.code)}" ${item && item.category_code === c.code ? 'selected' : ''}>${h(c.code)} – ${h(c.name)}</option>`
    ).join('');

    const close = openModal(isEdit ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่', `
      <div id="item-modal-error"></div>
      <form id="item-form" class="form">
        <div class="form-group">
          <label class="form-label">หมวดหมู่ <span class="form-required">*</span></label>
          <select class="form-input" name="category_code" required>
            <option value="">-- เลือกหมวดหมู่ --</option>
            ${catOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">ชื่อ <span class="form-required">*</span></label>
          <input class="form-input" name="name" required value="${val('name')}">
        </div>
        <div class="form-group">
          <label class="form-label">คำอธิบาย</label>
          <textarea class="form-textarea" name="description">${val('description')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">สถานที่เก็บ</label>
          <input class="form-input" name="stock_location" value="${val('stock_location')}">
        </div>
        <div class="form-group">
          <label class="form-label">หน่วย</label>
          <input class="form-input" name="unit" placeholder="เช่น ชิ้น, อัน, ชุด" value="${val('unit')}">
        </div>
        <div class="form-group">
          <label class="form-label">รูปภาพ</label>
          ${item && item.image_r2_key
            ? `<img id="current-img" src="${photoUrl(item.image_r2_key)}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:6px;display:block;margin-bottom:.4rem">`
            : ''}
          <input class="form-input" type="file" name="image" accept="image/*" id="image-input">
          <div id="upload-status" style="font-size:.82rem;color:var(--text-muted)"></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="item-submit-btn">บันทึก</button>
          <button type="button" class="btn btn-secondary" id="item-cancel-btn">ยกเลิก</button>
        </div>
      </form>`);

    document.getElementById('item-cancel-btn').addEventListener('click', close);

    document.getElementById('item-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd  = new FormData(e.target);
      const btn = document.getElementById('item-submit-btn');
      btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
      const errEl = document.getElementById('item-modal-error');
      errEl.innerHTML = '';

      try {
        let image_r2_key = item?.image_r2_key ?? undefined;
        const imageFile = fd.get('image');
        if (imageFile && imageFile.size > 0) {
          document.getElementById('upload-status').textContent = 'กำลังอัปโหลดรูป...';
          image_r2_key = await uploadPhoto(imageFile);
          document.getElementById('upload-status').textContent = '';
        }

        const data = {
          category_code: fd.get('category_code') || undefined,
          name:          fd.get('name'),
          description:   fd.get('description')    || undefined,
          stock_location:fd.get('stock_location') || undefined,
          unit:          fd.get('unit')            || undefined,
          image_r2_key,
        };

        if (isEdit) {
          const res = await updateItem(item.id, data);
          const updated = res.data ?? res;
          allItems = allItems.map(i => String(i.id) === String(item.id) ? { ...i, ...updated } : i);
        } else {
          const res = await createItem(data);
          const created = res.data ?? res;
          allItems.unshift(created);
        }
        close();
        renderPage();
      } catch (err) {
        errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'บันทึก';
      }
    });
  }

  // ── category modal ─────────────────────────────────────────────────────────
  function openCategoryModal(cat) {
    const isEdit = Boolean(cat);

    const close = openModal(isEdit ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่', `
      <div id="cat-modal-error"></div>
      <form id="cat-form" class="form">
        <div class="form-group">
          <label class="form-label">รหัสหมวดหมู่ (2 ตัวอักษร) <span class="form-required">*</span></label>
          <input class="form-input" name="code" maxlength="2" style="text-transform:uppercase"
            required placeholder="เช่น AV" value="${isEdit ? h(cat.code) : ''}"
            ${isEdit ? 'readonly style="background:var(--bg-secondary)"' : ''}>
        </div>
        <div class="form-group">
          <label class="form-label">ชื่อหมวดหมู่ <span class="form-required">*</span></label>
          <input class="form-input" name="name" required value="${isEdit ? h(cat.name) : ''}">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="cat-submit-btn">บันทึก</button>
          <button type="button" class="btn btn-secondary" id="cat-cancel-btn">ยกเลิก</button>
        </div>
      </form>`);

    document.getElementById('cat-cancel-btn').addEventListener('click', close);

    document.getElementById('cat-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd  = new FormData(e.target);
      const btn = document.getElementById('cat-submit-btn');
      btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
      const errEl = document.getElementById('cat-modal-error');
      errEl.innerHTML = '';

      const code = fd.get('code').toUpperCase().trim();
      const name = fd.get('name').trim();

      try {
        if (isEdit) {
          await updateCategory(cat.code, { name });
          allCategories = allCategories.map(c => c.code === cat.code ? { ...c, name } : c);
        } else {
          const res = await createCategory({ code, name });
          const created = res.data ?? { code, name };
          allCategories.push(created);
        }
        close();
        renderPage();
      } catch (err) {
        errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'บันทึก';
      }
    });
  }

  // ── kick off ───────────────────────────────────────────────────────────────
  await loadAll();
}

init();
