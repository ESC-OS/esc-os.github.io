import { requireAuth } from '../auth.js';
import { getCalendar, getUsers } from '../api.js';
import { h } from '../ui.js';
import { renderSelect, initSelect } from '../select.js';

const DAY_HEADERS = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const MONTHS_TH   = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ─── Module-level state ───────────────────────────────────────────────────────
let calendarData  = {};
let activeTypes   = new Set(['pickup', 'return', 'visit']);
let handlerFilter = '';
const pillDetails = new Map(); // pid → rich HTML detail string

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const start = new Date(first); start.setDate(first.getDate() - first.getDay());
  const end   = new Date(last);  end.setDate(last.getDate() + (6 - last.getDay()));
  const out = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
}
function shiftMonth(year, month, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// ─── Detail builders (used for hover tooltip & overflow popup) ────────────────
const HR = `<hr style="margin:.3rem 0;border:none;border-top:1px solid var(--border)">`;

function contactBlock(name, email, phone, lineId) {
  return [
    name  ? `<strong>${h(name)}</strong>` : '',
    email ? h(email) : '',
    phone ? `📞 ${h(phone)}` : '',
    lineId ? `LINE: ${h(lineId)}` : '',
  ].filter(Boolean).join('<br>');
}

function buildDetail(type, e) {
  if (type === 'pickup') {
    const lines = [
      `<strong>${h(e.event_slot)} — รับอุปกรณ์</strong>`,
      e.request_name ? `คำขอ: ${h(e.request_name)}` : '',
      `โครงการ: ${h(e.project_name)}`,
      e.item_count ? `จำนวน: ${e.item_count} รายการ` : '',
      HR,
      contactBlock(e.requester_name, e.requester_email, e.requester_phone, e.requester_line_id),
    ];
    if (e.handler_name) lines.push(HR, `ผู้ดูแล: ${h(e.handler_name)}`);
    return lines.filter(Boolean).join('<br>');
  }

  if (type === 'return') {
    const lines = [
      `<strong>${h(e.event_slot)} — ${e.status === 'overdue' ? '⚠ คืน (เกินกำหนด)' : 'คืนอุปกรณ์'}</strong>`,
      e.request_name ? `คำขอ: ${h(e.request_name)}` : '',
      `โครงการ: ${h(e.project_name)}`,
      e.item_count ? `จำนวน: ${e.item_count} รายการ` : '',
      HR,
      contactBlock(e.requester_name, e.requester_email, e.requester_phone, e.requester_line_id),
    ];
    if (e.handler_name) lines.push(HR, `ผู้ดูแล: ${h(e.handler_name)}`);
    return lines.filter(Boolean).join('<br>');
  }

  // visit
  const visitLines = [
    `<strong>${h(e.event_slot)} — นัดชมคลัง${e.status === 'pending' ? ' (รอยืนยัน)' : ''}</strong>`,
    `โครงการ: ${h(e.project_name)}`,
    e.purpose ? `วัตถุประสงค์: ${h(e.purpose)}` : '',
    HR,
    contactBlock(e.booked_by_name, e.booked_by_email, e.booked_by_phone, e.booked_by_line_id),
  ];
  if (e.handler_name) visitLines.push(HR, `ผู้รับผิดชอบ: ${h(e.handler_name)}`);
  return visitLines.filter(Boolean).join('<br>');
}

// ─── Grid renderer ────────────────────────────────────────────────────────────
function shouldShow(type, handlerId) {
  if (!handlerFilter) return true;
  return handlerId === handlerFilter;
}

function makePill(type, status, name, id, pid) {
  const icon = { pickup: '▲', return: '↩', visit: '◎' }[type] ?? '•';
  const cls  = type === 'pickup'  ? 'pill-pickup'
             : type === 'return' && status === 'overdue' ? 'pill-overdue'
             : type === 'return'  ? 'pill-return'
             : status === 'pending' ? 'pill-visit-pending'
             : 'pill-visit';
  const href = type === 'visit' ? '/admin-visits/' : `/request-detail/?id=${h(id)}`;
  return `<a href="${href}" class="cal-pill ${cls}" data-pid="${h(pid)}">${icon} <span class="cal-pill-name">${h(name)}</span></a>`;
}

function renderGrid(dates, month, todayISO) {
  pillDetails.clear();
  const MAX = 3;

  return `<div class="cal-grid">${dates.map(d => {
    const iso     = toISO(d);
    const dayData = calendarData[iso];
    const pills   = [];

    if (dayData) {
      for (const [type, arr, statusKey] of [
        ['pickup', dayData.pickups ?? [], null],
        ['return', dayData.returns ?? [], 'status'],
        ['visit',  dayData.visits  ?? [], 'status'],
      ]) {
        if (!activeTypes.has(type)) continue;
        for (const e of arr) {
          if (!shouldShow(type, e.handler_id)) continue;
          const pid    = `${iso}-${type}-${e.id}`;
          const status = statusKey ? e[statusKey] : null;
          const detail = buildDetail(type, e);
          pillDetails.set(pid, detail);
          pills.push({
            slot: e.event_slot,
            html: makePill(type, status, e.project_name, e.id, pid),
            detail,
          });
        }
      }
      pills.sort((a, b) => (a.slot ?? '').localeCompare(b.slot ?? ''));
    }

    const shown = pills.slice(0, MAX);
    const extra = pills.length - MAX;
    const isOther = d.getMonth() !== month;
    const isToday = iso === todayISO;

    return `<div class="cal-day ${isOther ? 'other-month' : ''} ${isToday ? 'today' : ''}">
      <div class="cal-date">${d.getDate()}</div>
      ${shown.map(p => p.html).join('')}
      ${extra > 0 ? `<div class="cal-more" data-iso="${h(iso)}">+${extra} อีก</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('cal-styles')) return;
  const s = document.createElement('style');
  s.id = 'cal-styles';
  s.textContent = `
    .cal-filters { display:flex; flex-wrap:wrap; gap:.6rem 1.25rem; align-items:center;
      background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
      padding:.65rem .9rem; margin:.75rem 0; }
    .cal-filter-group { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
    .cal-filter-label { font-size:.75rem; font-weight:600; color:var(--text-muted);
      text-transform:uppercase; letter-spacing:.05em; white-space:nowrap; }
    .cal-chip { display:inline-flex; align-items:center; gap:.3rem; padding:.3rem .7rem;
      border-radius:20px; font-size:.78rem; font-weight:500; cursor:pointer;
      border:1.5px solid var(--border); background:var(--bg); color:var(--text-muted);
      transition:all .15s; user-select:none; }
    .cal-chip.active-pickup  { background:rgba(59,130,246,.15);  color:#1d4ed8; border-color:#93c5fd; }
    .cal-chip.active-return  { background:rgba(34,197,94,.15);   color:#15803d; border-color:#86efac; }
    .cal-chip.active-visit   { background:rgba(123,23,40,.12);   color:var(--primary); border-color:var(--primary); }
    .cal-header-row { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
    .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
    .cal-day { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm);
      min-height:90px; padding:.35rem .4rem; display:flex; flex-direction:column; gap:.2rem; overflow:hidden; }
    .cal-day.other-month { opacity:.35; }
    .cal-day.today { border-color:var(--primary); border-width:2px; }
    .cal-date { font-size:.78rem; font-weight:700; margin-bottom:.15rem; }
    .cal-day.today .cal-date { color:var(--primary); }
    .cal-pill { display:flex; align-items:center; gap:.2rem; font-size:.7rem; font-weight:500;
      padding:.12rem .35rem; border-radius:3px; text-decoration:none; line-height:1.4;
      white-space:nowrap; overflow:hidden; min-width:0; }
    .cal-pill:hover { filter:brightness(.92); }
    .cal-pill-name { overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1; }
    .pill-pickup        { background:rgba(59,130,246,.15);  color:#1d4ed8; }
    .pill-return        { background:rgba(34,197,94,.15);   color:#15803d; }
    .pill-overdue       { background:rgba(239,68,68,.15);   color:#b91c1c; }
    .pill-visit         { background:rgba(123,23,40,.12);   color:var(--primary); }
    .pill-visit-pending { background:rgba(234,179,8,.15);   color:#92400e; }
    .cal-more { font-size:.68rem; color:var(--text-muted); padding:.1rem .3rem; cursor:pointer; }
    .cal-more:hover { color:var(--text); }
    .cal-legend { display:flex; flex-wrap:wrap; gap:.4rem 1.1rem; margin-bottom:.5rem; font-size:.78rem; }
    .cal-legend-dot { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:.3rem; vertical-align:middle; }
    .cal-week-nav { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; }
    .cal-month-label { font-size:.95rem; font-weight:600; min-width:160px; text-align:center; }
    .cal-header-cell { text-align:center; font-size:.75rem; font-weight:700; color:var(--text-muted); padding:.35rem 0; }
    .cal-tooltip { position:fixed; z-index:300; background:var(--surface); border:1px solid var(--border);
      border-radius:var(--radius); padding:.65rem .85rem; box-shadow:0 4px 20px rgba(0,0,0,.13);
      font-size:.8rem; max-width:280px; line-height:1.7; pointer-events:none; }
    @media(max-width:600px) {
      .cal-pill-name { display:none; }
      .cal-day { min-height:60px; }
    }`;
  document.head.appendChild(s);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth(['staff', 'admin']);
  if (!user) return;

  injectStyles();

  const app    = document.getElementById('app');
  const now    = new Date();
  const todayISO = toISO(now);
  let year     = now.getFullYear();
  let month    = now.getMonth();

  const tip = document.createElement('div');
  tip.className = 'cal-tooltip';
  tip.style.display = 'none';
  document.body.appendChild(tip);

  function showTip(html, clientX, clientY) {
    if (!html) { tip.style.display = 'none'; return; }
    tip.innerHTML = html;
    tip.style.display = 'block';
    tip.style.left = Math.min(clientX + 12, window.innerWidth - 296) + 'px';
    tip.style.top  = (clientY + 12 + window.scrollY) + 'px';
  }

  function refreshGrid() {
    const dates  = getMonthGrid(year, month);
    const gridEl = document.getElementById('cal-body');
    if (gridEl) gridEl.innerHTML = renderGrid(dates, month, todayISO);
    bindGridEvents();
  }

  function bindGridEvents() {
    document.querySelectorAll('.cal-pill').forEach(pill => {
      pill.addEventListener('mouseenter', e => showTip(pillDetails.get(pill.dataset.pid) ?? '', e.clientX, e.clientY));
      pill.addEventListener('mousemove',  e => { tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 296) + 'px'; tip.style.top = (e.clientY + 12 + window.scrollY) + 'px'; });
      pill.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });

    document.querySelectorAll('.cal-more').forEach(el => {
      el.addEventListener('click', ev => {
        const iso = el.dataset.iso;
        const dd  = calendarData[iso];
        if (!dd) return;
        const all = [];
        for (const [type, arr, sk] of [['pickup', dd.pickups ?? [], null], ['return', dd.returns ?? [], 'status'], ['visit', dd.visits ?? [], 'status']]) {
          if (!activeTypes.has(type)) continue;
          for (const e of arr) {
            if (!shouldShow(type, e.handler_id)) continue;
            all.push(buildDetail(type, e));
          }
        }
        const r = el.getBoundingClientRect();
        showTip(all.join(`<hr style="margin:.4rem 0;border:none;border-top:1px solid var(--border)">`), r.left, r.bottom + 6 - window.scrollY);
        tip.style.top = (r.bottom + 6 + window.scrollY) + 'px';
        ev.stopPropagation();
      });
    });
  }

  function buildHandlerSelect(handlers) {
    return renderSelect({
      id: 'handler-filter',
      value: handlerFilter,
      variant: 'filter',
      options: [['', 'ผู้รับผิดชอบทั้งหมด'], ...handlers.map(u => [u.id, u.name])],
    });
  }

  async function renderPage() {
    const dates  = getMonthGrid(year, month);
    const from   = toISO(dates[0]);
    const to     = toISO(dates[dates.length - 1]);
    const beYear = year + 543;

    app.innerHTML = `
      <div class="page-header" style="flex-wrap:wrap;gap:.75rem">
        <h1 class="page-title">ปฏิทิน</h1>
        <div class="cal-week-nav">
          <button class="btn btn-secondary btn-sm" id="prev-month">← เดือนก่อน</button>
          <span class="cal-month-label">${MONTHS_TH[month]} ${beYear}</span>
          <button class="btn btn-secondary btn-sm" id="next-month">เดือนหน้า →</button>
          <button class="btn btn-secondary btn-sm" id="today-btn">วันนี้</button>
        </div>
      </div>

      <div class="cal-filters">
        <div class="cal-filter-group">
          <span class="cal-filter-label">ประเภท</span>
          <button class="cal-chip ${activeTypes.has('pickup') ? 'active-pickup' : ''}" data-type="pickup">▲ รับอุปกรณ์</button>
          <button class="cal-chip ${activeTypes.has('return') ? 'active-return' : ''}" data-type="return">↩ คืนอุปกรณ์</button>
          <button class="cal-chip ${activeTypes.has('visit')  ? 'active-visit'  : ''}" data-type="visit">◎ นัดชม</button>
        </div>
        <div class="cal-filter-group" id="handler-group">
          <span class="cal-filter-label">ผู้รับผิดชอบ</span>
          ${renderSelect({ id: 'handler-filter', value: '', options: [['', 'กำลังโหลด...']], disabled: true })}
        </div>
      </div>

      <div class="cal-legend">
        <span><span class="cal-legend-dot" style="background:#1d4ed8"></span>รับอุปกรณ์</span>
        <span><span class="cal-legend-dot" style="background:#15803d"></span>คืนอุปกรณ์</span>
        <span><span class="cal-legend-dot" style="background:#b91c1c"></span>คืน (เกินกำหนด)</span>
        <span><span class="cal-legend-dot" style="background:var(--primary)"></span>นัดชม (ยืนยัน)</span>
        <span><span class="cal-legend-dot" style="background:#ca8a04"></span>นัดชม (รอยืนยัน)</span>
      </div>

      <div class="cal-header-row">
        ${DAY_HEADERS.map(d => `<div class="cal-header-cell">${d}</div>`).join('')}
      </div>
      <div id="cal-body">
        <div class="cal-grid">${dates.map(d => `
          <div class="cal-day ${d.getMonth() !== month ? 'other-month' : ''} ${toISO(d) === todayISO ? 'today' : ''}">
            <div class="cal-date">${d.getDate()}</div>
            <div class="spinner" style="width:10px;height:10px;border-width:2px;margin:.2rem 0"></div>
          </div>`).join('')}
        </div>
      </div>`;

    document.getElementById('prev-month').addEventListener('click', () => { ({ year, month } = shiftMonth(year, month, -1)); renderPage(); });
    document.getElementById('next-month').addEventListener('click', () => { ({ year, month } = shiftMonth(year, month, +1)); renderPage(); });
    document.getElementById('today-btn').addEventListener('click', () => { year = now.getFullYear(); month = now.getMonth(); renderPage(); });

    document.querySelectorAll('.cal-chip[data-type]').forEach(chip => {
      chip.addEventListener('click', () => {
        const t = chip.dataset.type;
        if (activeTypes.has(t)) {
          if (activeTypes.size === 1) return;
          activeTypes.delete(t);
          chip.className = 'cal-chip';
        } else {
          activeTypes.add(t);
          chip.className = `cal-chip active-${t}`;
        }
        refreshGrid();
      });
    });

    document.addEventListener('click', () => { tip.style.display = 'none'; }, { capture: true });

    const [calResult, staffResult, adminResult] = await Promise.allSettled([
      getCalendar(from, to),
      getUsers('staff'),
      getUsers('admin'),
    ]);
    calendarData = calResult.status === 'fulfilled' ? (calResult.value.calendar ?? {}) : {};

    const staffUsers = staffResult.status === 'fulfilled' ? (staffResult.value.users ?? []) : [];
    const adminUsers = adminResult.status === 'fulfilled' ? (adminResult.value.users ?? []) : [];
    const seen = new Set();
    const handlers = [...staffUsers, ...adminUsers]
      .filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; })
      .map(u => ({ id: u.id, name: u.name ?? u.email }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));

    document.getElementById('handler-group').innerHTML = `
      <span class="cal-filter-label">ผู้รับผิดชอบ</span>
      ${buildHandlerSelect(handlers)}`;

    initSelect('handler-filter', val => { handlerFilter = val; refreshGrid(); });

    refreshGrid();
  }

  await renderPage();
}

init();
