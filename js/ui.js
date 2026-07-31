import { postLogout, getRequests, getAllReturns, getVisits, fetchPhotoUrl } from './api.js';
import { initDatePickers } from './datepicker.js';

// Escape HTML to prevent XSS
export function h(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Status badge HTML
const STATUS_LABELS = {
  draft:'ร่าง', pending:'รอดำเนินการ', processing:'กำลังดำเนินการ',
  ready_for_pickup:'พร้อมรับ', in_lend:'กำลังยืม',
  returned:'คืนแล้ว', completed:'เสร็จสิ้น', rejected:'ถูกปฏิเสธ', cancelled:'ยกเลิกแล้ว',
  approved:'อนุมัติแล้ว', confirmed:'ยืนยันแล้ว', deposited:'รับฝากแล้ว', donated:'บริจาคแล้ว', in_use:'กำลังใช้งาน',
};
export function statusBadge(status) {
  return `<span class="badge badge-${h(status)}">${h(STATUS_LABELS[status] || status)}</span>`;
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

// Load all [data-photo-key] images in a container with auth headers
export function loadAuthPhotos(container = document) {
  container.querySelectorAll('img[data-photo-key]').forEach(async img => {
    const url = await fetchPhotoUrl(img.dataset.photoKey).catch(() => null);
    if (url) img.src = url;
    else img.style.display = 'none';
  });
}

// Show a fixed-position toast error (always visible regardless of scroll position)
export function showError(msg) {
  const el = document.createElement('div');
  el.className = 'alert alert-error toast-error';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// Bell SVG icon for topbar
const _BELL_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

// Render the sidebar navigation + topbar + footer
export function renderNavbar(user, unread = 0) {
  const root = document.getElementById('navbar-root');
  if (!root || !user) return;

  document.body.classList.add('has-sidebar');

  // Wrap #app in #right-pane (topbar → #app → footer)
  const appEl = document.getElementById('app');
  let rightPane = document.getElementById('right-pane');
  if (!rightPane && appEl) {
    rightPane = document.createElement('div');
    rightPane.id = 'right-pane';
    appEl.parentNode.insertBefore(rightPane, appEl);
    rightPane.appendChild(appEl);
  }

  // Inject topbar before #app
  let topbarEl = document.getElementById('topbar');
  if (!topbarEl && rightPane) {
    topbarEl = document.createElement('header');
    topbarEl.id = 'topbar';
    rightPane.insertBefore(topbarEl, appEl);
  }

  // Inject footer after #app
  let footerEl = document.getElementById('site-footer');
  if (!footerEl && rightPane) {
    footerEl = document.createElement('footer');
    footerEl.id = 'site-footer';
    rightPane.appendChild(footerEl);
  }

  const cur       = window.location.pathname.split('/').pop();
  const isAdmin   = user.role === 'admin';
  const active    = (file) => cur === file ? 'active' : '';
  const roleLabel = isAdmin ? 'Admin' : 'นักศึกษา';

  // ── Sidebar ──────────────────────────────────────────────
  root.innerHTML = `
    <aside class="sidebar">
      <a href="dashboard.html" class="sidebar-brand">
        <img src="public/ESC_logo.png" alt="กวศ.">
        <span class="sidebar-brand-name">Operation Support</span>
      </a>
      <nav class="sidebar-nav">
        <div class="sidebar-section-label">เมนูหลัก</div>
        <a href="dashboard.html"     class="sidebar-link ${active('dashboard.html')}">หน้าหลัก</a>
        <a href="items.html"         class="sidebar-link ${active('items.html')}">อุปกรณ์</a>
        <a href="projects.html"      class="sidebar-link ${active('projects.html')}">โครงการ</a>
        <a href="requests.html"      class="sidebar-link ${active('requests.html')}">คำขอยืม</a>
        <a href="visits.html"        class="sidebar-link ${active('visits.html')}">เยี่ยมชม</a>
        <a href="deposits.html"      class="sidebar-link ${active('deposits.html')}">ฝากชั่วคราว</a>
        <a href="storage-areas.html" class="sidebar-link ${active('storage-areas.html')}">พื้นที่จัดเก็บ</a>
        <a href="donations.html"     class="sidebar-link ${active('donations.html')}">บริจาค</a>
        <a href="notifications.html" class="sidebar-link ${active('notifications.html')}">
          การแจ้งเตือน
          ${unread > 0 ? `<span class="sidebar-notif-dot">${unread > 99 ? '99+' : unread}</span>` : ''}
        </a>
        ${isAdmin ? `
          <div class="sidebar-section-label" style="margin-top:.5rem;">แอดมิน</div>
          <a href="admin-items.html"  class="sidebar-link ${active('admin-items.html')}">จัดการอุปกรณ์</a>
          <a href="admin-queue.html"  class="sidebar-link ${active('admin-queue.html')}">
            จัดการคำขอ
            <span id="sidebar-queue-badge" class="sidebar-notif-dot" style="display:none"></span>
          </a>
          <a href="admin-calendar.html"  class="sidebar-link ${active('admin-calendar.html')}">ปฏิทิน</a>
          <a href="admin-slots.html"     class="sidebar-link ${active('admin-slots.html')}">ช่วงเวลา</a>
          <a href="admin-holidays.html"  class="sidebar-link ${active('admin-holidays.html')}">วันหยุด</a>
          <a href="admin-broadcast.html" class="sidebar-link ${active('admin-broadcast.html')}">แจ้งเตือน</a>
          <a href="admin-users.html"     class="sidebar-link ${active('admin-users.html')}">ผู้ใช้งาน</a>
        ` : ''}
      </nav>
      <div class="sidebar-bottom">
        <button class="sidebar-logout" id="nav-logout-btn">ออกจากระบบ</button>
      </div>
    </aside>`;

  // ── Admin pending badge (fire-and-forget) ────────────────
  if (isAdmin) {
    Promise.allSettled([
      getRequests({ limit: 100, status: 'pending' }),
      getAllReturns('pending'),
      getVisits({ limit: 100, status: 'pending' }),
    ]).then(([rq, rt, vs]) => {
      const total =
        (rq.status === 'fulfilled' ? (rq.value?.data?.length ?? 0) : 0) +
        (rt.status === 'fulfilled' ? (rt.value?.data?.length ?? 0) : 0) +
        (vs.status === 'fulfilled' ? (vs.value?.data?.length ?? 0) : 0);
      const badge = document.getElementById('sidebar-queue-badge');
      if (badge && total > 0) {
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.style.display = 'inline-flex';
      }
    }).catch(() => {});
  }

  // ── Topbar ───────────────────────────────────────────────
  if (topbarEl) {
    topbarEl.className = 'topbar';
    topbarEl.innerHTML = `
      <div class="topbar-left"></div>
      <div class="topbar-right">
        <a href="notifications.html" class="topbar-notif" aria-label="การแจ้งเตือน (${unread} ใหม่)">
          ${_BELL_SVG}
          ${unread > 0 ? `<span class="topbar-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
        </a>
        <a href="profile.html" class="topbar-profile-link" title="${h(user.nickname || user.name)}">
          ${user.avatar_url
            ? `<img src="${h(user.avatar_url)}" alt="${h(user.name)}" class="topbar-avatar">`
            : `<div class="topbar-avatar-ph">${h(user.name.charAt(0).toUpperCase())}</div>`
          }
        </a>
      </div>`;
  }

  // ── Footer ───────────────────────────────────────────────
  if (footerEl) {
    footerEl.className = 'site-footer';
    const year = new Date().getFullYear();
    footerEl.innerHTML = `
      <span>Operation Support</span>
      <span>© ${year} คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</span>`;
  }

  // Logout — re-bind each time renderNavbar runs so the button always works
  document.getElementById('nav-logout-btn')?.addEventListener('click', async () => {
    await postLogout().catch(() => {});
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  });
}

// ── Custom Select ────────────────────────────────────────────────────────────
// Replaces every <select> (except [multiple]) with a styled dropdown.
// Works automatically on dynamically rendered content via MutationObserver.

let _csOpen = null;

function _csClose(wrap) {
  if (!wrap) return;
  wrap.classList.remove('cs-open');
  if (_csOpen === wrap) _csOpen = null;
}

function _csWrap(sel) {
  if (sel.dataset.csInit || sel.multiple) return;
  sel.dataset.csInit = '1';

  const wrap = document.createElement('div');
  wrap.className = 'cs-wrap';
  if (sel.disabled) wrap.classList.add('cs-disabled');
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add('cs-native');

  const trigger = document.createElement('div');
  trigger.className = 'cs-trigger';
  trigger.setAttribute('tabindex', sel.disabled ? '-1' : '0');
  const valueEl = document.createElement('span');
  const arrow   = document.createElement('span');
  arrow.className = 'cs-arrow';
  arrow.textContent = '▼';
  trigger.append(valueEl, arrow);

  const dropdown = document.createElement('div');
  dropdown.className = 'cs-dropdown';

  let searchEl = null;
  if (sel.options.length > 6) {
    searchEl = document.createElement('input');
    searchEl.type = 'text';
    searchEl.className = 'cs-search';
    searchEl.placeholder = 'ค้นหา…';
    dropdown.appendChild(searchEl);
  }

  const optsEl = document.createElement('div');
  optsEl.className = 'cs-opts';
  dropdown.appendChild(optsEl);
  wrap.append(trigger, dropdown);

  function buildOpts() {
    optsEl.innerHTML = '';
    Array.from(sel.options).forEach(opt => {
      const d = document.createElement('div');
      d.className = 'cs-opt' + (opt.value === '' ? ' cs-ph-opt' : '');
      d.textContent = opt.text;
      d.dataset.v = opt.value;
      d.addEventListener('mousedown', e => { e.preventDefault(); pick(opt.value); });
      optsEl.appendChild(d);
    });
  }

  function syncDisplay() {
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.value !== '') {
      valueEl.textContent = opt.text;
      valueEl.className = 'cs-value';
    } else {
      valueEl.textContent = opt ? opt.text : '';
      valueEl.className = 'cs-value cs-ph';
    }
    optsEl.querySelectorAll('.cs-opt').forEach(d =>
      d.classList.toggle('cs-sel', d.dataset.v === sel.value)
    );
  }

  function pick(value) {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    syncDisplay();
    _csClose(wrap);
  }

  function open() {
    if (sel.disabled) return;
    if (_csOpen && _csOpen !== wrap) _csClose(_csOpen);
    wrap.classList.add('cs-open');
    _csOpen = wrap;
    if (searchEl) { searchEl.value = ''; filterOpts(''); searchEl.focus(); }
    syncDisplay();
    const selected = optsEl.querySelector('.cs-sel');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  function filterOpts(q) {
    optsEl.querySelectorAll('.cs-opt').forEach(d => {
      d.hidden = !!q && !d.textContent.toLowerCase().includes(q.toLowerCase());
    });
  }

  trigger.addEventListener('click', () => {
    wrap.classList.contains('cs-open') ? _csClose(wrap) : open();
  });
  trigger.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    else if (e.key === 'Escape') _csClose(wrap);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const opts  = Array.from(sel.options).filter(o => !o.disabled);
      const curr  = sel.selectedIndex;
      const next  = e.key === 'ArrowDown'
        ? Math.min(curr + 1, sel.options.length - 1)
        : Math.max(curr - 1, 0);
      if (next !== curr) pick(sel.options[next].value);
    }
  });
  if (searchEl) {
    searchEl.addEventListener('input', () => filterOpts(searchEl.value));
    searchEl.addEventListener('keydown', e => { if (e.key === 'Escape') _csClose(wrap); });
    searchEl.addEventListener('click', e => e.stopPropagation());
  }
  sel.addEventListener('change', syncDisplay);

  buildOpts();
  syncDisplay();
}

// Single global listener to close dropdowns on outside click
document.addEventListener('click', e => {
  if (_csOpen && !_csOpen.contains(e.target)) _csClose(_csOpen);
  if (_dpOpen && !_dpOpen.contains(e.target)) _dpClose(_dpOpen);
});

// Auto-wrap existing and future selects + date inputs
;(function () {
  function scan(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('select:not([multiple])').forEach(_csWrap);
    root.querySelectorAll('input[type="date"]').forEach(_dpInit);
  }
  if (document.readyState !== 'loading') scan(document);
  else document.addEventListener('DOMContentLoaded', () => scan(document));

  new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'SELECT' && !n.multiple) { _csWrap(n); return; }
        if (n.tagName === 'INPUT' && n.type === 'date') { _dpInit(n); return; }
        scan(n);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

// ── Date Picker ───────────────────────────────────────────────────────────────
// Replaces every <input type="date"> with a styled calendar popup.

let _dpOpen = null;

function _dpClose(wrap) {
  if (!wrap) return;
  wrap.classList.remove('dp-open');
  if (_dpOpen === wrap) _dpOpen = null;
}

const _DOW_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const _CAL_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;

function _dpInit(input) {
  if (input.dataset.dpInit || input.type !== 'date') return;
  input.dataset.dpInit = '1';

  // ── DOM shell ──
  const wrap = document.createElement('div');
  wrap.className = 'dp-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.classList.add('dp-native');

  const trigger = document.createElement('div');
  trigger.className = 'dp-trigger';
  trigger.setAttribute('tabindex', input.disabled ? '-1' : '0');
  trigger.setAttribute('role', 'button');
  const valueEl = document.createElement('span');
  const iconEl  = document.createElement('span');
  iconEl.className = 'dp-icon';
  iconEl.innerHTML = _CAL_SVG;
  trigger.append(valueEl, iconEl);

  const panel = document.createElement('div');
  panel.className = 'dp-panel';
  wrap.append(trigger, panel);

  // ── State ──
  let viewY, viewM; // current calendar view (year, 0-based month)

  // ── Helpers ──
  function parseValue() {
    if (!input.value) return null;
    const [y, m, d] = input.value.split('-').map(Number);
    return isNaN(y) ? null : new Date(y, m - 1, d);
  }

  function syncTrigger() {
    const d = parseValue();
    if (d) {
      valueEl.textContent = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
      valueEl.className = 'dp-value';
    } else {
      valueEl.textContent = input.placeholder || 'เลือกวันที่';
      valueEl.className = 'dp-value dp-ph';
    }
  }

  function buildPanel() {
    const sel   = parseValue();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const firstDay    = new Date(viewY, viewM, 1);
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const startDow    = firstDay.getDay(); // 0=Sun

    const monthLabel = firstDay.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

    // Build day cells
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<button class="dp-day" disabled></button>';
    for (let d = 1; d <= daysInMonth; d++) {
      const date    = new Date(viewY, viewM, d);
      const isToday = date.getTime() === today.getTime();
      const isSel   = sel && date.getTime() === sel.getTime();
      const iso     = `${viewY}-${String(viewM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cls     = ['dp-day', isToday ? 'dp-today' : '', isSel ? 'dp-sel' : ''].filter(Boolean).join(' ');
      cells += `<button class="${cls}" data-iso="${iso}">${d}</button>`;
    }

    panel.innerHTML = `
      <div class="dp-header">
        <button class="dp-nav" data-dir="-1" aria-label="เดือนก่อน">‹</button>
        <span class="dp-month-label">${monthLabel}</span>
        <button class="dp-nav" data-dir="1"  aria-label="เดือนถัดไป">›</button>
      </div>
      <div class="dp-dow">${_DOW_TH.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="dp-grid">${cells}</div>`;

    // Nav
    panel.querySelectorAll('.dp-nav').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        viewM += parseInt(btn.dataset.dir, 10);
        if (viewM > 11) { viewM = 0; viewY++; }
        if (viewM < 0)  { viewM = 11; viewY--; }
        buildPanel();
      });
    });

    // Day selection
    panel.querySelectorAll('.dp-day[data-iso]').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = btn.dataset.iso;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        syncTrigger();
        _dpClose(wrap);
      });
    });
  }

  function open() {
    if (input.disabled) return;
    if (_dpOpen && _dpOpen !== wrap) _dpClose(_dpOpen);
    const d = parseValue() || new Date();
    viewY = d.getFullYear();
    viewM = d.getMonth();
    buildPanel();
    wrap.classList.add('dp-open');
    _dpOpen = wrap;
  }

  // ── Events ──
  trigger.addEventListener('click', () => {
    wrap.classList.contains('dp-open') ? _dpClose(wrap) : open();
  });
  trigger.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    else if (e.key === 'Escape') _dpClose(wrap);
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && wrap.classList.contains('dp-open')) {
      e.preventDefault();
      viewM += e.key === 'ArrowRight' ? 1 : -1;
      if (viewM > 11) { viewM = 0; viewY++; }
      if (viewM < 0)  { viewM = 11; viewY--; }
      buildPanel();
    }
  });

  input.addEventListener('change', syncTrigger);

  syncTrigger();
}

