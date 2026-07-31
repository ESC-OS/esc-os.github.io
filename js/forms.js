import {
  getProject, createProject, updateProject,
  getProjects, getSlots, getItems, getHolidays,
  createRequest, updateRequest, addRequestItem, removeRequestItem, adjustRequestItem, submitRequest,
  createDeposit, updateDeposit, addDepositItem, submitDeposit,
  createVisit, getRequests,
} from './api.js';
import { h, openModal, showError } from './ui.js';

const ORG_TYPES = [
  'ESC: พัฒนาองค์กร', 'ESC: การเงิน', 'ESC: เลขานุการ', 'ESC: เทคโนโลยี',
  'ESC: ประชาสัมพันธ์และการตลาด', 'ESC: วิชาการ', 'ESC: กิจการภายใน',
  'ESC: กิจการภายนอก', 'ESC: นิสิตสัมพันธ์', 'ESC: CSR', 'ESC: Sustain',
  'ESC: OS', 'ชมรม', 'โครงการ', 'ภาค', 'Group',
];

function _wide() {
  document.querySelector('#modal-root .modal-box')?.classList.add('modal-wide');
}

// ── Project Modal ────────────────────────────────────────────────────────────

export async function openProjectModal({ editId, onSuccess } = {}) {
  const title = editId ? 'แก้ไขโครงการ' : 'สร้างโครงการ';

  let existing = null;
  if (editId) {
    const lc = openModal(title, '<div class="spinner" style="margin:2rem auto"></div>');
    try {
      existing = (await getProject(editId)).data;
      lc();
    } catch (err) {
      lc(); showError('โหลดข้อมูลไม่สำเร็จ: ' + err.message); return;
    }
  }

  const cur = existing?.org_type || existing?.organization_type || '';
  const dv  = f => existing?.[f] ? String(existing[f]).slice(0, 10) : '';

  const close = openModal(title, `
    <div id="pf-err" style="margin-bottom:.5rem"></div>
    <form id="pf-form" class="form" style="padding:0">
      <div class="form-group">
        <label class="form-label">ชื่อโครงการ <span class="form-required">*</span></label>
        <input class="form-input" type="text" name="name" required autocomplete="off"
          placeholder="ชื่อโครงการ" value="${h(existing?.name ?? '')}">
      </div>
      <div class="form-group">
        <label class="form-label">ประเภทโครงการ <span class="form-required">*</span></label>
        <select class="form-select" name="org_type" required>
          <option value="">-- เลือกประเภทโครงการ --</option>
          ${ORG_TYPES.map(t => `<option value="${h(t)}"${cur === t ? ' selected' : ''}>${h(t)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">คำอธิบาย</label>
        <textarea class="form-textarea" name="description" rows="3"
          placeholder="รายละเอียดโครงการ (ไม่บังคับ)">${h(existing?.description ?? '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">วันเริ่มต้น <span class="form-required">*</span></label>
          <input class="form-input" type="date" name="start_date" required value="${dv('start_date')}">
        </div>
        <div class="form-group">
          <label class="form-label">วันสิ้นสุด <span class="form-required">*</span></label>
          <input class="form-input" type="date" name="end_date" required value="${dv('end_date')}">
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" id="pf-submit">
          ${editId ? 'บันทึกการแก้ไข' : 'สร้างโครงการ'}
        </button>
        <button type="button" class="btn btn-secondary" id="pf-cancel">ยกเลิก</button>
      </div>
    </form>`);

  document.getElementById('pf-cancel').addEventListener('click', close);

  document.getElementById('pf-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd    = new FormData(e.target);
    const errEl = document.getElementById('pf-err');
    errEl.innerHTML = '';

    const start = fd.get('start_date'), end = fd.get('end_date');
    if (end && start && end <= start) {
      errEl.innerHTML = '<div class="alert alert-error">วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น</div>';
      return;
    }
    const orgType = fd.get('org_type');
    if (!orgType) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกประเภทโครงการ</div>';
      return;
    }

    const btn = document.getElementById('pf-submit');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';

    const data = {
      name:              fd.get('name'),
      organization_type: orgType,
      description: fd.get('description') || undefined,
      start_date:  start,
      end_date:    end,
    };

    try {
      if (editId) {
        await updateProject(editId, data);
        close(); onSuccess?.();
      } else {
        const res = await createProject(data);
        close(); onSuccess?.(res.data);
      }
    } catch (e2) {
      errEl.innerHTML = `<div class="alert alert-error">${h(e2.message)}</div>`;
      btn.disabled = false;
      btn.textContent = editId ? 'บันทึกการแก้ไข' : 'สร้างโครงการ';
    }
  });
}

// ── Request Modal (2-step) ───────────────────────────────────────────────────

const _DOW = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
function _dowNum(v) { return typeof v === 'number' ? (v + 1) % 7 : (_DOW[v] ?? -1); }

function _upcomingSlots(slot, weeks = 4) {
  const out = [], now = new Date();
  const target = _dowNum(slot.day_of_week);
  const [hh, mm] = slot.time.split(':').map(Number);
  for (let w = 0; w < weeks * 7 + 7; w++) {
    const d = new Date(now); d.setDate(now.getDate() + w);
    if (d.getDay() !== target) continue;
    d.setHours(hh, mm, 0, 0);
    if (d <= now) continue;
    out.push(d);
    if (out.length >= weeks) break;
  }
  return out;
}

function _toLocalInput(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function _thaiDT(d) {
  return d.toLocaleString('th-TH', { weekday:'short', day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function _thaiDate(d) {
  return d.toLocaleDateString('th-TH', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

function _toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export async function openRequestModal({ projectId, onSuccess } = {}) {
  const lc = openModal('สร้างคำขอยืม', '<div class="spinner" style="margin:2rem auto"></div>');

  let projects = [];
  try {
    projects = await getProjects().then(r => r?.data ?? []);
  } catch (err) {
    lc(); showError('โหลดข้อมูลไม่สำเร็จ: ' + err.message); return;
  }
  lc();

  const close = openModal('สร้างคำขอยืม', `
    <div id="rq-err" style="margin-bottom:.5rem"></div>
    <form id="rq-form" class="form" style="padding:0">
      <div class="form-group">
        <label class="form-label">ชื่อคำขอ <span class="form-required">*</span></label>
        <input class="form-input" type="text" name="name" required autocomplete="off"
          placeholder="เช่น คำขอยืมอุปกรณ์ถ่ายภาพ">
      </div>
      <div class="form-group">
        <label class="form-label">โครงการ <span class="form-required">*</span></label>
        <select class="form-select" name="project_id" id="rq-proj" required>
          <option value="">-- เลือกโครงการ --</option>
          ${projects.map(p => `<option value="${h(p.id)}"${projectId===p.id?' selected':''}
            data-start="${h(p.start_date||'')}" data-end="${h(p.end_date||'')}">${h(p.name)}</option>`).join('')}
        </select>
        <span class="form-hint" id="rq-proj-hint"></span>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" id="rq-next">สร้างคำขอ</button>
        <button type="button" class="btn btn-secondary" id="rq-cancel">ยกเลิก</button>
      </div>
    </form>`);

  document.getElementById('rq-cancel').addEventListener('click', close);
  document.getElementById('rq-proj')?.addEventListener('change', e => {
    const opt = e.target.selectedOptions[0];
    const hint = document.getElementById('rq-proj-hint');
    hint.textContent = opt?.dataset.start ? `ช่วงโครงการ: ${opt.dataset.start} → ${opt.dataset.end}` : '';
  });

  document.getElementById('rq-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd   = new FormData(e.target);
    const name = fd.get('name')?.trim();
    const proj = fd.get('project_id');
    const errEl = document.getElementById('rq-err');
    errEl.innerHTML = '';

    if (!name) { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุชื่อคำขอ</div>'; return; }
    if (!proj) { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกโครงการ</div>'; return; }

    const btn = document.getElementById('rq-next');
    btn.disabled = true; btn.textContent = 'กำลังสร้าง…';

    try {
      const res = await createRequest({ name, project_id: proj });
      const reqId = res?.data?.id;
      if (!reqId) throw new Error('ไม่ได้รับ ID คำขอจากเซิร์ฟเวอร์');
      window.location.href = `request-detail.html?id=${encodeURIComponent(reqId)}`;
    } catch (e2) {
      errEl.innerHTML = `<div class="alert alert-error">${h(e2.message)}</div>`;
      btn.disabled = false; btn.textContent = 'สร้างคำขอ';
    }
  });
}

// ── Deposit Modal ────────────────────────────────────────────────────────────

export async function openDepositModal({ projectId, onSuccess } = {}) {
  const lc = openModal('ฝากของใหม่', '<div class="spinner" style="margin:2rem auto"></div>');

  let projects = [];
  try {
    projects = (await getProjects())?.data ?? [];
  } catch (err) {
    lc(); showError('โหลดข้อมูลไม่สำเร็จ: ' + err.message); return;
  }
  lc();

  if (!projects.length) {
    const nc = openModal('ฝากของใหม่', `
      <div class="alert alert-warning">คุณยังไม่มีโครงการ กรุณาสร้างโครงการก่อน</div>
      <div class="form-actions">
        <a href="projects.html" class="btn btn-primary">ไปที่โครงการ</a>
        <button class="btn btn-secondary" id="dep-nc">ปิด</button>
      </div>`);
    document.getElementById('dep-nc')?.addEventListener('click', nc);
    return;
  }

  const items = [];

  function updateItemsList() {
    const el = document.getElementById('dep-ilist');
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<p class="empty-text" style="margin:0">ยังไม่มีรายการสิ่งของ</p>';
    } else {
      el.innerHTML = `<div>${items.map((it, i) => `
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem;font-size:.85rem">
          <span style="flex:1">${h(it.name)} × ${it.quantity}${it.note ? ` <span style="color:var(--text-muted);font-size:.8rem">(${h(it.note)})</span>` : ''}</span>
          <button class="btn btn-sm btn-danger dep-rm" data-i="${i}">ลบ</button>
        </div>`).join('')}
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:.15rem">รวม ${items.length} รายการ</div>
      </div>`;
    }
    el.querySelectorAll('.dep-rm').forEach(b => {
      b.addEventListener('click', () => { items.splice(+b.dataset.i, 1); updateItemsList(); });
    });
  }

  const close = openModal('ฝากของใหม่', `
    <div id="dep-err" style="margin-bottom:.5rem"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;align-items:start">
      <div class="form" style="padding:0">
        <div class="form-group">
          <label class="form-label">โครงการ <span class="form-required">*</span></label>
          <select class="form-select" id="dep-proj">
            <option value="">-- เลือกโครงการ --</option>
            ${projects.map(p => `<option value="${h(p.id)}"${p.id===projectId?' selected':''}>${h(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">วันฝาก <span class="form-required">*</span></label>
          <input class="form-input" type="date" id="dep-date">
        </div>
        <div class="form-group">
          <label class="form-label">วันรับคืน <span class="form-required">*</span></label>
          <input class="form-input" type="date" id="dep-wdate">
          <span class="form-hint">สูงสุด 7 วันทำการ</span>
        </div>
      </div>
      <div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.35rem">รายการของที่ฝาก</div>
        <div style="background:var(--bg);padding:.65rem;border-radius:var(--radius);border:1px solid var(--border);margin-bottom:.65rem">
          <div style="display:flex;gap:.5rem;margin-bottom:.35rem">
            <input class="form-input" type="text" id="dep-iname" placeholder="ชื่อสิ่งของ"
              autocomplete="off" style="flex:2;font-size:.85rem">
            <input class="form-input" type="number" id="dep-iqty" value="1" min="1"
              style="width:60px;font-size:.85rem">
          </div>
          <input class="form-input" type="text" id="dep-inote" placeholder="หมายเหตุ (ไม่บังคับ)"
            autocomplete="off" style="font-size:.85rem;margin-bottom:.35rem">
          <div id="dep-ierr" style="margin-bottom:.25rem"></div>
          <button class="btn btn-secondary btn-sm" id="dep-iadd">+ เพิ่มสิ่งของ</button>
        </div>
        <div id="dep-ilist"></div>
      </div>
    </div>
    <div class="form-actions" style="margin-top:1rem">
      <button class="btn btn-primary" id="dep-submit">ส่งคำขอ</button>
      <button class="btn btn-secondary" id="dep-cancel">ยกเลิก</button>
    </div>`);
  _wide();

  updateItemsList();
  document.getElementById('dep-cancel').addEventListener('click', close);

  document.getElementById('dep-iadd').addEventListener('click', () => {
    const errEl = document.getElementById('dep-ierr');
    const name  = (document.getElementById('dep-iname').value ?? '').trim();
    const qty   = parseInt(document.getElementById('dep-iqty').value ?? '1', 10);
    const note  = (document.getElementById('dep-inote').value ?? '').trim();
    errEl.innerHTML = '';
    if (!name) { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุชื่อสิ่งของ</div>'; return; }
    items.push({ name, quantity: isNaN(qty)||qty<1 ? 1 : qty, note: note||'' });
    document.getElementById('dep-iname').value = '';
    document.getElementById('dep-iqty').value  = '1';
    document.getElementById('dep-inote').value = '';
    updateItemsList();
  });

  document.getElementById('dep-submit').addEventListener('click', async () => {
    const errEl  = document.getElementById('dep-err');
    const projId = document.getElementById('dep-proj').value.trim();
    const depD   = document.getElementById('dep-date').value.trim();
    const witD   = document.getElementById('dep-wdate').value.trim();
    errEl.innerHTML = '';
    if (!projId)      { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกโครงการ</div>'; return; }
    if (!depD)        { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันฝาก</div>'; return; }
    if (!witD)        { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันรับคืน</div>'; return; }
    if (!items.length){ errEl.innerHTML = '<div class="alert alert-error">กรุณาเพิ่มรายการสิ่งของอย่างน้อย 1 รายการ</div>'; return; }

    const btn = document.getElementById('dep-submit');
    btn.disabled = true; btn.textContent = 'กำลังส่งคำขอ…';
    try {
      const cr  = await createDeposit(projId);
      const did = cr.data.id;
      await updateDeposit(did, { deposit_date: depD, withdraw_date: witD });
      for (const it of items)
        await addDepositItem(did, { name: it.name, quantity: it.quantity, ...(it.note ? { note: it.note } : {}) });
      await submitDeposit(did);
      close(); onSuccess?.(did);
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'ส่งคำขอ';
    }
  });
}

// ── Visit Modal ──────────────────────────────────────────────────────────────

const _THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function _nextDates(slot, n = 4) {
  const target = _dowNum(slot.day_of_week);
  const today = new Date(); today.setHours(0,0,0,0);
  const dates = [], cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1);
  while (dates.length < n) {
    if (cursor.getDay() === target) dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`);
    cursor.setDate(cursor.getDate() + 1);
    if (cursor - today > 60 * 864e5) break;
  }
  return dates;
}

export async function openVisitModal({ projectId, onSuccess } = {}) {
  const lc = openModal('จองเยี่ยมชม', '<div class="spinner" style="margin:2rem auto"></div>');

  let projects = [], slots = [], reqs = [], holidays = [];
  try {
    const year = new Date().getFullYear();
    const [pr, sr, rr, hr, hr2] = await Promise.all([
      getProjects(),
      getSlots('visit'),
      getRequests('in_lend').catch(() => null),
      getHolidays(year).catch(() => ({ data: [] })),
      getHolidays(year + 1).catch(() => ({ data: [] })),
    ]);
    projects = pr.data ?? [];
    slots    = sr.data ?? [];
    reqs     = rr?.requests ?? rr?.data ?? [];
    holidays = [...(hr?.data ?? []), ...(hr2?.data ?? [])].map(hd => hd.date);
  } catch (err) {
    lc(); showError('โหลดข้อมูลไม่สำเร็จ: ' + err.message); return;
  }

  // Build available dates: date string → sorted times[]
  const holidaySet = new Set(holidays);
  const availMap   = new Map();
  for (const s of slots.filter(s => s.is_active && s.service_type === 'visit')) {
    for (const date of _nextDates(s, 8)) {
      if (holidaySet.has(date)) continue;
      if (!availMap.has(date)) availMap.set(date, []);
      if (!availMap.get(date).includes(s.time)) availMap.get(date).push(s.time);
    }
  }
  availMap.forEach(times => times.sort());

  // Calendar state
  const today    = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const MONTHS   = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const DAYS     = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  let calY = today.getFullYear(), calM = today.getMonth();
  let selDate = null, selTime = null;

  function ds(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

  lc();
  const close = openModal('จองเยี่ยมชม', `
    <div id="vt-err" style="margin-bottom:.5rem"></div>
    <div class="form" style="padding:0">
      <div class="form-group">
        <label class="form-label">โครงการ <span class="form-required">*</span></label>
        <select class="form-select" id="vt-proj">
          <option value="">-- เลือกโครงการ --</option>
          ${projects.map(p => `<option value="${h(p.id)}"${p.id===projectId?' selected':''}>${h(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">วันเยี่ยมชม <span class="form-required">*</span></label>
        ${availMap.size === 0
          ? `<p style="color:var(--error);font-size:.85rem;margin:0">ไม่มีช่วงเวลาที่เปิดให้จอง</p>`
          : `<div id="vt-cal"></div><div id="vt-times"></div>`}
      </div>
      <div class="form-group">
        <label class="form-label">จำนวนคน <span class="form-required">*</span></label>
        <input class="form-input" type="number" id="vt-num" min="1" max="5" value="1">
        <span class="form-hint">ไม่เกิน 5 คนต่อการจอง</span>
      </div>
      <div class="form-group">
        <label class="form-label">คำขอยืมที่เกี่ยวข้อง (ไม่บังคับ)</label>
        <select class="form-select" id="vt-req">
          <option value="">-- ไม่เชื่อมโยง --</option>
          ${reqs.map(r => `<option value="${h(r.id)}">#${h(r.id)} — ${h(r.project_name||r.project_id||'')}</option>`).join('')}
        </select>
      </div>
      <div class="form-actions" style="margin-top:1rem">
        <button class="btn btn-primary" id="vt-submit">ส่งคำขอ</button>
        <button class="btn btn-secondary" id="vt-cancel">ยกเลิก</button>
      </div>
    </div>`);

  function renderCal() {
    const el = document.getElementById('vt-cal');
    if (!el) return;
    const firstDow  = new Date(calY, calM, 1).getDay();
    const daysInMo  = new Date(calY, calM + 1, 0).getDate();
    const maxDate   = new Date(today); maxDate.setDate(maxDate.getDate() + 60);
    const canPrev   = calY > today.getFullYear() || calM > today.getMonth();
    const canNext   = new Date(calY, calM + 1, 1) <= maxDate;
    const navBtn = (id, label, on) =>
      `<button type="button" id="${id}" style="background:none;border:1px solid var(--border);border-radius:6px;width:28px;height:28px;cursor:${on?'pointer':'default'};color:${on?'var(--text)':'var(--border-strong,#ccc)'}" ${!on?'disabled':''}>${label}</button>`;

    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div></div>';
    for (let d = 1; d <= daysInMo; d++) {
      const date    = ds(calY, calM, d);
      const avail   = availMap.has(date) && date >= todayStr;
      const selected = date === selDate;
      let bg = 'transparent', color = 'var(--text-muted)', cursor = 'default', border = 'none', fw = '400';
      if (selected)      { bg = 'var(--primary)'; color = '#fff'; cursor = 'pointer'; fw = '700'; }
      else if (avail)    { bg = 'var(--primary-50,#fdf2f2)'; color = 'var(--primary)'; cursor = 'pointer'; border = '1px solid var(--primary)'; fw = '600'; }
      cells += `<div style="text-align:center;padding:2px">
        <div class="${avail?'vt-day':''}\" data-date="${avail?date:''}"
          style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;
            font-size:.83em;margin:auto;background:${bg};color:${color};cursor:${cursor};border:${border};font-weight:${fw}">
          ${d}
        </div>
      </div>`;
    }

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
        ${navBtn('vt-prev','‹',canPrev)}
        <span style="font-weight:700;font-size:.88em">${MONTHS[calM]} ${calY+543}</span>
        ${navBtn('vt-next','›',canNext)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:.25rem">
        ${DAYS.map((d,i) => `<div style="font-size:.7em;font-weight:700;text-align:center;padding:.25rem 0;color:${i===0?'var(--error)':'var(--text-muted)'}">${d}</div>`).join('')}
        ${cells}
      </div>`;

    document.getElementById('vt-prev')?.addEventListener('click', () => {
      if (!canPrev) return;
      if (--calM < 0) { calM = 11; calY--; }
      renderCal();
    });
    document.getElementById('vt-next')?.addEventListener('click', () => {
      if (!canNext) return;
      if (++calM > 11) { calM = 0; calY++; }
      renderCal();
    });
    el.querySelectorAll('.vt-day[data-date]').forEach(day => {
      if (!day.dataset.date) return;
      day.addEventListener('click', () => {
        selDate = day.dataset.date; selTime = null;
        renderCal(); renderTimes();
      });
    });
  }

  function renderTimes() {
    const el = document.getElementById('vt-times');
    if (!el || !selDate) { if (el) el.innerHTML = ''; return; }
    const times = availMap.get(selDate) ?? [];
    el.innerHTML = `
      <div style="margin-top:.5rem">
        <label class="form-label" style="font-size:.82em;color:var(--text-muted)">เวลา <span class="form-required">*</span></label>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.25rem">
          ${times.map(t => `
            <button type="button" class="vt-time" data-time="${h(t)}"
              style="padding:.3rem .9rem;border-radius:20px;font-size:.88em;cursor:pointer;
                border:1px solid ${t===selTime?'var(--primary)':'var(--border)'};
                background:${t===selTime?'var(--primary)':'#fff'};
                color:${t===selTime?'#fff':'var(--text)'}">
              ${h(t)}
            </button>`).join('')}
        </div>
      </div>`;
    el.querySelectorAll('.vt-time').forEach(btn => {
      btn.addEventListener('click', () => { selTime = btn.dataset.time; renderTimes(); });
    });
  }

  renderCal();

  document.getElementById('vt-cancel').addEventListener('click', close);
  document.getElementById('vt-submit').addEventListener('click', async () => {
    const pId   = document.getElementById('vt-proj').value;
    const num   = parseInt(document.getElementById('vt-num').value, 10);
    const rId   = document.getElementById('vt-req').value || undefined;
    const errEl = document.getElementById('vt-err');
    errEl.innerHTML = '';
    if (!pId)               { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกโครงการ</div>'; return; }
    if (!selDate)           { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกวันเยี่ยมชม</div>'; return; }
    if (!selTime)           { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกเวลา</div>'; return; }
    if (!num||num<1||num>5) { errEl.innerHTML = '<div class="alert alert-error">จำนวนคนต้องอยู่ระหว่าง 1 ถึง 5</div>'; return; }
    const btn = document.getElementById('vt-submit');
    btn.disabled = true; btn.textContent = 'กำลังส่ง…';
    try {
      await createVisit({ project_id: pId, visit_date: selDate, visit_time: selTime, num_people: num, borrow_request_id: rId });
      close(); onSuccess?.();
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'ส่งคำขอ';
    }
  });
}
