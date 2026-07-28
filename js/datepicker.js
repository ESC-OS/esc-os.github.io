// Custom date/datetime picker

const _MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
];
const _DOW = ['อา','จ','อ','พ','พฤ','ศ','ส'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _parseVal(val, isDateTime) {
  if (!val) return null;
  const [y, m, d] = val.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const tp = isDateTime ? val.slice(11, 16) : '00:00';
  const [hh, mm] = (tp || '00:00').split(':').map(Number);
  return { y, m, d, hh: hh || 0, mm: mm || 0 };
}

function _buildVal(y, m, d, hh, mm, isDateTime) {
  const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  return isDateTime ? `${ds}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}` : ds;
}

function _fmtThai(y, m, d, hh, mm, isDateTime) {
  const s = `${d} ${_MONTHS[m - 1]} ${y + 543}`;
  return isDateTime ? `${s}  ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} น.` : s;
}

function _calCells(vy, vm, selY, selM, selD) {
  const n   = new Date();
  const ty  = n.getFullYear(), tm = n.getMonth() + 1, td = n.getDate();
  const fw  = new Date(vy, vm - 1, 1).getDay();
  const dim = new Date(vy, vm, 0).getDate();
  const pd  = new Date(vy, vm - 1, 0).getDate();
  const pm  = vm === 1 ? 12 : vm - 1, py = vm === 1 ? vy - 1 : vy;
  const nm  = vm === 12 ? 1 : vm + 1, ny = vm === 12 ? vy + 1 : vy;

  const cells = [];
  for (let i = fw - 1; i >= 0; i--)
    cells.push({ y: py, m: pm, d: pd - i, other: true });
  for (let d = 1; d <= dim; d++)
    cells.push({ y: vy, m: vm, d, other: false });
  const tot = Math.ceil(cells.length / 7) * 7;
  for (let nd = 1; cells.length < tot; nd++)
    cells.push({ y: ny, m: nm, d: nd, other: true });

  return cells.map(c => {
    const today = !c.other && c.y === ty && c.m === tm && c.d === td;
    const sel   = c.y === selY && c.m === selM && c.d === selD;
    const cls   = ['dp-day', c.other ? 'dp-day-other':'', today ? 'dp-day-today':'', sel ? 'dp-day-sel':''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-y="${c.y}" data-m="${c.m}" data-d="${c.d}"><span class="dp-day-num">${c.d}</span></button>`;
  }).join('');
}

// ── Single panel at a time ────────────────────────────────────────────────────
let _openClose = null;

function _closeAll() { if (_openClose) { _openClose(); _openClose = null; } }

// Document-level click handler (bubble) to close panel when clicking outside
document.addEventListener('click', e => {
  if (!_openClose) return;
  // The open picker registers its containers; we check via data attribute
  const active = document.querySelector('.dp-panel:not([hidden])');
  if (!active) return;
  // If click is inside panel or inside the trigger-wrapper, keep open
  if (active.contains(e.target)) return;
  const wrapperId = active.dataset.wrapperId;
  if (wrapperId) {
    const w = document.getElementById(wrapperId);
    if (w && w.contains(e.target)) return;
  }
  _closeAll();
});

// ── Main wrap function ────────────────────────────────────────────────────────

let _wrapId = 0;

function wrapDateInput(input) {
  const isDateTime = input.type === 'datetime-local';
  const uid = 'dp-w-' + (++_wrapId);

  // State
  const now = new Date();
  let vy = now.getFullYear(), vm = now.getMonth() + 1;
  let sY = null, sM = null, sD = null, sH = 0, sMin = 0;

  if (input.value) {
    const p = _parseVal(input.value, isDateTime);
    if (p) { sY = p.y; sM = p.m; sD = p.d; vy = p.y; vm = p.m; sH = p.hh; sMin = p.mm; }
  }

  // Wrapper (stays in form flow)
  const wrapper = document.createElement('div');
  wrapper.className = 'dp-wrapper';
  wrapper.id = uid;

  // Trigger button — use <button> for guaranteed click events
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dp-trigger';

  // Floating panel appended to body (escapes all overflow/stacking issues)
  const panel = document.createElement('div');
  panel.className = 'dp-panel';
  panel.hidden = true;
  panel.dataset.wrapperId = uid;
  document.body.appendChild(panel);

  // Hide original input (kept for FormData / getElementById value reads)
  input.style.cssText = 'display:none!important';
  input.removeAttribute('required');

  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(btn);
  wrapper.appendChild(input);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setInput() {
    input.value = (sY && sM && sD) ? _buildVal(sY, sM, sD, sH, sMin, isDateTime) : '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input',  { bubbles: true }));
  }

  function setBtn() {
    if (sY && sM && sD) {
      btn.classList.remove('dp-placeholder');
      btn.textContent = _fmtThai(sY, sM, sD, sH, sMin, isDateTime);
    } else {
      btn.classList.add('dp-placeholder');
      btn.textContent = isDateTime ? 'เลือกวันและเวลา' : 'เลือกวันที่';
    }
  }

  // ── Panel render ──────────────────────────────────────────────────────────

  function draw() {
    const time = isDateTime ? `
      <div class="dp-time">
        <span class="dp-time-label">เวลา</span>
        <select class="dp-sel dp-time-h">
          ${Array.from({length:24},(_,i)=>`<option value="${i}"${i===sH?' selected':''}>${String(i).padStart(2,'0')}</option>`).join('')}
        </select>
        <span class="dp-time-sep">:</span>
        <select class="dp-sel dp-time-m">
          ${Array.from({length:60},(_,i)=>`<option value="${i}"${i===sMin?' selected':''}>${String(i).padStart(2,'0')}</option>`).join('')}
        </select>
        <span class="dp-time-unit">น.</span>
      </div>` : '';

    panel.innerHTML = `
      <div class="dp-nav">
        <button type="button" class="dp-nav-btn" data-dir="-1">‹</button>
        <span class="dp-nav-label">${_MONTHS[vm - 1]} ${vy + 543}</span>
        <button type="button" class="dp-nav-btn" data-dir="1">›</button>
      </div>
      <div class="dp-grid">
        ${_DOW.map(d=>`<div class="dp-dow">${d}</div>`).join('')}
        ${_calCells(vy, vm, sY, sM, sD)}
      </div>
      ${time}
      <div class="dp-footer">
        <button type="button" class="dp-clear-btn">ล้าง</button>
        <button type="button" class="dp-today-btn">วันนี้</button>
      </div>`;

    panel.querySelectorAll('.dp-nav-btn').forEach(b => b.addEventListener('click', () => {
      vm += Number(b.dataset.dir);
      if (vm < 1)  { vm = 12; vy--; }
      if (vm > 12) { vm = 1;  vy++; }
      draw();
    }));

    panel.querySelectorAll('.dp-day').forEach(b => b.addEventListener('click', () => {
      sY = Number(b.dataset.y); sM = Number(b.dataset.m); sD = Number(b.dataset.d);
      vy = sY; vm = sM;
      setInput(); setBtn();
      if (!isDateTime) close(); else draw();
    }));

    panel.querySelector('.dp-time-h')?.addEventListener('change', e => {
      sH = Number(e.target.value); setInput(); setBtn();
    });
    panel.querySelector('.dp-time-m')?.addEventListener('change', e => {
      sMin = Number(e.target.value); setInput(); setBtn();
    });
    panel.querySelector('.dp-clear-btn')?.addEventListener('click', () => {
      sY = sM = sD = null; sH = 0; sMin = 0; setInput(); setBtn(); close();
    });
    panel.querySelector('.dp-today-btn')?.addEventListener('click', () => {
      const t = new Date();
      sY = t.getFullYear(); sM = t.getMonth() + 1; sD = t.getDate(); vy = sY; vm = sM;
      if (isDateTime) { sH = t.getHours(); sMin = t.getMinutes(); }
      setInput(); setBtn();
      if (!isDateTime) close(); else draw();
    });
  }

  // ── Position panel (viewport-relative, fixed) ─────────────────────────────

  function position() {
    const r  = btn.getBoundingClientRect();
    const pw = Math.max(r.width, 268);
    panel.style.width  = pw + 'px';
    panel.style.left   = r.left + 'px';
    panel.style.top    = (r.bottom + 4) + 'px';
    panel.style.bottom = 'auto';

    // Flip above if clipped by bottom
    const ph = panel.offsetHeight || 300;
    if (r.bottom + 4 + ph > window.innerHeight - 8 && r.top > ph + 8) {
      panel.style.top    = 'auto';
      panel.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    }

    // Shift left if off right edge
    const right = r.left + pw;
    if (right > window.innerWidth - 8)
      panel.style.left = Math.max(8, window.innerWidth - pw - 8) + 'px';
  }

  // ── Open / close ──────────────────────────────────────────────────────────

  function close() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (_openClose === close) _openClose = null;
  }

  function open() {
    _closeAll();       // close any other open picker
    _openClose = close;
    draw();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    position();
  }

  // ── Button event ──────────────────────────────────────────────────────────

  btn.addEventListener('click', () => {
    panel.hidden ? open() : close();
  });

  btn.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  setBtn();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initDatePickers(root = document) {
  const ctx = (root.querySelectorAll ? root : document);
  ctx.querySelectorAll('input[type="date"], input[type="datetime-local"]').forEach(input => {
    if (input.dataset.dpInit) return;
    input.dataset.dpInit = '1';
    wrapDateInput(input);
  });
}
