import { requireAuth } from '../auth.js';
import {
  getRequest, getItems, getCategories, addRequestItem, getNotifications, photoUrl,
} from '../api.js';
import { h, renderNavbar } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('request_id');
  if (!requestId) { window.location.href = 'requests.html'; return; }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  // Load request + categories first (items fetched separately)
  let request, categories;
  try {
    const [reqRes, catsRes] = await Promise.all([
      getRequest(requestId),
      getCategories().catch(() => ({ data: [] })),
    ]);
    request    = reqRes?.data;
    categories = catsRes?.data ?? [];
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  if (!request || request.status !== 'draft') {
    window.location.href = `request-detail.html?id=${encodeURIComponent(requestId)}`;
    return;
  }

  const catMap = {};
  categories.forEach(c => { catMap[c.code] = c.name || c.code; });

  // cart state: item_id → quantity_requested (updated locally on each add)
  let cartItems = {};
  (request.items ?? []).forEach(it => {
    cartItems[String(it.item_id || it.id)] = it.quantity_requested ?? 0;
  });

  const backUrl = `request-detail.html?id=${encodeURIComponent(requestId)}`;

  function cartCount() { return Object.keys(cartItems).length; }
  function updateCartBadge() {
    const el = document.getElementById('cart-badge');
    if (el) el.textContent = `ตะกร้า (${cartCount()})`;
  }

  function renderGrid(list) {
    if (!list || list.length === 0) {
      return '<p class="empty-text">ไม่พบอุปกรณ์</p>';
    }
    return `<div class="items-grid">
      ${list.map(item => {
        const avail   = item.available_quantity ?? 0;
        const catName = item.category_code ? (catMap[item.category_code] || item.category_code) : null;
        const iid     = String(item.id);
        const inCart  = cartItems[iid];
        const unit    = h(item.item_unit || item.unit || 'ชิ้น');
        return `
          <div class="item-card" style="cursor:default">
            ${item.photo_r2_key
              ? `<img class="item-card-img" src="${h(photoUrl(item.photo_r2_key))}" alt="${h(item.name)}">`
              : `<div class="item-card-placeholder">📦</div>`}
            <div class="item-card-body">
              <div class="item-card-name">${h(item.name)}</div>
              ${catName ? `<div class="item-card-cat">${h(catName)}</div>` : ''}
              <div class="item-card-qty">
                คงเหลือ:
                <span ${avail > 0 ? 'class="qty-available"' : 'style="color:var(--danger,#dc2626)"'}>${avail}</span>
                ${unit}
              </div>
              ${inCart != null
                ? `<div class="browse-incart" data-item-id="${iid}"
                    style="font-size:.78em;color:var(--primary);font-weight:600;margin:.3rem 0">
                    ✓ ในตะกร้า ${inCart} ${unit}
                  </div>`
                : `<div class="browse-incart" data-item-id="${iid}"
                    style="font-size:.78em;color:var(--primary);font-weight:600;margin:.3rem 0;display:none">
                  </div>`}
              ${avail > 0
                ? `<div style="display:flex;gap:.35rem;align-items:center;margin-top:.4rem">
                    <input type="number" class="form-input browse-qty" data-item-id="${iid}"
                      min="1" max="${avail}" value="1"
                      style="width:52px;font-size:.82em;padding:.2rem .3rem;text-align:center;flex-shrink:0">
                    <button class="btn btn-primary btn-sm browse-add"
                      data-item-id="${iid}" data-unit="${unit}"
                      style="flex:1;font-size:.82em">
                      ${inCart != null ? '+ เพิ่มเติม' : '+ เพิ่ม'}
                    </button>
                  </div>
                  <div class="browse-msg" data-item-id="${iid}"
                    style="font-size:.78em;min-height:1em;margin-top:.2rem"></div>`
                : `<div style="font-size:.82em;color:var(--text-muted);margin-top:.5rem">หมดชั่วคราว</div>`}
            </div>
          </div>`;
      }).join('')}
    </div>`;
  }

  const PAGE_SIZE = 30;
  let currentPage = 1;
  let totalPages  = 1;
  let searchVal   = '';
  let catVal      = '';
  let debounce    = null;

  // ── Server-side fetch + render ────────────────────────────────────────────
  async function fetchAndRender(page = 1) {
    const container = document.getElementById('items-container');
    const pagBar    = document.getElementById('pagination-bar');
    if (!container) return;
    container.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    if (pagBar) pagBar.innerHTML = '';
    try {
      const p = { limit: PAGE_SIZE, page };
      if (searchVal) p.search        = searchVal;
      if (catVal)    p.category_code = catVal;
      const res        = await getItems(p);
      const list       = res?.data ?? [];
      const pagination = res?.pagination ?? {};
      totalPages  = Math.ceil((pagination.total ?? list.length) / PAGE_SIZE) || 1;
      currentPage = pagination.page ?? page;
      container.innerHTML = renderGrid(list);
      bindAddBtns();
      renderPagination();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  function renderPagination() {
    const el = document.getElementById('pagination-bar');
    if (!el || totalPages <= 1) { if (el) el.innerHTML = ''; return; }

    // Build visible page numbers with ellipsis
    function pageNums() {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
      const pages = new Set([1, totalPages]);
      for (let d = -2; d <= 2; d++) {
        const p = currentPage + d;
        if (p >= 1 && p <= totalPages) pages.add(p);
      }
      const sorted = [...pages].sort((a, b) => a - b);
      const result = [];
      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
        result.push(sorted[i]);
      }
      return result;
    }

    const btnBase  = 'style="min-width:2.2rem;height:2.2rem;padding:0 .5rem;font-size:.88em;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:background .15s"';
    const btnActive = 'style="min-width:2.2rem;height:2.2rem;padding:0 .5rem;font-size:.88em;border-radius:6px;border:1px solid var(--primary);background:var(--primary);color:#fff;cursor:default;font-weight:600"';

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:.35rem;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border);flex-wrap:wrap">
        <button class="pg-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''} ${btnBase}>‹</button>
        ${pageNums().map(p =>
          p === '…'
            ? `<span style="padding:0 .25rem;color:var(--text-muted)">…</span>`
            : `<button class="pg-btn" data-page="${p}" ${p === currentPage ? 'disabled ' + btnActive : btnBase}>${p}</button>`
        ).join('')}
        <button class="pg-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''} ${btnBase}>›</button>
      </div>`;

    el.querySelectorAll('.pg-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page);
        if (p >= 1 && p <= totalPages) {
          fetchAndRender(p);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  // ── Page shell ────────────────────────────────────────────────────────────
  app.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
      <a href="${h(backUrl)}" class="back-btn" style="margin-bottom:0">← ${h(request.name || 'คำขอยืม')}</a>
      <a href="${h(backUrl)}" id="cart-badge" class="btn btn-primary" style="font-size:.9em">
        ตะกร้า (${cartCount()})
      </a>
    </div>

    <div class="filter-row" style="margin-bottom:1rem">
      <input class="filter-select" id="search-input" type="search"
        placeholder="ค้นหาอุปกรณ์…" style="min-width:200px;">
      <select class="filter-select" id="cat-filter">
        <option value="">ทุกหมวดหมู่</option>
        ${categories.map(c => `<option value="${h(c.code)}">${h(c.name || c.code)}</option>`).join('')}
      </select>
    </div>

    <div id="items-container"></div>
    <div id="pagination-bar"></div>`;

  // Initial load
  fetchAndRender(1);

  document.getElementById('search-input').addEventListener('input', e => {
    searchVal = e.target.value.trim();
    clearTimeout(debounce);
    debounce = setTimeout(() => fetchAndRender(1), 300);
  });

  document.getElementById('cat-filter').addEventListener('change', e => {
    catVal = e.target.value;
    clearTimeout(debounce);
    fetchAndRender(1);
  });

  // ── Add-to-cart ───────────────────────────────────────────────────────────
  function bindAddBtns() {
    document.querySelectorAll('.browse-add').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.itemId;
        const unit   = btn.dataset.unit;
        const qtyEl  = document.querySelector(`.browse-qty[data-item-id="${itemId}"]`);
        const qty    = parseInt(qtyEl?.value) || 1;
        const msgEl  = document.querySelector(`.browse-msg[data-item-id="${itemId}"]`);

        btn.disabled = true;
        if (msgEl) msgEl.innerHTML = '';

        try {
          const res  = await addRequestItem(requestId, { item_id: itemId, quantity_requested: qty });
          const warn = res?.warnings ?? [];

          cartItems[itemId] = (cartItems[itemId] ?? 0) + qty;
          updateCartBadge();

          const inCartEl = document.querySelector(`.browse-incart[data-item-id="${itemId}"]`);
          if (inCartEl) {
            inCartEl.textContent = `✓ ในตะกร้า ${cartItems[itemId]} ${unit}`;
            inCartEl.style.display = '';
          }
          btn.textContent = '+ เพิ่มเติม';

          if (msgEl) {
            const warnHtml = warn.map(w => `<div style="color:orange">${h(w)}</div>`).join('');
            msgEl.innerHTML = `<span style="color:green">เพิ่มแล้ว ✓</span>${warnHtml}`;
            setTimeout(() => { if (msgEl) msgEl.innerHTML = ''; }, 2500);
          }
        } catch (err) {
          if (msgEl) msgEl.innerHTML = `<span style="color:var(--error,#dc2626)">${h(err.message)}</span>`;
        }

        btn.disabled = false;
      });
    });
  }
}

init();
