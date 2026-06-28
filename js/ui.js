// Escape HTML to prevent XSS
export function h(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Status badge HTML
const STATUS_LABELS = {
  draft:'ร่าง', pending:'รอดำเนินการ', processing:'กำลังดำเนินการ',
  ready_for_pickup:'พร้อมรับ', in_lend:'กำลังยืม', overdue:'เกินกำหนด',
  returned:'คืนแล้ว', completed:'เสร็จสิ้น', rejected:'ถูกปฏิเสธ',
  cancelled:'ยกเลิกแล้ว', return_rejected:'คืนถูกปฏิเสธ', archived:'เก็บถาวร',
};
export function statusBadge(status) {
  return `<span class="badge badge-${h(status)}">${h(STATUS_LABELS[status] || status)}</span>`;
}

// Project status badge
const PROJECT_STATUS_MAP = {
  active:   ['badge-ready_for_pickup', 'กำลังดำเนินการ'],
  upcoming: ['badge-processing',       'กำลังจะมาถึง'],
  ended:    ['badge-cancelled',        'สิ้นสุดแล้ว'],
  archived: ['badge-draft',            'เก็บถาวร'],
};
export function projectStatusBadge(status) {
  const [cls, label] = PROJECT_STATUS_MAP[status] ?? ['badge-draft', status];
  return `<span class="badge ${h(cls)}">${label}</span>`;
}

// Date formatting
export function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' });
}
export function formatDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
export function formatCountdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'หมดเวลา';
  const days  = Math.floor(ms / 864e5);
  const hours = Math.floor((ms % 864e5) / 36e5);
  const mins  = Math.floor((ms % 36e5) / 6e4);
  if (days > 0) return `เหลือ ${days} วัน ${hours} ชั่วโมง`;
  return `เหลือ ${hours} ชั่วโมง ${mins} นาที`;
}

// Show a toast-like alert at top of #app
export function showError(msg) {
  const el = document.createElement('div');
  el.className = 'alert alert-error';
  el.style.marginBottom = '1rem';
  el.textContent = msg;
  const app = document.getElementById('app');
  app.prepend(el);
  setTimeout(() => el.remove(), 5000);
}

// Fixed-position toast that auto-dismisses
export function showToast(msg, type = 'success') {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .2s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 220);
  }, 2500);
}

// Custom confirm dialog — returns Promise<boolean>
export function showConfirm(message, { subtext = '', confirmText = 'ยืนยัน', cancelText = 'ยกเลิก', danger = false } = {}) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'modal-overlay confirm-overlay';
    el.innerHTML = `
      <div class="modal-box confirm-box">
        <div class="confirm-msg">${h(message)}</div>
        ${subtext ? `<div class="confirm-sub">${h(subtext)}</div>` : ''}
        <div class="confirm-actions">
          <button class="btn btn-secondary confirm-cancel">${h(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} confirm-ok">${h(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const done = (result) => { el.remove(); resolve(result); };
    el.querySelector('.confirm-ok').addEventListener('click', () => done(true));
    el.querySelector('.confirm-cancel').addEventListener('click', () => done(false));
    el.addEventListener('click', e => { if (e.target === el) done(false); });
  });
}

// Render the footer (idempotent — only inserts once)
function renderFooter() {
  if (document.getElementById('site-footer')) return;
  const footer = document.createElement('footer');
  footer.id = 'site-footer';
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="footer-inner">
      <div class="footer-col">
        <div class="footer-brand">
          <img src="/public/ESC_logo.png" alt="กวศ.">
          <span class="footer-brand-name">Operation Support</span>
        </div>
        <p class="footer-desc">
          ระบบยืม-คืนอุปกรณ์<br>
          งานพัสดุและสำนักงาน คณะวิศวกรรมศาสตร์<br>
          จุฬาลงกรณ์มหาวิทยาลัย
        </p>
      </div>
      <div class="footer-col">
        <div class="footer-heading">เมนู</div>
        <div class="footer-links">
          <a href="/dashboard/">หน้าแรก</a>
          <a href="/items/">สต๊อกอุปกรณ์</a>
          <a href="/requests/">คำขอยืม</a>
          <a href="/projects/">โครงการ</a>
        </div>
      </div>
      <div class="footer-col">
        <div class="footer-heading">ข้อมูล</div>
        <div class="footer-links">
          <a href="/policy/">Policy</a>
          <a href="/contact/">Contact Us</a>
        </div>
      </div>
      <div class="footer-col">
        <div class="footer-heading">ติดต่อ</div>
        <p class="footer-desc">
          อีเมล: operation.support@eng.chula.ac.th<br>
          โทร: 0-2218-6000<br>
          จันทร์ – ศุกร์ 08:30 – 16:30 น.
        </p>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} Faculty of Engineering, Chulalongkorn University. All rights reserved.</span>
    </div>`;
  const modal = document.getElementById('modal-root');
  if (modal) modal.before(footer);
  else document.body.appendChild(footer);
}

