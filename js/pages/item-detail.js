import { requireAuth } from '../auth.js';
import { getItem, getNotifications, photoUrl } from '../api.js';
import { h, formatDateTime, renderNavbar, showError } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.href = 'items.html'; return; }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  // Fetch unread count and item in parallel
  const [unread, itemRes] = await Promise.all([
    getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0),
    getItem(id).catch(err => { showError(`โหลดอุปกรณ์ไม่สำเร็จ: ${err.message}`); return null; }),
  ]);

  renderNavbar(user, unread);

  if (!itemRes) {
    app.innerHTML = '<div class="alert alert-error">ไม่สามารถโหลดข้อมูลอุปกรณ์ได้</div>';
    return;
  }

  const item = itemRes?.data ?? itemRes?.item;

  if (!item) {
    app.innerHTML = '<div class="alert alert-error">ไม่พบอุปกรณ์</div>';
    return;
  }

  const qty = item.available_quantity ?? 0;

  app.innerHTML = `
    <button class="back-btn" onclick="history.back()">← อุปกรณ์</button>

    <div class="card item-detail-card" style="display:flex;flex-direction:row;gap:2rem;align-items:flex-start;flex-wrap:wrap;">
      <div style="flex:0 0 auto;">
        ${item.photo_r2_key
          ? `<img class="item-detail-img" src="${h(photoUrl(item.photo_r2_key))}" alt="${h(item.name)}" style="width:280px;height:300px;object-fit:cover;border-radius:8px;">`
          : `<div class="item-detail-placeholder" style="width:280px;height:300px;display:flex;align-items:center;justify-content:center;background:var(--surface-2,#f3f4f6);border-radius:8px;font-size:5rem;">📦</div>`}
      </div>

      <div class="item-detail-body" style="flex:1;min-width:200px;">
        <h2 class="item-detail-name">${h(item.name)}</h2>

        ${item.category_code ? `<span class="item-tag">${h(item.category_code)}</span>` : ''}

        ${item.description ? `<p class="item-description">${h(item.description)}</p>` : ''}

        <div class="item-stats">
          <div class="item-stat">
            <span class="item-stat-label">ทั้งหมด</span>
            <span class="item-stat-value">${item.total_quantity ?? '-'}</span>
          </div>
          <div class="item-stat">
            <span class="item-stat-label">คงเหลือ</span>
            <span class="item-stat-value ${qty > 0 ? 'stat-green' : 'stat-red'}">${qty}</span>
          </div>
          <div class="item-stat">
            <span class="item-stat-label">ซ่อม</span>
            <span class="item-stat-value">${item.repair_quantity ?? 0}</span>
          </div>
        </div>

        <div style="margin-top:1rem;">
          ${item.location ? `
            <div class="info-row">
              <span class="info-label">ที่ตั้ง</span>
              <span>${h(item.location)}</span>
            </div>` : ''}
          ${item.unit ? `
            <div class="info-row">
              <span class="info-label">หน่วย</span>
              <span>${h(item.unit)}</span>
            </div>` : ''}
          ${item.updated_at ? `
            <div class="info-row">
              <span class="info-label">แก้ไขล่าสุด</span>
              <span>${formatDateTime(item.updated_at)}</span>
            </div>` : ''}
        </div>

        <div style="margin-top:1.5rem;">
          <a href="new-request.html" class="btn btn-primary">+ เพิ่มในคำขอยืม</a>
        </div>
      </div>
    </div>`;
}

init();