// ── Modal ─────────────────────────────────────────────────────────────────────
// Open a modal (appends to #modal-root, returns close function)
export function openModal(titleText, bodyHtml) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-box" tabindex="-1" role="dialog" aria-modal="true" aria-label="${h(titleText)}">
        <div class="modal-title">${h(titleText)}</div>
        ${bodyHtml}
      </div>
    </div>`;
  const box = root.querySelector('.modal-box');
  const close = () => { root.innerHTML = ''; };
  initDatePickers(root);

  root.querySelector('#modal-overlay').addEventListener('mousedown', (e) => {
    if (e.target.id === 'modal-overlay') close();
  });

  // Focus trap: keep Tab inside the modal, Escape closes it
  box.focus();
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {
      const focusable = box.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (!focusable.length) { e.preventDefault(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  return close;
}

// Styled confirmation dialog — replaces window.confirm() across the project
export function showConfirmModal(message, onConfirm, {
  title        = 'ยืนยัน',
  confirmLabel = 'ยืนยัน',
  confirmClass = 'btn-primary',
} = {}) {
  const close = openModal(title, `
    <p style="margin:0 0 1.25rem;font-size:.95rem;line-height:1.6">${h(message)}</p>
    <div class="form-actions">
      <button class="btn ${confirmClass}" id="conf-ok-btn">${h(confirmLabel)}</button>
      <button class="btn btn-secondary" id="conf-cancel-btn">ยกเลิก</button>
    </div>`);
  document.getElementById('conf-ok-btn').addEventListener('click', () => { close(); onConfirm(); });
  document.getElementById('conf-cancel-btn').addEventListener('click', close);
}
