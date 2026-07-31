import { requireAuth } from '../auth.js';
import {
  getItems, createItem, updateItem, deleteItem,
  getCategories, createCategory, updateCategory, deleteCategory,
  uploadPhoto, getNotifications,
} from '../api.js';
import { h, showError, openModal, showConfirmModal, renderNavbar, loadAuthPhotos } from '../ui.js';

const PAGE_SIZE = 20;

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  const app    = document.getElementById('app');
  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  let allCategories = [];
  let currentItems  = [];
  let pagination    = { page: 1, limit: PAGE_SIZE, total: 0 };
  let page          = 1;
  let filterCat     = '';
  let filterSearch  = '';
  let filterLow     = false;

  // ── load categories (small set, fetch once) ────────────────────────────────
  async function loadCategories() {
    try {
      allCategories = (await getCategories()).data ?? [];
    } catch (err) { showError(err.message); }
  }

  // ── load items (server-side filter + pagination) ───────────────────────────
  async function loadItems() {
    const tbody  = document.getElementById('items-body');
    const pagDiv = document.getElementById('items-pagination');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem"><div class="spinner"></div></td></tr>`;
    if (pagDiv) pagDiv.innerHTML = '';
    try {
      const params = { page, limit: PAGE_SIZE };
      if (filterCat)    params.category_code = filterCat;
      if (filterSearch) params.search        = filterSearch;
      if (filterLow)    params.low_stock     = 'true';
      const res    = await getItems(params);
      currentItems = res.data       ?? [];
      pagination   = res.pagination ?? { page, limit: PAGE_SIZE, total: 0 };
      renderItems();
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-error">${h(err.message)}</div></td></tr>`;
    }
  }

  // ── render page shell (once) ───────────────────────────────────────────────
  function renderShell() {
    const catOpts = allCategories.map(c =>
      `<option value="${h(c.code)}"${filterCat === c.code ? ' selected' : ''}>${h(c.code)}: ${h(c.name)}</option>`
    ).join('');

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">จัดการอุปกรณ์</h1>
        <button class="btn btn-primary" id="btn-add-item">+ เพิ่มอุปกรณ์</button>
      </div>

      <!-- Categories card -->
      <div class="card" style="margin-bottom:1.25rem">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.85rem">
          <div class="card-title" style="margin:0">หมวดหมู่ <span style="font-size:.82rem;font-weight:400;color:var(--text-muted)">(${allCategories.length} หมวด)</span></div>
          <button class="btn btn-outline-primary btn-sm" id="btn-add-cat">+ เพิ่มหมวดหมู่</button>
        </div>
        <div id="cat-grid">
          ${renderCatGrid()}
        </div>
      </div>

      <!-- Filters -->
      <div style="display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem;align-items:center">
        <select class="filter-select" id="filter-cat" style="min-width:160px">
          <option value="">ทุกหมวดหมู่</option>
          ${catOpts}
        </select>
        <input class="form-input" id="filter-search" placeholder="ค้นหาชื่ออุปกรณ์…"
          value="${h(filterSearch)}" style="flex:1;min-width:180px;max-width:320px">
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.88rem;cursor:pointer;white-space:nowrap;user-select:none">
          <input type="checkbox" id="filter-low" ${filterLow ? 'checked' : ''}> สต็อกใกล้หมด
        </label>
        <span id="items-count" style="font-size:.82rem;color:var(--text-muted);margin-left:auto"></span>
      </div>

      <!-- Items table -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:56px"></th>
              <th>ชื่ออุปกรณ์</th>
              <th>หมวดหมู่</th>
              <th style="text-align:center">ทั้งหมด</th>
              <th style="text-align:center">พร้อมใช้</th>
              <th style="text-align:center">ซ่อม</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody id="items-body">
            <tr><td colspan="7" style="text-align:center;padding:2.5rem"><div class="spinner"></div></td></tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div id="items-pagination" style="display:flex;align-items:center;justify-content:center;gap:.75rem;margin-top:1rem;font-size:.88rem"></div>`;

    bindShellEvents();
  }

  // ── render category grid ───────────────────────────────────────────────────
  function renderCatGrid() {
    if (!allCategories.length) {
      return '<span style="color:var(--text-muted);font-size:.88rem">ยังไม่มีหมวดหมู่</span>';
    }
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.45rem">
      ${allCategories.map(c => `
        <div style="display:flex;align-items:center;gap:.5rem;padding:.45rem .65rem;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;min-width:0">
          <span style="font-family:monospace;font-size:.78rem;font-weight:700;color:var(--primary);background:#fdf2f2;padding:.15rem .4rem;border-radius:4px;flex-shrink:0;letter-spacing:.03em">${h(c.code)}</span>
          <span style="flex:1;font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${h(c.name)}">${h(c.name)}</span>
          <button class="btn btn-outline-primary btn-sm do-edit-cat" data-code="${h(c.code)}" data-name="${h(c.name)}" title="แก้ไข" style="padding:.2rem .45rem;flex-shrink:0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-danger btn-sm do-delete-cat" data-code="${h(c.code)}" data-name="${h(c.name)}" title="ลบ" style="padding:.2rem .45rem;flex-shrink:0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>`).join('')}
    </div>`;
  }

  // ── render items rows + pagination ─────────────────────────────────────────
  function renderItems() {
    const tbody  = document.getElementById('items-body');
    const pagDiv = document.getElementById('items-pagination');
    const count  = document.getElementById('items-count');
    if (!tbody) return;

    const { total } = pagination;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (count) count.textContent = `พบ ${total} รายการ`;

    if (!currentItems.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-muted)">ไม่พบอุปกรณ์</td></tr>`;
    } else {
      tbody.innerHTML = currentItems.map(item => {
        const cat      = allCategories.find(c => c.code === item.category_code);
        const lowStock = item.total_quantity > 0 && (item.available_quantity / item.total_quantity) < 0.2;
        return `
          <tr class="${item.is_active === 0 ? 'item-inactive' : ''}">
            <td style="padding:.4rem .5rem">
              ${item.image_r2_key
                ? `<img data-photo-key="${h(item.image_r2_key)}" alt=""
                     style="width:40px;height:40px;object-fit:cover;border-radius:6px;display:block;background:var(--bg-secondary)">`
                : `<div style="width:40px;height:40px;border-radius:6px;background:var(--bg-secondary);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">📦</div>`}
            </td>
            <td>
              <div style="font-weight:600;font-size:.9rem">
                ${h(item.name)}
                ${item.is_active === 0 ? '<span style="font-weight:400;font-size:.75rem;color:var(--text-muted);margin-left:.3rem">(ปิดใช้งาน)</span>' : ''}
              </div>
              <div style="font-family:monospace;font-size:.72rem;color:var(--text-muted);margin-top:.05rem">#${h(String(item.id))}</div>
              ${item.description ? `<div style="font-size:.75rem;color:var(--text-muted);margin-top:.05rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px">${h(item.description)}</div>` : ''}
              ${item.stock_location ? `<div style="font-size:.72rem;color:var(--text-muted);margin-top:.05rem">📍 ${h(item.stock_location)}</div>` : ''}
            </td>
            <td>
              ${cat
                ? `<span style="font-family:monospace;font-size:.77rem;font-weight:700;color:var(--primary);background:#fdf2f2;padding:.1rem .3rem;border-radius:3px">${h(cat.code)}</span>
                   <span style="font-size:.82rem;margin-left:.3rem">${h(cat.name)}</span>`
                : `<span style="font-size:.82rem;color:var(--text-muted)">${h(item.category_code ?? '-')}</span>`}
            </td>
            <td style="text-align:center;font-size:.88rem">${item.total_quantity ?? 0}</td>
            <td style="text-align:center;font-size:.88rem">
              <span${lowStock ? ' style="color:var(--error);font-weight:700"' : ''}>${item.available_quantity ?? 0}</span>
              ${lowStock ? ' <span style="font-size:.7rem;color:var(--error)" title="สต็อกใกล้หมด">⚠</span>' : ''}
            </td>
            <td style="text-align:center;font-size:.88rem">${item.repair_quantity ?? 0}</td>
            <td>
              <div class="actions-bar">
                <button class="btn btn-outline-primary btn-sm do-edit" data-id="${h(String(item.id))}">แก้ไข</button>
                <a href="admin-stock.html?id=${h(String(item.id))}" class="btn btn-sm" style="color:var(--info);border:1px solid var(--info)">สต็อก</a>
                <button class="btn btn-danger btn-sm do-delete" data-id="${h(String(item.id))}" data-name="${h(item.name)}">ลบ</button>
              </div>
            </td>
          </tr>`;
      }).join('');

      loadAuthPhotos(tbody);
    }

    // Pagination controls
    if (pagDiv) {
      if (totalPages <= 1) {
        pagDiv.innerHTML = '';
      } else {
        // Show up to 5 page buttons around current page
        const delta   = 2;
        const start   = Math.max(1, page - delta);
        const end     = Math.min(totalPages, page + delta);
        let pagBtns   = '';
        if (start > 1) pagBtns += `<button class="btn btn-sm btn-secondary pg-btn" data-page="1">1</button>${start > 2 ? '<span style="color:var(--text-muted)">…</span>' : ''}`;
        for (let p = start; p <= end; p++) {
          pagBtns += `<button class="btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'} pg-btn" data-page="${p}">${p}</button>`;
        }
        if (end < totalPages) pagBtns += `${end < totalPages - 1 ? '<span style="color:var(--text-muted)">…</span>' : ''}<button class="btn btn-sm btn-secondary pg-btn" data-page="${totalPages}">${totalPages}</button>`;

        pagDiv.innerHTML = `
          <button class="btn btn-sm btn-secondary" id="pg-prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
          ${pagBtns}
          <button class="btn btn-sm btn-secondary" id="pg-next" ${page >= totalPages ? 'disabled' : ''}>›</button>
          <span style="color:var(--text-muted);margin-left:.25rem">หน้า ${page}/${totalPages} · ${total} รายการ</span>`;

        document.getElementById('pg-prev')?.addEventListener('click', () => { page--; loadItems(); });
        document.getElementById('pg-next')?.addEventListener('click', () => { page++; loadItems(); });
        pagDiv.querySelectorAll('.pg-btn').forEach(btn =>
          btn.addEventListener('click', () => { page = parseInt(btn.dataset.page, 10); loadItems(); })
        );
      }
    }

    bindItemEvents();
  }

  // ── event binding ──────────────────────────────────────────────────────────
  function bindShellEvents() {
    document.getElementById('filter-cat').addEventListener('change', e => {
      filterCat = e.target.value; page = 1; loadItems();
    });

    let searchTimer;
    document.getElementById('filter-search').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { filterSearch = e.target.value; page = 1; loadItems(); }, 300);
    });

    document.getElementById('filter-low').addEventListener('change', e => {
      filterLow = e.target.checked; page = 1; loadItems();
    });

    document.getElementById('btn-add-item').addEventListener('click', () => openItemModal(null));
    document.getElementById('btn-add-cat').addEventListener('click', () => openCategoryModal(null));

    document.getElementById('cat-grid').addEventListener('click', e => {
      const editBtn = e.target.closest('.do-edit-cat');
      const delBtn  = e.target.closest('.do-delete-cat');
      if (editBtn) openCategoryModal({ code: editBtn.dataset.code, name: editBtn.dataset.name });
      if (delBtn)  handleDeleteCat(delBtn.dataset.code, delBtn.dataset.name);
    });
  }

  function bindItemEvents() {
    document.querySelectorAll('.do-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = currentItems.find(i => String(i.id) === btn.dataset.id);
        if (item) openItemModal(item);
      });
    });
    document.querySelectorAll('.do-delete').forEach(btn => {
      btn.addEventListener('click', () => handleDeleteItem(btn.dataset.id, btn.dataset.name));
    });
  }

  function handleDeleteItem(id, name) {
    showConfirmModal(`ลบอุปกรณ์ "${name}"?`, async () => {
      try { await deleteItem(id); await loadItems(); }
      catch (err) { showError(err.message); }
    }, { title: 'ยืนยันการลบ', confirmLabel: 'ลบ', confirmClass: 'btn-danger' });
  }

  function handleDeleteCat(code, name) {
    showConfirmModal(`ลบหมวดหมู่ "${name}" (${code})?`, async () => {
      try {
        await deleteCategory(code);
        allCategories = allCategories.filter(c => c.code !== code);
        const grid = document.getElementById('cat-grid');
        if (grid) grid.innerHTML = renderCatGrid();
      } catch (err) { showError(err.message); }
    }, { title: 'ยืนยันการลบ', confirmLabel: 'ลบ', confirmClass: 'btn-danger' });
  }

  // ── item modal ─────────────────────────────────────────────────────────────
  function openItemModal(item) {
    const isEdit  = Boolean(item);
    const val     = (f, fb = '') => item ? h(String(item[f] ?? fb)) : fb;
    const catOpts = allCategories.map(c =>
      `<option value="${h(c.code)}"${item?.category_code === c.code ? ' selected' : ''}>${h(c.code)} – ${h(c.name)}</option>`
    ).join('');

    const close = openModal(isEdit ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่', `
      <div id="item-modal-error"></div>
      <form id="item-form" class="form" style="padding:0">
        <div class="form-group">
          <label class="form-label">หมวดหมู่ <span class="form-required">*</span></label>
          <select class="form-select" name="category_code" required>
            <option value="">-- เลือกหมวดหมู่ --</option>
            ${catOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">ชื่ออุปกรณ์ <span class="form-required">*</span></label>
          <input class="form-input" name="name" required value="${val('name')}">
        </div>
        <div class="form-group">
          <label class="form-label">คำอธิบาย</label>
          <textarea class="form-textarea" name="description" rows="2">${val('description')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">สถานที่เก็บ</label>
            <input class="form-input" name="stock_location" placeholder="เช่น ชั้น A3" value="${val('stock_location')}">
          </div>
          <div class="form-group">
            <label class="form-label">หน่วย</label>
            <input class="form-input" name="unit" placeholder="เช่น ชิ้น, ชุด" value="${val('unit')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">รูปภาพ</label>
          ${item?.image_r2_key
            ? `<img data-photo-key="${h(item.image_r2_key)}" id="current-img" alt=""
                 style="width:80px;height:80px;object-fit:cover;border-radius:8px;display:block;margin-bottom:.5rem;background:var(--bg-secondary)">`
            : ''}
          <input class="form-input" type="file" name="image" accept="image/*" id="image-input">
          <div id="upload-status" style="font-size:.82rem;color:var(--text-muted);margin-top:.25rem"></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="item-submit-btn">บันทึก</button>
          <button type="button" class="btn btn-secondary" id="item-cancel-btn">ยกเลิก</button>
        </div>
      </form>`);

    const modalEl = document.querySelector('#modal-root .modal-box') ?? document;
    loadAuthPhotos(modalEl);

    document.getElementById('item-cancel-btn').addEventListener('click', close);

    document.getElementById('item-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd    = new FormData(e.target);
      const btn   = document.getElementById('item-submit-btn');
      const errEl = document.getElementById('item-modal-error');
      btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
      errEl.innerHTML = '';

      try {
        let image_r2_key = item?.image_r2_key ?? undefined;
        const imageFile  = fd.get('image');
        if (imageFile?.size > 0) {
          document.getElementById('upload-status').textContent = 'กำลังอัปโหลดรูป…';
          image_r2_key = await uploadPhoto(imageFile);
          document.getElementById('upload-status').textContent = '';
        }

        const data = {
          category_code:  fd.get('category_code') || undefined,
          name:           fd.get('name'),
          description:    fd.get('description')    || undefined,
          stock_location: fd.get('stock_location') || undefined,
          unit:           fd.get('unit')            || undefined,
          image_r2_key,
        };

        if (isEdit) {
          await updateItem(item.id, data);
        } else {
          await createItem(data);
        }
        close();
        await loadItems();
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
      <form id="cat-form" class="form" style="padding:0">
        <div class="form-group">
          <label class="form-label">รหัส (2 ตัวอักษร) <span class="form-required">*</span></label>
          <input class="form-input" name="code" maxlength="2" placeholder="เช่น AV"
            style="text-transform:uppercase;width:100px"
            value="${isEdit ? h(cat.code) : ''}"
            ${isEdit ? 'readonly' : 'required'}>
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
      const fd    = new FormData(e.target);
      const btn   = document.getElementById('cat-submit-btn');
      const errEl = document.getElementById('cat-modal-error');
      btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
      errEl.innerHTML = '';

      const code = fd.get('code').toUpperCase().trim();
      const name = fd.get('name').trim();

      try {
        if (isEdit) {
          await updateCategory(cat.code, { name });
          allCategories = allCategories.map(c => c.code === cat.code ? { ...c, name } : c);
        } else {
          const res = await createCategory({ code, name });
          allCategories.push(res.data ?? { code, name });
          allCategories.sort((a, b) => a.code.localeCompare(b.code));
        }
        const grid = document.getElementById('cat-grid');
        if (grid) grid.innerHTML = renderCatGrid();
        close();
      } catch (err) {
        errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'บันทึก';
      }
    });
  }

  // ── bootstrap ──────────────────────────────────────────────────────────────
  await loadCategories();
  renderShell();
  await loadItems();
}

init();
