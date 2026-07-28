import { requireAuth } from '../auth.js';
import { getItems, getCategories, getNotifications, photoUrl } from '../api.js';
import { h, renderNavbar, showError } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  // Fetch unread count, items, and categories in parallel
  const [unread, itemsRes, catsRes] = await Promise.all([
    getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0),
    getItems({ limit: 100 }).catch(err => { showError(`โหลดอุปกรณ์ไม่สำเร็จ: ${err.message}`); return null; }),
    getCategories().catch(() => null),
  ]);

  renderNavbar(user, unread);

  if (!itemsRes) {
    app.innerHTML = '<div class="alert alert-error">ไม่สามารถโหลดข้อมูลอุปกรณ์ได้</div>';
    return;
  }

  const allItems   = itemsRes?.data ?? [];
  const categories = catsRes?.data ?? [];

  // Category lookup map for resolving category_code → name
  const catMap = {};
  categories.forEach(c => { catMap[c.code] = c.name || c.code; });

  function renderGrid(list) {
    if (!list || list.length === 0) {
      return '<p class="empty-text">ไม่พบอุปกรณ์</p>';
    }
    return `<div class="items-grid">
      ${list.map(item => {
        const qty = item.available_quantity ?? 0;
        const catName = item.category_code ? (catMap[item.category_code] || item.category_code) : null;
        return `
        <a href="item-detail.html?id=${h(item.id)}" class="item-card">
          ${item.photo_r2_key
            ? `<img class="item-card-img" src="${h(photoUrl(item.photo_r2_key))}" alt="${h(item.name)}">`
            : `<div class="item-card-placeholder">📦</div>`}
          <div class="item-card-body">
            <div class="item-card-name">${h(item.name)}</div>
            ${catName ? `<div class="item-card-cat">${h(catName)}</div>` : ''}
            <div class="item-card-qty">
              คงเหลือ: <span class="${qty > 0 ? 'qty-available' : ''}" style="${qty <= 0 ? 'color:var(--danger,#dc2626)' : ''}">${qty}</span>
            </div>
          </div>
        </a>`;
      }).join('')}
    </div>`;
  }

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">อุปกรณ์</h1>
    </div>
    <div class="filter-row">
      <input class="filter-select" id="search-input" type="search" placeholder="ค้นหาอุปกรณ์…" style="min-width:200px;">
      <select class="filter-select" id="cat-filter">
        <option value="">ทุกหมวดหมู่</option>
        ${categories.map(c => `<option value="${h(c.code)}">${h(c.name || c.code)}</option>`).join('')}
      </select>
    </div>
    <div id="items-container">${renderGrid(allItems)}</div>`;

  let debounceTimer = null;

  async function fetchAndRender() {
    const search  = document.getElementById('search-input').value.trim();
    const catCode = document.getElementById('cat-filter').value;
    const params  = { limit: 100 };
    if (search)  params.search        = search;
    if (catCode) params.category_code = catCode;

    document.getElementById('items-container').innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const res  = await getItems(params);
      const list = res?.data ?? [];
      document.getElementById('items-container').innerHTML = renderGrid(list);
    } catch (err) {
      document.getElementById('items-container').innerHTML =
        `<div class="alert alert-error">เกิดข้อผิดพลาด: ${h(err.message)}</div>`;
    }
  }

  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchAndRender, 300);
  });

  document.getElementById('cat-filter').addEventListener('change', () => {
    clearTimeout(debounceTimer);
    fetchAndRender();
  });
}

init();
