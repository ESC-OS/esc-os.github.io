import { requireAuth } from '../auth.js';
import { getCalendar, getNotifications } from '../api.js';
import { h, formatDate, renderNavbar, showError } from '../ui.js';

const THAI_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
];

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
  // API may return `date` or `calendar_date`
  return event.date || event.calendar_date || null;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') {
    window.location.href = 'dashboard.html'; return;
  }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  let allEvents = [];
  try {
    const res = await getCalendar();
    // Normalise: API may return { data: [...] } flat array or something else
    const raw = res?.data ?? res ?? [];
    allEvents = Array.isArray(raw) ? raw : [];
  } catch (err) {
    showError('โหลดปฏิทินไม่สำเร็จ: ' + err.message);
    app.innerHTML = `<div class="page-header"><h1 class="page-title">ปฏิทิน</h1></div>
      <div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  // State
  const today = new Date();
  let currentMonth = today.getMonth();
  let currentYear  = today.getFullYear();
  const activeTypes = new Set(ALL_TYPES);

  function renderCalendar() {
    // Filter events for current month + active types
    const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const visible = allEvents.filter(ev => {
      const d = getEventDate(ev);
      if (!d) return false;
      if (!d.startsWith(monthStr)) return false;
      return activeTypes.has(ev.type);
    });

    // Build calendar grid
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay  = new Date(currentYear, currentMonth + 1, 0);
    const totalDays = lastDay.getDate();

    // day_of_week: getDay() returns 0=Sun..6=Sat; we want Mon=0..Sun=6
    let startDow = firstDay.getDay() - 1; // Mon-based
    if (startDow < 0) startDow = 6;

    // Group events by date string
    const byDate = {};
    visible.forEach(ev => {
      const d = getEventDate(ev);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(ev);
    });

    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    // Generate day cells
    let cells = '';
    // Leading empty cells (previous month)
    for (let i = 0; i < startDow; i++) {
      const prevDate = new Date(currentYear, currentMonth, -startDow + i + 1);
      cells += `<div class="cal-day cal-day-other"><span class="cal-date-num">${prevDate.getDate()}</span></div>`;
    }
    // Days of current month
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const dayEvents = byDate[dateStr] ?? [];
      const evHtml = dayEvents.map(ev =>
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

    const monthLabel = new Date(currentYear, currentMonth, 1)
      .toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

    const filterChips = ALL_TYPES.map(type => {
      const checked = activeTypes.has(type) ? 'checked' : '';
      return `<label class="filter-chip" style="display:inline-flex;align-items:center;gap:.3rem;cursor:pointer;padding:.25rem .6rem;border-radius:20px;border:1px solid var(--border);font-size:.82rem;user-select:none;">
        <input type="checkbox" class="type-toggle" data-type="${h(type)}" ${checked} style="accent-color:var(--primary);">
        ${h(TYPE_LABELS[type])}
      </label>`;
    }).join('');

    const hasVisible = visible.length > 0;

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

      <!-- Month navigation -->
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:.5rem;">
          <button class="btn btn-secondary btn-sm" id="btn-prev-month">&#8592;</button>
          <span style="font-weight:700;font-size:1rem;min-width:160px;text-align:center;" id="month-label">${h(monthLabel)}</span>
          <button class="btn btn-secondary btn-sm" id="btn-next-month">&#8594;</button>
        </div>
        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;" id="type-filters">
          ${filterChips}
        </div>
      </div>

      <!-- Calendar grid -->
      <div class="cal-grid" id="cal-grid">
        <div class="cal-header">จ</div>
        <div class="cal-header">อ</div>
        <div class="cal-header">พ</div>
        <div class="cal-header">พฤ</div>
        <div class="cal-header">ศ</div>
        <div class="cal-header">ส</div>
        <div class="cal-header">อา</div>
        ${cells}
      </div>

      ${!hasVisible ? '<p style="margin-top:1rem;color:var(--text-muted);text-align:center;">ไม่มีกิจกรรม</p>' : ''}
    `;

    // Bind events
    document.getElementById('btn-prev-month').addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      renderCalendar();
    });
    document.getElementById('btn-next-month').addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      renderCalendar();
    });
    document.querySelectorAll('.type-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) activeTypes.add(cb.dataset.type);
        else            activeTypes.delete(cb.dataset.type);
        renderCalendar();
      });
    });
  }

  renderCalendar();
}

init();