// Render the navbar
// status: { unread_notifications, pending_requests, pending_returns, overdue_requests, pending_visits }
export function renderNavbar(user, status = {}) {
  const root = document.getElementById('navbar-root');
  if (!root || !user) return;
  const seg     = '/' + (window.location.pathname.split('/').filter(Boolean)[0] || '');
  const active  = (path) => seg === path ? 'active' : '';
  const isStaff = user.role === 'staff' || user.role === 'admin';

  const unread       = status.unread_notifications ?? 0;
  const pendingReq   = status.pending_requests      ?? 0;
  const pendingRet   = status.pending_returns       ?? 0;
  const overdue      = status.overdue_requests      ?? 0;
  const pendingVisit = status.pending_visits        ?? 0;
  const reqTotal     = pendingReq + overdue;

  function adminBadge(count, danger = false) {
    if (!count) return '';
    return `<span class="nav-admin-badge${danger ? ' badge-danger' : ''}">${count > 99 ? '99+' : count}</span>`;
  }

  root.innerHTML = `
    <nav class="nav">
      <div class="nav-inner">
        <a href="/dashboard/" class="nav-brand">
          <img src="/public/ESC_logo.png" alt="กวศ.">
          <span class="nav-brand-name">Operation Support</span>
        </a>
        <div class="nav-links">
          <a href="/dashboard/"  class="nav-link ${active('/dashboard')}">หน้าแรก</a>
          <a href="/projects/"   class="nav-link ${active('/projects')}">โครงการ</a>
          <a href="/items/"      class="nav-link ${active('/items')}">สต๊อก</a>
          <a href="/requests/"   class="nav-link ${active('/requests')}">คำขอ</a>
          <a href="/visits/"     class="nav-link ${active('/visits')}">นัดชม</a>
          <a href="/policy/"     class="nav-link ${active('/policy')}">Policy</a>
          <a href="/contact/"    class="nav-link ${active('/contact')}">Contact Us</a>
          ${isStaff ? `
            <span class="nav-divider"></span>
            <a href="/admin-calendar/" class="nav-link nav-link-admin ${active('/admin-calendar')}">ปฏิทิน</a>
            <a href="/admin-requests/" class="nav-link nav-link-admin ${active('/admin-requests')}">คำขอ${adminBadge(reqTotal, overdue > 0)}</a>
            <a href="/admin-returns/"  class="nav-link nav-link-admin ${active('/admin-returns')}">การคืน${adminBadge(pendingRet)}</a>
            <a href="/admin-visits/"   class="nav-link nav-link-admin ${active('/admin-visits')}">นัดชม${adminBadge(pendingVisit)}</a>
            <a href="/admin-items/"    class="nav-link nav-link-admin ${active('/admin-items')}">คลัง</a>
            ${user.role === 'admin' ? `<a href="/admin-users/" class="nav-link nav-link-admin ${active('/admin-users')}">ผู้ใช้</a>` : ''}
          ` : ''}
        </div>
        <div class="nav-right">
          <a href="/notifications/" class="nav-bell${seg === '/notifications' ? ' active' : ''}" title="การแจ้งเตือน">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            ${unread > 0 ? `<span class="nav-notif-dot">${unread > 99 ? '99+' : unread}</span>` : ''}
            <span class="nav-bell-label">การแจ้งเตือน</span>
          </a>
          <a href="/profile/" class="nav-profile-link${seg === '/profile' ? ' active' : ''}">
            ${user.avatar_url
              ? `<img src="${h(user.avatar_url)}" alt="${h(user.name)}" class="nav-avatar">`
              : `<div class="nav-avatar-placeholder">${h(user.name.charAt(0).toUpperCase())}</div>`
            }
            <span class="nav-profile-name">${h(user.name)}</span>
          </a>
          <button class="nav-logout" id="nav-logout-btn">ออกจากระบบ</button>
        </div>
      </div>
    </nav>`;

  renderFooter();
}

// Open a modal (appends to #modal-root, returns close function)
// Options: { wide: true } expands to 580px for forms with two-column rows
export function openModal(titleText, bodyHtml, { wide = false, onClose } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-box${wide ? ' modal-box-wide' : ''}">
        <div class="modal-title">${h(titleText)}</div>
        ${bodyHtml}
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; onClose?.(); };
  root.querySelector('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') close();
  });
  return close;
}
