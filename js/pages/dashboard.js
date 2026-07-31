import { requireAuth } from '../auth.js';
import {
  getRequests, getProjects, getNotifications, getVisits,
  getDeposits, getStorageAreas, getDonations, getHolidays,
} from '../api.js';
import { h, formatDate, renderNavbar, statusBadge } from '../ui.js';
import { openProjectModal, openRequestModal } from '../forms.js';

const _ICON_CLIPBOARD = `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary)"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>`;

function withinDays(iso, days) {
  if (!iso) return false;
  const d = new Date(iso).getTime(), now = Date.now();
  return d >= now && d <= now + days * 86_400_000;
}

function tlDateLabel(iso) {
  if (!iso) return '';
  const target = new Date(iso);
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const tmr    = new Date(today); tmr.setDate(today.getDate() + 1);
  const day    = new Date(target); day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return 'วันนี้';
  if (day.getTime() === tmr.getTime())   return 'พรุ่งนี้';
  return target.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
}

const _ICON_CALENDAR = `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary)"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;

const _CAL_DOW    = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const _DOT_COLORS = { red: 'var(--error)', amber: 'var(--warning)', blue: 'var(--info)', green: 'var(--success)' };

function buildEventMap(requests, visits, deposits, storages, donations) {
  const map = {};
  function add(dateStr, ev) {
    if (!dateStr) return;
    const key = String(dateStr).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    (map[key] ??= []).push(ev);
  }
  requests.filter(r => r.status === 'ready_for_pickup').forEach(r =>
    add(r.requested_pickup_datetime, { label: 'รับอุปกรณ์', color: 'red',   href: `request-detail.html?id=${r.id}`, name: r.name || '#' + r.id }));
  requests.filter(r => r.status === 'in_lend').forEach(r =>
    add(r.requested_return_datetime, { label: 'กำหนดคืน', color: r.is_overdue ? 'red' : 'amber', href: `request-detail.html?id=${r.id}`, name: r.name || '#' + r.id }));
  visits.filter(v => v.status === 'confirmed').forEach(v =>
    add(v.visit_date,   { label: 'เยี่ยมชม',  color: 'blue',  href: `visit-detail.html?id=${v.id}`,    name: v.project_name || '#' + v.id }));
  deposits.filter(d => d.status === 'approved').forEach(d =>
    add(d.deposit_date, { label: 'นำฝาก',     color: 'green', href: `deposit-detail.html?id=${d.id}`,  name: d.project_name || '#' + d.id }));
  deposits.filter(d => d.status === 'deposited').forEach(d =>
    add(d.withdraw_date,{ label: 'รับคืน',    color: 'amber', href: `deposit-detail.html?id=${d.id}`,  name: d.project_name || '#' + d.id }));
  storages.filter(s => s.status === 'in_use').forEach(s =>
    add(s.end_date,     { label: 'คืนพื้นที่', color: 'amber', href: `storage-area-detail.html?id=${s.id}`, name: s.project_name || '#' + s.id }));
  donations.filter(d => d.status === 'approved').forEach(d =>
    add(d.donation_date,{ label: 'มอบของ',    color: 'green', href: `donation-detail.html?id=${d.id}`, name: d.project_name || '#' + d.id }));
  return map;
}

function _calCells(eventMap, year, month, holidayMap = {}) {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays    = new Date(year, month, 0).getDate();
  const prevM = month === 0 ? 11 : month - 1, prevY = month === 0 ? year - 1 : year;
  const nextM = month === 11 ? 0 : month + 1, nextY = month === 11 ? year + 1 : year;

  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevDays - i;
    cells.push({ day: d, key: `${prevY}-${String(prevM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, key: `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, other: false });
  }
  const total = Math.ceil(cells.length / 7) * 7;
  for (let nd = 1; cells.length < total; nd++) {
    cells.push({ day: nd, key: `${nextY}-${String(nextM+1).padStart(2,'0')}-${String(nd).padStart(2,'0')}`, other: true });
  }

  return cells.map(cell => {
    const evs = eventMap[cell.key] || [];
    const isHoliday = !cell.other && !!holidayMap[cell.key];
    const eventColors = [...new Set(evs.map(e => e.color))];
    const dotColors = isHoliday
      ? ['red', ...eventColors.filter(c => c !== 'red')].slice(0, 3)
      : eventColors.slice(0, 3);
    const cls = ['dash-cal-day', cell.other ? 'other-month' : '', cell.key === todayKey ? 'today' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-date="${cell.key}">
      <span class="dash-cal-day-num">${cell.day}</span>
      ${dotColors.length ? `<div class="dash-cal-dots">${dotColors.map(c => `<span class="dash-cal-dot dash-cal-dot-${c}"></span>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
}

function initCalendar(eventMap, holidayMap = {}) {
  const now = new Date();
  let calYear = now.getFullYear(), calMonth = now.getMonth(), selDate = null;

  function redraw() {
    const cont = document.getElementById('dash-cal-container');
    if (!cont) return;
    const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    cont.innerHTML = `
      <div class="dash-cal">
        <div class="dash-cal-nav">
          <button class="dash-cal-nav-btn" id="cal-prev">‹</button>
          <span class="dash-cal-month">${monthLabel}</span>
          <button class="dash-cal-nav-btn" id="cal-next">›</button>
        </div>
        <div class="dash-cal-grid">
          ${_CAL_DOW.map(d => `<div class="dash-cal-dow">${d}</div>`).join('')}
          ${_calCells(eventMap, calYear, calMonth, holidayMap)}
        </div>
        <div id="cal-events-panel"></div>
      </div>`;

    document.getElementById('cal-prev').addEventListener('click', () => {
      calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
      selDate = null; redraw();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
      selDate = null; redraw();
    });

    cont.querySelector('.dash-cal-grid').addEventListener('click', e => {
      const cell = e.target.closest('.dash-cal-day');
      if (!cell) return;
      const date = cell.dataset.date;
      cont.querySelectorAll('.dash-cal-day.selected').forEach(el => el.classList.remove('selected'));
      const panel = document.getElementById('cal-events-panel');
      if (selDate === date) { selDate = null; panel.innerHTML = ''; return; }
      selDate = date;
      cell.classList.add('selected');
      const evs = eventMap[date] || [];
      const holiday = holidayMap[date];
      if (!evs.length && !holiday) {
        panel.innerHTML = `<div class="dash-cal-events"><div class="dash-cal-events-title">ไม่มีกำหนดการ</div></div>`;
        return;
      }
      const fmt = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
      panel.innerHTML = `<div class="dash-cal-events">
        <div class="dash-cal-events-title">${fmt}</div>
        ${holiday ? `<div style="color:var(--error,#dc2626);font-size:.83em;font-weight:600;padding:.15rem 0 .35rem">วันหยุดราชการ — ${h(holiday)}</div>` : ''}
        ${evs.map(ev => `
          <a href="${h(ev.href)}" class="dash-cal-event">
            <span class="dash-cal-event-dot" style="background:${_DOT_COLORS[ev.color] ?? 'var(--text-muted)'}"></span>
            <span class="dash-cal-event-label">${h(ev.label)}</span>
            <span>${h(ev.name)}</span>
          </a>`).join('')}
      </div>`;
    });
  }

  redraw();
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const _hdYear = new Date().getFullYear();
  const [reqRes, projRes, notifRes, visitRes, depRes, storRes, donRes, hdRes, hdRes2] = await Promise.all([
    getRequests({ limit: 5 }).catch(() => null),
    getProjects({ limit: 20 }).catch(() => null),
    getNotifications(1, 4).catch(() => null),
    getVisits({ limit: 5 }).catch(() => null),
    getDeposits({ limit: 5 }).catch(() => null),
    getStorageAreas({ limit: 5 }).catch(() => null),
    getDonations({ limit: 5 }).catch(() => null),
    getHolidays(_hdYear).catch(() => ({ data: [] })),
    getHolidays(_hdYear + 1).catch(() => ({ data: [] })),
  ]);

  const requests  = reqRes?.data  ?? [];
  const projects  = projRes?.data ?? [];
  const unread    = notifRes?.pagination?.unread ?? 0;
  const visits    = visitRes?.data  ?? [];
  const deposits  = depRes?.data   ?? [];
  const storages  = storRes?.data  ?? [];
  const donations = donRes?.data   ?? [];

  const holidayMap = {};
  [...(hdRes?.data ?? []), ...(hdRes2?.data ?? [])].forEach(hd => {
    if (hd.date) holidayMap[hd.date] = hd.name;
  });

  renderNavbar(user, unread);

  const todayStr = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Action banner ─────────────────────────────────────────────────────────
  const actionItems = [];
  requests.filter(r => r.status === 'ready_for_pickup').forEach(r => {
    actionItems.push({ priority: 1, color: 'red', label: 'ไปรับอุปกรณ์',
      name: r.name || `#${r.id}`, date: r.requested_pickup_datetime,
      href: `request-detail.html?id=${r.id}` });
  });
  requests.filter(r => r.status === 'in_lend' && r.is_overdue).forEach(r => {
    actionItems.push({ priority: 2, color: 'red', label: 'เกินกำหนดคืน',
      name: r.name || `#${r.id}`, date: r.requested_return_datetime,
      href: `request-detail.html?id=${r.id}` });
  });
  deposits.filter(d => d.status === 'approved').forEach(d => {
    actionItems.push({ priority: 3, color: 'amber', label: 'นำของมาฝาก',
      name: d.project_name || `#${d.id}`, date: d.deposit_date,
      href: `deposit-detail.html?id=${d.id}` });
  });
  donations.filter(d => d.status === 'approved').forEach(d => {
    actionItems.push({ priority: 3, color: 'amber', label: 'นำของมามอบ',
      name: d.project_name || `#${d.id}`, date: d.donation_date,
      href: `donation-detail.html?id=${d.id}` });
  });
  deposits.filter(d => d.status === 'deposited').forEach(d => {
    actionItems.push({ priority: 4, color: 'amber', label: 'มารับของคืน',
      name: d.project_name || `#${d.id}`, date: d.withdraw_date,
      href: `deposit-detail.html?id=${d.id}` });
  });
  storages.filter(s => s.status === 'in_use').forEach(s => {
    actionItems.push({ priority: 4, color: 'amber', label: 'เตรียมคืนพื้นที่',
      name: s.project_name || `#${s.id}`, date: s.end_date,
      href: `storage-area-detail.html?id=${s.id}` });
  });
  visits.filter(v => v.status === 'confirmed').forEach(v => {
    actionItems.push({ priority: 5, color: 'blue', label: 'เตรียมเยี่ยมชม',
      name: v.project_name || `#${v.id}`, date: v.visit_date,
      href: `visit-detail.html?id=${v.id}` });
  });
  requests.filter(r => r.status === 'pending').forEach(r => {
    actionItems.push({ priority: 6, color: 'blue', label: 'รอเจ้าหน้าที่',
      name: r.name || `#${r.id}`, date: null,
      href: `request-detail.html?id=${r.id}` });
  });
  requests.filter(r => r.status === 'processing').forEach(r => {
    actionItems.push({ priority: 6, color: 'blue', label: 'กำลังเตรียม',
      name: r.name || `#${r.id}`, date: null,
      href: `request-detail.html?id=${r.id}` });
  });
  actionItems.sort((a, b) => a.priority - b.priority);
  const shownActions = actionItems.slice(0, 5);
  const moreCount    = actionItems.length - shownActions.length;

  // ── Draft items ───────────────────────────────────────────────────────────
  const draftItems = [];
  requests.filter(r => r.status === 'draft').forEach(r => {
    draftItems.push({ type: 'คำขอยืม', name: r.name || 'คำขอใหม่', href: `request-detail.html?id=${r.id}` });
  });
  deposits.filter(d => d.status === 'draft').forEach(d => {
    draftItems.push({ type: 'ฝากชั่วคราว', name: d.project_name || 'ร่างฝาก', href: `deposit-detail.html?id=${d.id}` });
  });
  donations.filter(d => d.status === 'draft').forEach(d => {
    draftItems.push({ type: 'บริจาค', name: d.project_name || 'ร่างบริจาค', href: `donation-detail.html?id=${d.id}` });
  });

  // ── 7-day timeline ────────────────────────────────────────────────────────
  const timelineItems = [];
  const TL = 7;
  requests.filter(r => r.status === 'ready_for_pickup' && withinDays(r.requested_pickup_datetime, TL)).forEach(r => {
    timelineItems.push({ date: new Date(r.requested_pickup_datetime), color: 'green',
      label: 'รับอุปกรณ์', name: r.name || `#${r.id}`, href: `request-detail.html?id=${r.id}` });
  });
  requests.filter(r => r.status === 'in_lend' && withinDays(r.requested_return_datetime, TL)).forEach(r => {
    timelineItems.push({ date: new Date(r.requested_return_datetime), color: 'amber',
      label: 'กำหนดคืน', name: r.name || `#${r.id}`, href: `request-detail.html?id=${r.id}` });
  });
  visits.filter(v => v.status === 'confirmed' && withinDays(v.visit_date, TL)).forEach(v => {
    timelineItems.push({ date: new Date(v.visit_date), color: 'blue',
      label: 'เยี่ยมชม', name: v.project_name || `#${v.id}`, href: `visit-detail.html?id=${v.id}` });
  });
  deposits.filter(d => d.status === 'approved' && withinDays(d.deposit_date, TL)).forEach(d => {
    timelineItems.push({ date: new Date(d.deposit_date), color: 'green',
      label: 'นำของฝาก', name: d.project_name || `#${d.id}`, href: `deposit-detail.html?id=${d.id}` });
  });
  deposits.filter(d => d.status === 'deposited' && withinDays(d.withdraw_date, TL)).forEach(d => {
    timelineItems.push({ date: new Date(d.withdraw_date), color: 'amber',
      label: 'รับของคืน', name: d.project_name || `#${d.id}`, href: `deposit-detail.html?id=${d.id}` });
  });
  storages.filter(s => s.status === 'in_use' && withinDays(s.end_date, TL)).forEach(s => {
    timelineItems.push({ date: new Date(s.end_date), color: 'amber',
      label: 'คืนพื้นที่', name: s.project_name || `#${s.id}`, href: `storage-area-detail.html?id=${s.id}` });
  });
  donations.filter(d => d.status === 'approved' && withinDays(d.donation_date, TL)).forEach(d => {
    timelineItems.push({ date: new Date(d.donation_date), color: 'green',
      label: 'นำของมอบ', name: d.project_name || `#${d.id}`, href: `donation-detail.html?id=${d.id}` });
  });
  timelineItems.sort((a, b) => a.date - b.date);

  // ── Event map for calendar ────────────────────────────────────────────────
  const eventMap = buildEventMap(requests, visits, deposits, storages, donations);

  // ── Active requests (in_lend / ready_for_pickup / processing) ─────────────
  const activeReqs = requests.filter(r => ['in_lend', 'ready_for_pickup', 'processing'].includes(r.status));

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderActionBanner() {
    if (!actionItems.length) return '';
    return `
      <div class="dash-action-banner">
        <div class="dash-action-banner-header">
          ต้องดำเนินการ
          <span class="dash-action-count">${actionItems.length}</span>
        </div>
        ${shownActions.map(a => `
          <a href="${h(a.href)}" class="dash-action-item">
            <div class="dash-action-bar dash-action-bar-${h(a.color)}"></div>
            <div class="dash-action-info">
              <span class="dash-action-label dash-action-label-${h(a.color)}">${h(a.label)}</span>
              <span class="dash-action-name">${h(a.name)}</span>
            </div>
            <span class="dash-action-date">${a.date ? formatDate(a.date) : ''}</span>
          </a>`).join('')}
        ${moreCount > 0 ? `<div class="dash-action-more">และอีก ${moreCount} รายการ</div>` : ''}
      </div>`;
  }

  function renderDrafts() {
    if (!draftItems.length) return '';
    return `
      <div class="dash-draft-banner">
        <div class="dash-draft-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          ค้างไว้ — ดำเนินการต่อ
        </div>
        ${draftItems.map(d => `
          <a href="${h(d.href)}" class="dash-draft-item">
            <span class="dash-draft-type">${h(d.type)}</span>
            <span class="dash-draft-name">${h(d.name)}</span>
            <span class="dash-draft-arrow">→</span>
          </a>`).join('')}
      </div>`;
  }

  function renderProjectsGrid() {
    const shown = projects.slice(0, 6);
    if (!shown.length) {
      return `<div class="dash-empty" style="padding:2rem 0">${_ICON_CLIPBOARD}<span>ยังไม่มีโครงการ</span><span style="font-size:.8rem">สร้างโครงการแรกของคุณ</span></div>`;
    }
    return `<div class="dash-proj-grid">
      ${shown.map(p => `
        <a href="project-detail.html?id=${h(p.id)}" class="dash-proj-card">
          <span class="dash-proj-card-name">${h(p.name)}</span>
          ${p.org_type || p.organization_type ? `<span class="dash-proj-card-org">${h(p.org_type || p.organization_type)}</span>` : ''}
          <span class="dash-proj-card-meta">${formatDate(p.start_date)}${p.end_date ? ' – ' + formatDate(p.end_date) : ''} · ${h(String(p.member_count ?? 0))} สมาชิก</span>
        </a>`).join('')}
    </div>
    ${projects.length > 6 ? `<div style="margin-top:.75rem;font-size:.82rem;color:var(--text-muted)">และอีก ${projects.length - 6} โครงการ — <a href="projects.html" style="color:var(--primary)">ดูทั้งหมด</a></div>` : ''}`;
  }

  function renderTimeline() {
    if (!timelineItems.length) {
      return `<div class="dash-empty">${_ICON_CALENDAR}<span>ไม่มีกำหนดการ 7 วันข้างหน้า</span></div>`;
    }
    return timelineItems.map(t => `
      <a href="${h(t.href)}" class="dash-tl-item">
        <span class="dash-tl-date">${tlDateLabel(t.date.toISOString())}</span>
        <span class="dash-tl-pill dash-tl-pill-${h(t.color)}">${h(t.label)}</span>
        <span class="dash-tl-name">${h(t.name)}</span>
        <span class="dash-tl-arrow">→</span>
      </a>`).join('');
  }

  function renderActiveRequests() {
    if (!activeReqs.length) {
      return `<div class="dash-empty">${_ICON_CLIPBOARD}<span>ไม่มีรายการที่กำลังดำเนินการ</span></div>`;
    }
    return `<div class="dash-req-table">
      ${activeReqs.slice(0, 6).map(r => `
        <a href="request-detail.html?id=${h(r.id)}" class="dash-req-row">
          ${statusBadge(r.status)}
          <span class="dash-req-name">${h(r.name || '#' + r.id)}</span>
          <span class="dash-req-date">${r.requested_return_datetime ? formatDate(r.requested_return_datetime) : ''}</span>
          <span class="dash-req-arrow">→</span>
        </a>`).join('')}
    </div>`;
  }

  // ── CTA: dynamic based on project count ───────────────────────────────────
  const ctaHtml = projects.length === 0
    ? `<button class="btn btn-primary" id="btn-dash-cta">+ สร้างโครงการ</button>`
    : `<button class="btn btn-primary" id="btn-dash-cta">+ สร้างคำขอยืม</button>`;

  // ── Layout ────────────────────────────────────────────────────────────────
  app.innerHTML = `
    <div class="dash-header">
      <div>
        <div class="dash-greeting">ยินดีต้อนรับ, ${h(user.nickname || user.name)}</div>
        <div class="dash-header-sub">${h(todayStr)}</div>
      </div>
      ${ctaHtml}
    </div>

    ${renderActionBanner()}
    ${renderDrafts()}

    <!-- Projects full-width section -->
    <div class="dash-section-card" style="margin-bottom:1.25rem">
      <div class="dash-section-header">
        <span class="dash-section-title">โครงการของฉัน</span>
        <div style="display:flex;align-items:center;gap:.75rem">
          <button class="btn btn-secondary btn-sm" id="btn-new-proj">+ สร้างโครงการ</button>
          <a href="projects.html" class="dash-section-link">ดูทั้งหมด →</a>
        </div>
      </div>
      ${renderProjectsGrid()}
    </div>

    <!-- Calendar full-width -->
    <div class="dash-section-card" style="margin-bottom:1.25rem">
      <div class="dash-section-header">
        <span class="dash-section-title">ปฏิทินกำหนดการ</span>
      </div>
      <div id="dash-cal-container"></div>
    </div>

    <!-- 2-col: timeline + active requests -->
    <div class="dash-2col">
      <div class="dash-section-card">
        <div class="dash-section-header">
          <span class="dash-section-title">กำหนดการ 7 วัน</span>
        </div>
        ${renderTimeline()}
      </div>

      <div class="dash-section-card">
        <div class="dash-section-header">
          <span class="dash-section-title">รายการที่กำลังดำเนินการ</span>
          <a href="requests.html" class="dash-section-link">ดูทั้งหมด →</a>
        </div>
        ${renderActiveRequests()}
      </div>
    </div>`;

  // ── Calendar ──────────────────────────────────────────────────────────────
  initCalendar(eventMap, holidayMap);

  // ── CTA button handler ────────────────────────────────────────────────────
  document.getElementById('btn-dash-cta')?.addEventListener('click', () => {
    if (projects.length === 0) {
      openProjectModal({
        onSuccess: p => { window.location.href = p?.id ? `project-detail.html?id=${p.id}` : 'projects.html'; },
      });
    } else {
      openRequestModal({
        onSuccess: reqId => { if (reqId) window.location.href = `request-detail.html?id=${encodeURIComponent(reqId)}`; },
      });
    }
  });

  document.getElementById('btn-new-proj')?.addEventListener('click', () => {
    openProjectModal({
      onSuccess: p => { window.location.href = p?.id ? `project-detail.html?id=${p.id}` : 'projects.html'; },
    });
  });
}

init();
