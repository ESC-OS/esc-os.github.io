import { requireAuth } from '../auth.js';
import { getCalendar, getNotifications } from '../api.js';
import { h, renderNavbar, showError } from '../ui.js';

const TYPE_LABELS = {
  borrow_pickup: 'ยืม(รับ)',
  borrow_return: 'ยืม(คืน)',
  visit:         'เยี่ยมชม',
  deposit:       'ฝากของ',
  storage_area:  'พื้นที่',
};

const ALL_TYPES = Object.keys(TYPE_LABELS);

function eventHref(event) {
  switch (event.type) {
    case 'borrow_pickup':
    case 'borrow_return': return `request-detail.html?id=${encodeURIComponent(event.id)}`;
    case 'visit':         return `visit-detail.html?id=${encodeURIComponent(event.id)}`;
    case 'deposit':       return `deposit-detail.html?id=${encodeURIComponent(event.id)}`;
    case 'storage_area':  return `storage-area-detail.html?id=${encodeURIComponent(event.id)}`;
    default:              return '#';
  }
}

function getEventDate(event) {
  return event.date || event.calendar_date || null;
}

function pad(n) { return String(n).padStart(2, '0'); }

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  const today       = new Date();
  let currentMonth  = today.getMonth();
  let currentYear   = today.getFullYear();
  const activeTypes = new Set(ALL_TYPES);

  const filterChips = ALL_TYPES.map(type =>
    `<label class="filter-chip" style="display:inline-flex;align-items:center;gap:.3rem;cursor:pointer;padding:.25rem .6rem;border-radius:20px;border:1px solid var(--border);font-size:.82rem;user-select:none;">
      <input type="checkbox" class="type-toggle" data-type="${h(type)}" checked style="accent-color:var(--primary);">
      ${h(TYPE_LABELS[type])}
    </label>`
  ).join('');

  // Render shell once — only the grid cells and month label update
  app.innerHTML = `
    <style>
      .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
      .cal-header { background: var(--bg); padding: .4rem; text-align: center; font-size: .78rem; font-weight: 700; color: var(--text-muted); }
      .cal-day { background: var(--surface); min-height: 80px; padding: .35rem; display: flex; flex-direction: column; gap: 2px; }
      .cal-day-other { background: #fafafa; opacity: .7; }
      .cal-day-today { background: #fff8f0; }
      .cal-date-num { font-size: .78rem; font-weight: 600; color: var(--text-muted); margin-bottom: .1rem; }
      .cal-event { font-size: .68rem; padding: .1rem .3rem; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; display: block; }
      .cal-event-borrow_pickup { background: #dbeafe; color: #1e40af; }
      .cal-event-borrow_return { background: #fce7f3; color: #9d174d; }
      .cal-event-visit { background: #d1fae5; color: #065f46; }
      .cal-event-deposit { background: #fef3c7; color: #92400e; }
      .cal-event-storage_area { background: #ede9fe; color: #5b21b6; }
    </style>

    <div class="page-header">
      <h1 class="page-title">ปฏิทิน</h1>
    </div>

    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:.5rem;">
        <button class="btn btn-secondary btn-sm" id="btn-prev-month">&#8592;</button>
        <span style="font-weight:700;font-size:1rem;min-width:160px;text-align:center;" id="month-label"></span>
        <button class="btn btn-secondary btn-sm" id="btn-next-month">&#8594;</button>
      </div>
      <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;" id="type-filters">
        ${filterChips}
      </div>
    </div>

    <div id="cal-content">
      <div class="cal-grid" id="cal-grid">
        <div class="cal-header">จ</div>
        <div class="cal-header">อ</div>
        <div class="cal-header">พ</div>
        <div class="cal-header">พฤ</div>
        <div class="cal-header">ศ</div>
        <div class="cal-header">ส</div>
        <div class="cal-header">อา</div>
        <div id="cal-cells" style="display:contents"></div>
      </div>
      <p id="cal-empty" style="margin-top:1rem;color:var(--text-muted);text-align:center;display:none">ไม่มีกิจกรรม</p>
    </div>`;

  // Bind nav + filter once
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    loadMonth();
  });
  document.getElementById('btn-next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    loadMonth();
  });
  document.querySelectorAll('.type-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) activeTypes.add(cb.dataset.type);
      else            activeTypes.delete(cb.dataset.type);
      loadMonth();
    });
  });

  async function loadMonth() {
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const from    = `${currentYear}-${pad(currentMonth + 1)}-01`;
    const to      = `${currentYear}-${pad(currentMonth + 1)}-${pad(lastDay.getDate())}`;

    // Update month label immediately
    document.getElementById('month-label').textContent =
      new Date(currentYear, currentMonth, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

    // Show loading inside grid
    const cellsEl = document.getElementById('cal-cells');
    if (cellsEl) cellsEl.innerHTML = `<div style="grid-column:1/-1;padding:2rem;text-align:center"><div class="spinner"></div></div>`;

    let events = [];
    try {
      const res = await getCalendar({ from, to });
      const raw = res?.data ?? res ?? [];
      events = Array.isArray(raw) ? raw : [];
    } catch (err) {
      showError('โหลดปฏิทินไม่สำเร็จ: ' + err.message);
      if (cellsEl) cellsEl.innerHTML = `<div style="grid-column:1/-1;padding:1rem"><div class="alert alert-error">${h(err.message)}</div></div>`;
      return;
    }

    renderCells(events);
  }

  function renderCells(events) {
    const visible  = events.filter(ev => activeTypes.has(ev.type));
    const lastDay  = new Date(currentYear, currentMonth + 1, 0);
    const firstDay = new Date(currentYear, currentMonth, 1);
    const totalDays = lastDay.getDate();

    let startDow = firstDay.getDay() - 1; // Mon-based (0=Mon..6=Sun)
    if (startDow < 0) startDow = 6;

    // Group events by date string
    const byDate = {};
    visible.forEach(ev => {
      const d = getEventDate(ev);
      if (d) {
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(ev);
      }
    });

    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    let cells = '';
    // Leading empty cells
    for (let i = 0; i < startDow; i++) {
      const prevDate = new Date(currentYear, currentMonth, -startDow + i + 1);
      cells += `<div class="cal-day cal-day-other"><span class="cal-date-num">${prevDate.getDate()}</span></div>`;
    }
    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr  = `${currentYear}-${pad(currentMonth + 1)}-${pad(day)}`;
      const isToday  = dateStr === todayStr;
      const dayEvs   = byDate[dateStr] ?? [];
      const evHtml   = dayEvs.map(ev =>
        `<a href="${h(eventHref(ev))}" class="cal-event cal-event-${h(ev.type)}" title="${h(ev.title ?? '')}">${h(ev.title ?? ev.type)}</a>`
      ).join('');
      cells += `<div class="cal-day${isToday ? ' cal-day-today' : ''}">
        <span class="cal-date-num">${day}</span>
        ${evHtml}
      </div>`;
    }
    // Trailing empty cells
    const totalCells = startDow + totalDays;
    const remainder  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remainder; i++) {
      cells += `<div class="cal-day cal-day-other"><span class="cal-date-num">${i}</span></div>`;
    }

    const cellsEl = document.getElementById('cal-cells');
    if (cellsEl) cellsEl.innerHTML = cells;

    const emptyEl = document.getElementById('cal-empty');
    if (emptyEl) emptyEl.style.display = visible.length === 0 ? '' : 'none';
  }

  loadMonth();
}

init();
