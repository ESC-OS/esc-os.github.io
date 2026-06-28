const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                 'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const DAYS   = ['อา','จ','อ','พ','พฤ','ศ','ส'];

// Time slots allowed by the backend for pickup/return
const FIXED_TIMES = ['12:30', '16:30'];

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function fmtLabel(val, withTime) {
  if (!val) return '';
  try {
    const [dp, tp] = val.split('T');
    const [y, mo, d] = dp.split('-').map(Number);
    const date = tp ? new Date(y, mo - 1, d, ...tp.split(':').map(Number))
                    : new Date(y, mo - 1, d);
    if (withTime) {
      return date.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return val; }
}

const CAL_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

if (!window.__dpReady) {
  window.__dpReady = true;
  document.addEventListener('click', () => {
    document.querySelectorAll('.dp-wrap.dp-open').forEach(el => _closePanel(el));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.dp-wrap.dp-open').forEach(el => _closePanel(el));
  });
}
function _closePanel(el) {
  el.classList.remove('dp-open');
  el.querySelector('.dp-btn').setAttribute('aria-expanded', 'false');
  el.querySelector('.dp-panel').style.display = 'none';
}

/**
 * Returns HTML string for a date or datetime picker.
 *
 * @param {Object}  cfg
 * @param {string}  cfg.id
 * @param {string} [cfg.name]        Hidden input name for FormData
 * @param {string} [cfg.value]       Pre-filled ISO string (YYYY-MM-DD or YYYY-MM-DDTHH:MM)
 * @param {string} [cfg.min]         Min date ISO
 * @param {string} [cfg.max]         Max date ISO
 * @param {boolean}[cfg.withTime]    Include time picker
 * @param {boolean}[cfg.restricted]  Mon–Fri only + fixed time slots (12:30 / 16:00)
 */
export function renderPicker({ id, name, value = '', min = '', max = '', withTime = false, restricted = false }) {
  const ph = withTime ? 'เลือกวันที่และเวลา' : 'เลือกวันที่';
  const labelHtml = value
    ? `<span class="dp-lbl">${fmtLabel(value, withTime)}</span>`
    : `<span class="dp-lbl dp-ph">${ph}</span>`;

  // Determine pre-selected time for restricted mode
  const initTime = (() => {
    if (!restricted || !withTime || !value) return FIXED_TIMES[0];
    const tp = value.split('T')[1] ?? '';
    return FIXED_TIMES.includes(tp) ? tp : FIXED_TIMES[0];
  })();

  const timeSection = withTime ? (restricted ? `
      <div class="dp-time">
        <span class="dp-tlabel">เวลา</span>
        ${FIXED_TIMES.map(t => `<button type="button" class="dp-time-opt${t === initTime ? ' dp-time-sel' : ''}" data-t="${t}">${t}</button>`).join('')}
      </div>` : `
      <div class="dp-time">
        <span class="dp-tlabel">เวลา</span>
        <input type="number" class="dp-hour" min="0" max="23" value="08">
        <span class="dp-tsep">:</span>
        <input type="number" class="dp-min" min="0" max="59" value="00" step="15">
      </div>`) : '';

  return `<div class="dp-wrap${value ? ' dp-has-val' : ''}" id="${id}"
              data-value="${value}" data-mode="${withTime ? 'dt' : 'd'}"
              data-min="${min}" data-max="${max}"${restricted ? ' data-restricted="1"' : ''}>
    ${name ? `<input type="hidden" name="${name}" value="${value}">` : ''}
    <button type="button" class="dp-btn" aria-haspopup="true" aria-expanded="false">
      ${CAL_ICON}
      ${labelHtml}
    </button>
    <div class="dp-panel" style="display:none">
      <div class="dp-cal-hdr">
        <button type="button" class="dp-nav" data-dir="-1">‹</button>
        <span class="dp-mlabel"></span>
        <button type="button" class="dp-nav" data-dir="1">›</button>
      </div>
      <div class="dp-wdays">${DAYS.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="dp-days"></div>
      ${timeSection}
      <div class="dp-foot">
        <button type="button" class="dp-clear">ล้าง</button>
        <button type="button" class="dp-ok">ตกลง</button>
      </div>
    </div>
  </div>`;
}

/**
 * Wires up a rendered picker. Returns { getValue, setValue, setRange }.
 * Safe to call if element not found (returns undefined).
 *
 * @param {string}    id
 * @param {Function} [onChange]  Called with ISO string (or '') when value commits
 */
export function initPicker(id, onChange) {
  const el = document.getElementById(id);
  if (!el) return;

  const btn        = el.querySelector('.dp-btn');
  const panel      = el.querySelector('.dp-panel');
  const hidden     = el.querySelector('input[type="hidden"]');
  const lbl        = el.querySelector('.dp-lbl');
  const daysEl     = el.querySelector('.dp-days');
  const mlabel     = el.querySelector('.dp-mlabel');
  const hourEl     = el.querySelector('.dp-hour');
  const minEl      = el.querySelector('.dp-min');
  const withTime   = el.dataset.mode === 'dt';
  const restricted = el.dataset.restricted === '1';
  const ph = withTime ? 'เลือกวันที่และเวลา' : 'เลือกวันที่';

  // For restricted mode: track the selected fixed time slot
  let selTime = FIXED_TIMES[0];

  function parseMinMax(s) {
    if (!s) return null;
    const [dp] = s.split('T');
    const [y, m, d] = dp.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  let minDate = parseMinMax(el.dataset.min);
  let maxDate = parseMinMax(el.dataset.max);

  const now = new Date();
  let viewYear  = now.getFullYear();
  let viewMonth = now.getMonth();

  let selY = 0, selM = 0, selD = 0, selSet = false;

  function loadValue(val) {
    if (!val) { selSet = false; return; }
    const [dp, tp] = val.split('T');
    const [y, m, d] = dp.split('-').map(Number);
    selY = y; selM = m - 1; selD = d; selSet = true;
    viewYear = y; viewMonth = m - 1;
    if (withTime && tp) {
      if (restricted) {
        selTime = FIXED_TIMES.includes(tp) ? tp : FIXED_TIMES[0];
      } else {
        const [hh, mm] = tp.split(':').map(Number);
        if (hourEl) hourEl.value = pad(hh);
        if (minEl)  minEl.value  = pad(mm);
      }
    }
  }
  loadValue(el.dataset.value);

  function isWeekend(y, m, d) {
    const day = new Date(y, m, d).getDay();
    return day === 0 || day === 6;
  }

  function isDis(y, m, d) {
    if (restricted && isWeekend(y, m, d)) return true;
    const dt = new Date(y, m, d);
    if (minDate && dt < minDate) return true;
    if (maxDate && dt > maxDate) return true;
    return false;
  }

  function syncTimeOpts() {
    el.querySelectorAll('.dp-time-opt').forEach(b => {
      b.classList.toggle('dp-time-sel', b.dataset.t === selTime);
    });
  }

  function renderCal() {
    mlabel.textContent = `${MONTHS[viewMonth]} ${viewYear + 543}`;
    const first  = new Date(viewYear, viewMonth, 1).getDay();
    const total  = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());
    const selISO = selSet ? toISO(selY, selM, selD) : '';
    let html = '';
    for (let i = 0; i < first; i++) html += `<button type="button" class="dp-day dp-empty" disabled></button>`;
    for (let d = 1; d <= total; d++) {
      const iso = toISO(viewYear, viewMonth, d);
      const dis = isDis(viewYear, viewMonth, d);
      const wkd = restricted && isWeekend(viewYear, viewMonth, d);
      html += `<button type="button" class="dp-day${iso === selISO ? ' dp-sel' : ''}${iso === todISO ? ' dp-tod' : ''}${dis ? ' dp-dis' : ''}${wkd ? ' dp-wknd' : ''}"
                 data-y="${viewYear}" data-m="${viewMonth}" data-d="${d}"${dis ? ' disabled' : ''}>${d}</button>`;
    }
    daysEl.innerHTML = html;
    daysEl.querySelectorAll('.dp-day:not(.dp-dis):not(.dp-empty)').forEach(day => {
      day.addEventListener('click', e => {
        e.stopPropagation();
        selY = +day.dataset.y; selM = +day.dataset.m; selD = +day.dataset.d; selSet = true;
        renderCal();
        if (!withTime) commit();
      });
    });
  }

  function getVal() {
    if (!selSet) return '';
    const base = toISO(selY, selM, selD);
    if (!withTime) return base;
    if (restricted) return `${base}T${selTime}`;
    const h = Math.min(23, Math.max(0, parseInt(hourEl?.value ?? 0) || 0));
    const m = Math.min(59, Math.max(0, parseInt(minEl?.value  ?? 0) || 0));
    return `${base}T${pad(h)}:${pad(m)}`;
  }

  function commit() {
    const val = getVal();
    if (hidden) hidden.value = val;
    el.dataset.value = val;
    if (val) {
      lbl.textContent = fmtLabel(val, withTime);
      lbl.classList.remove('dp-ph');
      el.classList.add('dp-has-val');
    } else {
      lbl.textContent = ph;
      lbl.classList.add('dp-ph');
      el.classList.remove('dp-has-val');
    }
    _closePanel(el);
    onChange?.(val);
  }

  function open() {
    document.querySelectorAll('.dp-wrap.dp-open').forEach(o => { if (o !== el) _closePanel(o); });
    renderCal();
    if (restricted) syncTimeOpts();
    panel.style.left = ''; panel.style.right = '';
    panel.style.display = '';
    el.classList.add('dp-open');
    btn.setAttribute('aria-expanded', 'true');
    const rect = panel.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) { panel.style.left = 'auto'; panel.style.right = '0'; }
  }

  btn.addEventListener('click', e => { e.stopPropagation(); el.classList.contains('dp-open') ? _closePanel(el) : open(); });
  panel.addEventListener('click', e => e.stopPropagation());

  el.querySelector('[data-dir="-1"]').addEventListener('click', e => {
    e.stopPropagation();
    viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderCal();
  });
  el.querySelector('[data-dir="1"]').addEventListener('click', e => {
    e.stopPropagation();
    viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCal();
  });

  // Fixed time slot buttons (restricted mode)
  el.querySelectorAll('.dp-time-opt').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selTime = btn.dataset.t;
      syncTimeOpts();
    });
  });

  el.querySelector('.dp-ok').addEventListener('click', e => { e.stopPropagation(); commit(); });
  el.querySelector('.dp-clear').addEventListener('click', e => {
    e.stopPropagation();
    selSet = false;
    selTime = FIXED_TIMES[0];
    if (hourEl) hourEl.value = '08';
    if (minEl)  minEl.value  = '00';
    if (restricted) syncTimeOpts();
    commit();
  });

  return {
    getValue: () => el.dataset.value,
    setValue(val, silent = false) {
      loadValue(val);
      if (hidden) hidden.value = val;
      el.dataset.value = val;
      if (val) {
        lbl.textContent = fmtLabel(val, withTime);
        lbl.classList.remove('dp-ph');
        el.classList.add('dp-has-val');
      } else {
        lbl.textContent = ph;
        lbl.classList.add('dp-ph');
        el.classList.remove('dp-has-val');
      }
      minDate = parseMinMax(el.dataset.min);
      maxDate = parseMinMax(el.dataset.max);
      if (!silent) onChange?.(val);
    },
    setRange(min, max) {
      el.dataset.min = min; el.dataset.max = max;
      minDate = parseMinMax(min); maxDate = parseMinMax(max);
    },
  };
}
