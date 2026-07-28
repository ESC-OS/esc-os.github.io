import { requireAuth } from '../auth.js';
import { getNotifications, markNotifRead, markAllRead } from '../api.js';
import { h, formatDateTime, renderNavbar, showError } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  let page = 1;

  async function renderPage() {
    app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

    // Fetch unread count and current page notifications in parallel
    const [unreadRes, notifRes] = await Promise.all([
      getNotifications(1, 1).catch(() => null),
      getNotifications(page, 20).catch(err => { showError(`เกิดข้อผิดพลาด: ${err.message}`); return null; }),
    ]);

    if (!notifRes) {
      app.innerHTML = '<div class="alert alert-error">ไม่สามารถโหลดการแจ้งเตือนได้</div>';
      return;
    }

    const notifications = notifRes?.notifications ?? [];
    const pagination    = notifRes?.pagination ?? { page, limit: 20, total: 0, unread: 0 };
    const unread        = unreadRes?.pagination?.unread ?? pagination.unread ?? 0;
    const totalPages    = Math.max(1, Math.ceil(pagination.total / (pagination.limit || 20)));

    renderNavbar(user, unread);

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">
          การแจ้งเตือน${unread > 0 ? ` <span class="badge-count">${unread > 99 ? '99+' : unread}</span>` : ''}
        </h1>
        <div class="page-header-actions">
          ${unread > 0
            ? `<button class="btn btn-secondary btn-sm" id="mark-all-btn">อ่านทั้งหมด</button>`
            : ''}
        </div>
      </div>

      ${notifications.length === 0
        ? '<p class="empty-text">ไม่มีการแจ้งเตือน</p>'
        : `<div class="notif-list">
            ${notifications.map(n => `
              <div class="notif-item ${n.is_read === 0 ? 'unread' : ''}" data-id="${h(String(n.id))}">
                <div class="notif-title">${h(n.title ?? '')}</div>
                <div class="notif-body">${h(n.body ?? '')}</div>
                <div class="notif-date">${formatDateTime(n.created_at)}</div>
              </div>`).join('')}
          </div>`}

      ${totalPages > 1
        ? `<div class="pagination">
             <button class="btn btn-secondary btn-sm" id="prev-btn" ${page <= 1 ? 'disabled' : ''}>← ก่อนหน้า</button>
             <span class="pagination-info">หน้า ${page} / ${totalPages}</span>
             <button class="btn btn-secondary btn-sm" id="next-btn" ${page >= totalPages ? 'disabled' : ''}>ถัดไป →</button>
           </div>`
        : ''}`;

    // Click each notification: mark read, remove .unread class
    app.querySelectorAll('.notif-item').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', async () => {
        if (el.classList.contains('unread')) {
          el.classList.remove('unread');
          await markNotifRead(el.dataset.id).catch(() => {});
          // Update topbar badge
          const badge = document.querySelector('.topbar-badge');
          const dot   = document.querySelector('.sidebar-notif-dot');
          if (badge) {
            const cur = parseInt(badge.textContent, 10);
            if (!isNaN(cur) && cur > 1) badge.textContent = cur - 1;
            else badge.remove();
          }
          if (dot) {
            const cur = parseInt(dot.textContent, 10);
            if (!isNaN(cur) && cur > 1) dot.textContent = cur - 1;
            else dot.remove();
          }
        }
      });
    });

    // Mark all read
    document.getElementById('mark-all-btn')?.addEventListener('click', async () => {
      try {
        await markAllRead();
        await renderPage();
      } catch (err) {
        showError(`เกิดข้อผิดพลาด: ${err.message}`);
      }
    });

    // Pagination
    document.getElementById('prev-btn')?.addEventListener('click', () => {
      if (page > 1) { page--; renderPage(); }
    });
    document.getElementById('next-btn')?.addEventListener('click', () => {
      if (page < totalPages) { page++; renderPage(); }
    });
  }

  await renderPage();
}

init();
