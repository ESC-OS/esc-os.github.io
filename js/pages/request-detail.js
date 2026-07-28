import { requireAuth } from '../auth.js';
import {
  getRequest, getRequestReturns, getNotifications,
  addRequestItem, removeRequestItem, adjustRequestItem,
  submitRequest, cancelRequest, processRequest, confirmPickup,
  getConditions, submitConditions, submitReturn, uploadPhoto, photoUrl,
  updateRequest, getSlots,
} from '../api.js';
import {
  h, statusBadge, formatDate, formatDateTime, formatCountdown,
  renderNavbar, showError, openModal,
} from '../ui.js';

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function thaiDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const DAYS   = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()+543}`;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.href = 'requests.html'; return; }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  async function renderPage() {
    app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

    let request, returns, conditions;
    try {
      const [reqRes, retRes, condRes] = await Promise.all([
        getRequest(id),
        getRequestReturns(id).catch(() => ({ data: [] })),
        getConditions(id).catch(() => ({ data: [] })),
      ]);
      request    = reqRes?.data;
      returns    = retRes?.data    ?? [];
      conditions = condRes?.data   ?? [];
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    if (!request) {
      app.innerHTML = '<div class="alert alert-error">ไม่พบคำขอ</div>';
      return;
    }

    const status  = request.status;
    const items   = request.items ?? [];
    const isAdmin = user.role === 'admin';
    const uid     = user.id;
    const isOwner =
      uid == request.user_id ||
      uid == request.created_by ||
      uid == request.requester_id ||
      uid == request.owner_id ||
      (request.user && uid == request.user.id) ||
      !isAdmin; // API already enforces: non-admins can only fetch their own requests

    // Fetch slots for draft submit section
    let timesByDay = {};
    let uniquePickupDates = [];
    let uniqueReturnDates = [];

    if (status === 'draft' && isOwner) {
      const DAY_NUM = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 };
      const slotsRes = await getSlots('borrow').catch(() => ({ data: [] }));
      const active = (slotsRes?.data ?? []).filter(s => s.is_active);

      const allowedDays = new Set(active.map(s => DAY_NUM[s.day_of_week]).filter(n => n != null));
      active.forEach(s => {
        const dn = DAY_NUM[s.day_of_week];
        if (dn == null) return;
        if (!timesByDay[dn]) timesByDay[dn] = [];
        const t = s.time.slice(0, 5);
        if (!timesByDay[dn].includes(t)) timesByDay[dn].push(t);
      });
      Object.keys(timesByDay).forEach(k => timesByDay[k].sort());

      // Pickup: tomorrow → +60 days on slot days
      const start = new Date(); start.setDate(start.getDate() + 1);
      const end   = new Date(); end.setDate(end.getDate() + 60);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (allowedDays.has(d.getDay())) uniquePickupDates.push(toDateStr(new Date(d)));
      }

      // Return: tomorrow → +90 days on slot days (same slot-day rule, backend validates)
      const retEnd = new Date(); retEnd.setDate(retEnd.getDate() + 90);
      for (let d = new Date(start); d <= retEnd; d.setDate(d.getDate() + 1)) {
        if (allowedDays.has(d.getDay())) uniqueReturnDates.push(toDateStr(new Date(d)));
      }
    }

    const showApproved  = ['processing','ready_for_pickup','in_lend','returned','completed'].includes(status);
    const inLendStatuses = ['in_lend'];
    const approvedItems  = items.filter(it => (it.quantity_approved ?? 0) > 0);

    // ── Items table ──────────────────────────────────────────────────────────
    function itemsTableHtml() {
      const canEdit      = isAdmin && status === 'processing';
      const canRemove    = isOwner && status === 'draft';
      const canEditDraft = isOwner && status === 'draft';
      return `<table class="req-items-table">
        <thead><tr>
          <th style="width:7rem">รหัส</th>
          <th>ชื่ออุปกรณ์</th>
          <th style="text-align:center;width:6rem">จำนวนขอ</th>
          ${showApproved ? '<th style="text-align:center;width:6rem">จำนวนอนุมัติ</th>' : ''}
          <th style="width:5rem">หน่วย</th>
          ${canEdit   ? '<th style="width:10rem">ปรับจำนวน</th>' : ''}
          ${canRemove ? '<th style="width:3rem"></th>' : ''}
        </tr></thead>
        <tbody>
          ${items.length === 0
            ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">ยังไม่มีอุปกรณ์</td></tr>`
            : items.map(it => `
              <tr>
                <td style="font-size:.82em;color:var(--text-muted);font-family:monospace;white-space:nowrap">
                  ${h(it.item_id || '-')}
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:.5rem">
                    ${it.photo_r2_key
                      ? `<img src="${h(photoUrl(it.photo_r2_key))}" alt=""
                          style="width:32px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0;border:1px solid var(--border)">`
                      : `<div style="width:32px;height:32px;border-radius:4px;background:var(--surface-hover,#f3f4f6);display:flex;align-items:center;justify-content:center;font-size:.9em;flex-shrink:0;border:1px solid var(--border)">📦</div>`}
                    <span>${h(it.item_name || it.name || '-')}</span>
                  </div>
                </td>
                ${canEditDraft ? `
                  <td style="text-align:center">
                    <span class="qty-text">${h(String(it.quantity_requested ?? '-'))}</span>
                    <input type="number" class="qty-input edit-req-qty"
                      data-item-id="${h(it.item_id || it.id)}"
                      data-orig="${it.quantity_requested ?? 1}"
                      value="${it.quantity_requested ?? 1}" min="1"
                      style="display:none;width:52px;text-align:center;font-size:.88em">
                  </td>` : `
                  <td style="text-align:center">${h(String(it.quantity_requested ?? '-'))}</td>`}
                ${showApproved ? `<td style="text-align:center">${it.quantity_approved != null ? h(String(it.quantity_approved)) : '-'}</td>` : ''}
                <td style="color:${(it.item_unit || it.unit) ? 'inherit' : 'var(--text-muted)'}">
                  ${h(it.item_unit || it.unit || '-')}
                </td>
                ${canEdit ? `
                  <td>
                    <div style="display:flex;gap:.4rem;align-items:center">
                      <input type="number" class="qty-input adj-qty" style="width:70px"
                        data-item-id="${h(it.item_id || it.id)}"
                        value="${it.quantity_approved ?? it.quantity_requested}"
                        min="0" max="${it.quantity_requested}">
                      <button class="btn btn-sm btn-secondary do-adj"
                        data-item-id="${h(it.item_id || it.id)}">บันทึก</button>
                    </div>
                  </td>` : ''}
                ${canRemove ? `
                  <td>
                    <button class="btn btn-sm btn-danger do-remove"
                      data-item-id="${h(it.item_id || it.id)}">✕</button>
                  </td>` : ''}
              </tr>`).join('')}
        </tbody>
      </table>`;
    }

    // ── Browse button (draft owner) ────────────────────────────────────────
    function browseButtonHtml() {
      if (!(isOwner && status === 'draft')) return '';
      return `
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <a href="item-browse.html?request_id=${encodeURIComponent(id)}" class="btn btn-secondary">+ เพิ่มอุปกรณ์</a>
          ${items.length > 0 ? `
            <button class="btn btn-secondary" id="btn-edit-qty">แก้ไขจำนวน</button>
            <button class="btn btn-primary"   id="btn-save-qty"   style="display:none">บันทึก</button>
            <button class="btn btn-secondary" id="btn-cancel-qty" style="display:none">ยกเลิก</button>
          ` : ''}
        </div>`;
    }

    // ── Submit section (draft owner) ────────────────────────────────────────
    function submitSectionHtml() {
      if (!(isOwner && status === 'draft')) return '';
      let preDate = '', preReturn = '';
      if (request.requested_pickup_datetime) preDate   = request.requested_pickup_datetime.slice(0, 10);
      if (request.requested_return_datetime)  preReturn = request.requested_return_datetime.slice(0, 10);
      const noSlots = uniquePickupDates.length === 0;

      const triggerBtn = (id, value) => `
        <button type="button" id="${id}"
          style="width:100%;text-align:left;padding:.55rem .75rem;border-radius:8px;
            border:1px solid var(--border);background:var(--surface);cursor:pointer;
            font-family:inherit;font-size:.9em;display:flex;align-items:center;
            justify-content:space-between;color:${value ? 'var(--text)' : 'var(--text-muted)'}">
          <span>${value ? thaiDate(value) : 'เลือกวัน...'}</span>
          <span style="font-size:.7em;color:var(--text-muted)">▼</span>
        </button>`;

      const calDrop = id => `
        <div id="${id}" style="position:absolute;top:calc(100% + 4px);left:0;z-index:200;
          background:var(--surface);border:1px solid var(--border);border-radius:10px;
          box-shadow:var(--shadow-md);padding:1rem;display:none;min-width:280px">
        </div>`;

      return `
        <div class="card">
          <div class="card-title">ส่งคำขอยืม</div>

          ${items.length === 0 ? `
            <div style="background:var(--info-bg);border:1px solid #bcd4f5;border-radius:8px;
              padding:.75rem 1rem;margin-bottom:1rem;font-size:.88em;color:var(--info)">
              เพิ่มอุปกรณ์อย่างน้อย 1 รายการก่อนส่งคำขอ
            </div>` : ''}

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem">
            <div class="form-group">
              <label class="form-label">วันรับอุปกรณ์ <span class="form-required">*</span></label>
              ${noSlots
                ? `<p style="color:var(--text-muted);font-size:.88em;margin:.25rem 0 0">ไม่มีวันที่เปิดให้บริการ</p>`
                : `<div style="position:relative">
                    ${triggerBtn('btn-pick-date', preDate)}
                    ${calDrop('pickup-cal-drop')}
                  </div>`}
            </div>
            <div class="form-group">
              <label class="form-label">วันคืนอุปกรณ์ <span class="form-required">*</span></label>
              <div style="position:relative">
                ${triggerBtn('btn-pick-return', preReturn)}
                ${calDrop('return-cal-drop')}
              </div>
            </div>
          </div>

          <div id="time-group" style="${preDate ? '' : 'display:none'};margin-top:1rem">
            <div class="form-group">
              <label class="form-label">เวลารับ <span class="form-required">*</span></label>
              <div id="time-btns" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.3rem"></div>
            </div>
          </div>

          <div id="return-time-group" style="${preReturn ? '' : 'display:none'};margin-top:1rem">
            <div class="form-group">
              <label class="form-label">เวลาคืน <span class="form-required">*</span></label>
              <div id="return-time-btns" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.3rem"></div>
            </div>
          </div>

          <div id="submit-section-msg" style="margin-top:.75rem"></div>

          <div style="display:flex;justify-content:flex-end;margin-top:1rem">
            <button class="btn btn-success" id="btn-submit"
              style="padding:.55rem 1.75rem"
              ${items.length === 0 || noSlots ? 'disabled' : ''}>
              ส่งคำขอ
            </button>
          </div>
        </div>`;
    }

    // ── Process section (pending + admin) ────────────────────────────────────
    function processSectionHtml() {
      if (!(isAdmin && status === 'pending')) return '';
      return `
        <div class="process-section" style="margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem">
          <div class="form-group">
            <label class="form-label">หมายเหตุ <span style="color:var(--text-muted);font-size:.85em">(ไม่บังคับ)</span></label>
            <textarea class="form-textarea" id="process-note" style="min-height:60px"
              placeholder="หมายเหตุถึงผู้ขอ"></textarea>
          </div>
          <button class="btn btn-primary" id="btn-process">เริ่มดำเนินการ</button>
        </div>`;
    }

    // ── Condition report (in_lend + owner) ───────────────────────────────────
    function conditionReportHtml() {
      if (!(isOwner && inLendStatuses.includes(status) && approvedItems.length > 0)) return '';
      const prevConds = conditions.filter(c => c.condition_type && c.condition_type !== 'ok');
      return `
        <div class="card">
          <div class="card-title">รายงานสภาพอุปกรณ์</div>
          <p class="form-hint" style="margin-bottom:.75rem">รายงานหากมีอุปกรณ์สูญหายหรือชำรุด (ส่งซ้ำจะแทนที่ข้อมูลเดิม)</p>
          ${prevConds.length > 0 ? `
            <div class="alert alert-warning" style="margin-bottom:.75rem">
              รายงานล่าสุด: ${prevConds.map(c =>
                `${h(c.item_name || '')} (${c.condition_type === 'missing' ? 'สูญหาย' : 'ชำรุด'})`
              ).join(', ')}
            </div>` : ''}
          <div id="cond-msg"></div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer">
              <input type="checkbox" id="all-ok-check">
              <span>ทุกรายการปกติ</span>
            </label>
          </div>
          <div id="cond-items-wrap">
            <table class="req-items-table" style="margin-bottom:.75rem">
              <thead><tr><th>อุปกรณ์</th><th>จำนวน</th><th>สภาพ</th><th>หมายเหตุ</th></tr></thead>
              <tbody>
                ${approvedItems.map(it => `
                  <tr>
                    <td>${h(it.item_name)}</td>
                    <td>${h(String(it.quantity_approved))}</td>
                    <td>
                      <select class="form-select cond-type"
                        data-req-item-id="${h(it.id)}"
                        style="font-size:.85em;padding:.25rem">
                        <option value="ok">ปกติ</option>
                        <option value="missing">สูญหาย</option>
                        <option value="broken">ชำรุด</option>
                      </select>
                    </td>
                    <td>
                      <input type="text" class="form-input cond-note"
                        data-req-item-id="${h(it.id)}"
                        placeholder="หมายเหตุ"
                        style="font-size:.85em;padding:.25rem">
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <button class="btn btn-secondary" id="btn-conditions">บันทึกรายงานสภาพ</button>
        </div>`;
    }

    // ── Return section (in_lend + owner) ─────────────────────────────────────
    function returnFormHtml() {
      if (!(isOwner && inLendStatuses.includes(status))) return '';
      return `
        <div class="card">
          <div class="card-title">คืนอุปกรณ์</div>
          <div class="return-form">
            <div class="form-group">
              <label class="form-label">รูปถ่ายการคืน <span class="form-required">*</span></label>
              <input type="file" accept="image/*" id="return-photo" class="return-photo">
            </div>
            <div id="return-msg"></div>
            <button class="btn btn-primary" id="btn-return">คืนอุปกรณ์</button>
          </div>
        </div>`;
    }

    // ── Returns history ───────────────────────────────────────────────────────
    function returnsHistoryHtml() {
      if (returns.length === 0) return '';
      return `
        <div class="card">
          <div class="card-title">ประวัติการคืน</div>
          <div style="display:flex;flex-direction:column;gap:.75rem">
            ${returns.map(r => `
              <div class="return-card">
                <div>ส่งเมื่อ ${formatDateTime(r.submitted_at)}</div>
                <div>สถานะ: <strong>${
                  r.status === 'confirmed' ? '✓ ยืนยันแล้ว' : 'รอยืนยัน'
                }</strong></div>
                ${r.admin_note ? `<div class="alert alert-info" style="margin-top:.4rem">หมายเหตุเจ้าหน้าที่: ${h(r.admin_note)}</div>` : ''}
                ${r.photo_r2_key ? `<div style="margin-top:.5rem"><a href="${h(photoUrl(r.photo_r2_key))}" target="_blank" class="btn btn-sm btn-secondary">ดูรูปถ่าย</a></div>` : ''}
              </div>`).join('')}
          </div>
        </div>`;
    }

    // ── Main HTML ────────────────────────────────────────────────────────────
    app.innerHTML = `
      <a href="requests.html" class="back-btn">← คำขอยืม</a>

      <div class="req-header">
        <div class="req-title-row">
          <span class="req-id">#${h(id.slice(0, 8))}</span>
          <span style="font-weight:600;font-size:1.1rem">${h(request.name || '-')}</span>
          ${statusBadge(status)}
          ${request.is_overdue ? '<span class="badge badge-overdue">เกินกำหนด</span>' : ''}
        </div>
      </div>

      <div id="action-error"></div>

      <!-- Info card -->
      <div class="card">
        <div class="card-title">ข้อมูลคำขอ</div>
        <div class="req-info-grid">
          <div class="info-row">
            <span class="info-label">โครงการ</span>
            <span>${h(request.project_name || request.project_id || '-')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">ผู้ขอ</span>
            <span>${h(request.user_name || request.requester_name || request.owner_name || (request.user && request.user.name) || '-')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">วันรับอุปกรณ์</span>
            <span>${formatDateTime(request.requested_pickup_datetime)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">วันคืนอุปกรณ์</span>
            <span>${formatDateTime(request.requested_return_datetime)}</span>
          </div>
          ${request.confirmed_pickup_datetime ? `
          <div class="info-row">
            <span class="info-label">วันรับที่ยืนยัน</span>
            <span>${formatDateTime(request.confirmed_pickup_datetime)}</span>
          </div>` : ''}
          ${request.pickup_timeout_at && status === 'ready_for_pickup' ? `
          <div class="info-row">
            <span class="info-label">หมดเวลารับ</span>
            <span class="countdown">${formatCountdown(request.pickup_timeout_at)}</span>
          </div>` : ''}
          ${request.submitted_at ? `
          <div class="info-row">
            <span class="info-label">ส่งเมื่อ</span>
            <span>${formatDateTime(request.submitted_at)}</span>
          </div>` : ''}
        </div>
        ${request.admin_note ? `
          <div class="alert alert-info" style="margin-top:.75rem">
            หมายเหตุจากเจ้าหน้าที่: ${h(request.admin_note)}
          </div>` : ''}
      </div>

      <!-- Action buttons -->
      <div class="actions-bar" style="margin-bottom:1rem">
        ${isOwner && status === 'draft'
          ? '<button class="btn btn-danger" id="btn-cancel">ยกเลิกคำขอ</button>' : ''}
        ${isOwner && status === 'pending'
          ? '<button class="btn btn-secondary" id="btn-cancel">ยกเลิกการส่ง (กลับเป็นร่าง)</button>' : ''}
        ${(isOwner || isAdmin) && status === 'ready_for_pickup'
          ? '<button class="btn btn-success" id="btn-pickup">รับอุปกรณ์</button>' : ''}
        ${isOwner && inLendStatuses.includes(status)
          ? '<button class="btn btn-primary" id="btn-open-return">คืนอุปกรณ์</button>' : ''}
      </div>

      <!-- Items card -->
      <div class="card">
        <div class="card-title">รายการอุปกรณ์${items.length > 0 ? ` <span style="font-size:.85em;color:var(--text-muted)">(${items.length})</span>` : ''}</div>
        <div id="items-wrap">${itemsTableHtml()}</div>
        ${browseButtonHtml()}
        ${processSectionHtml()}
      </div>

      ${submitSectionHtml()}
      ${conditionReportHtml()}
      ${returnFormHtml()}
      ${returnsHistoryHtml()}`;

    // ── Error/success helpers ────────────────────────────────────────────────
    function errBox(msg) {
      const el = document.getElementById('action-error');
      if (el) el.innerHTML = `<div class="alert alert-error">${h(msg)}</div>`;
    }
    function successBox(msg) {
      const el = document.getElementById('action-error');
      if (el) {
        el.innerHTML = `<div class="alert alert-success">${h(msg)}</div>`;
        setTimeout(() => { el.innerHTML = ''; }, 3000);
      }
    }

    // ── Draft handlers: dropdown calendars + time picker + submit ───────────
    if (isOwner && status === 'draft') {
      const timeBtnsDiv       = document.getElementById('time-btns');
      const timeGroup         = document.getElementById('time-group');
      const returnTimeBtnsDiv = document.getElementById('return-time-btns');
      const returnTimeGroup   = document.getElementById('return-time-group');
      const pickupDrop        = document.getElementById('pickup-cal-drop');
      const returnDrop        = document.getElementById('return-cal-drop');
      const pickupBtn         = document.getElementById('btn-pick-date');
      const returnBtn         = document.getElementById('btn-pick-return');

      let pickedTime       = '';
      let pickedReturnTime = '';
      let pickedDate   = request.requested_pickup_datetime ? request.requested_pickup_datetime.slice(0, 10) : '';
      let pickedReturn = request.requested_return_datetime ? request.requested_return_datetime.slice(0, 10) : '';

      const availSet       = new Set(uniquePickupDates);
      const returnAvailSet = new Set(uniqueReturnDates);
      const todayStr = toDateStr(new Date());

      const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                         'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
      const DOW_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];

      // ── Shared calendar renderer ──────────────────────────────────────────
      function buildCalHtml(cy, cm, selected, isAvailFn, canPrev, canNext) {
        const firstDow = new Date(cy, cm, 1).getDay();
        const daysInMo = new Date(cy, cm + 1, 0).getDate();
        const navBtn = (cls, label, enabled) =>
          `<button type="button" class="${cls}"
            style="background:none;border:1px solid var(--border);border-radius:6px;
              width:28px;height:28px;font-size:1em;cursor:${enabled ? 'pointer' : 'default'};
              color:${enabled ? 'var(--text)' : 'var(--border-strong)'}"
            ${!enabled ? 'disabled' : ''}>${label}</button>`;
        const hdr = DOW_TH.map((d, i) =>
          `<div style="font-size:.7em;font-weight:700;text-align:center;padding:.3rem 0;
            color:${i === 0 ? 'var(--error)' : 'var(--text-muted)'}">${d}</div>`
        ).join('');
        let cells = '';
        for (let i = 0; i < firstDow; i++) cells += '<div></div>';
        for (let d = 1; d <= daysInMo; d++) {
          const ds    = `${cy}-${String(cm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const ok    = isAvailFn(ds);
          const isSel = ds === selected;
          const isTdy = ds === todayStr;
          let s;
          if (isSel) {
            s = `background:var(--primary);color:#fff;font-weight:700;border-radius:50%;cursor:pointer`;
          } else if (ok) {
            s = `color:var(--text);border-radius:50%;cursor:pointer;` +
                (isTdy ? 'box-shadow:inset 0 0 0 1.5px var(--primary);color:var(--primary);font-weight:700' : '');
          } else {
            s = `color:var(--border-strong)`;
          }
          cells += `<div class="${ok ? 'cpick' : ''}" data-date="${ok ? ds : ''}"
            style="display:flex;align-items:center;justify-content:center;
              width:34px;height:34px;font-size:.85em;margin:1px auto;${s}">${d}</div>`;
        }
        return `
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.65rem">
              ${navBtn('cal-prev', '‹', canPrev)}
              <span style="font-weight:700;font-size:.88em">${MONTHS_TH[cm]} ${cy + 543}</span>
              ${navBtn('cal-next', '›', canNext)}
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px">
              ${hdr}${cells}
            </div>
          </div>`;
      }

      function closeAll() {
        if (pickupDrop) pickupDrop.style.display = 'none';
        if (returnDrop) returnDrop.style.display = 'none';
      }
      document.addEventListener('click', closeAll);

      // ── Pickup calendar ───────────────────────────────────────────────────
      let pcy, pcm;
      (() => {
        const ref = pickedDate || (uniquePickupDates.length ? uniquePickupDates[0] : null);
        const d0 = ref ? new Date(ref + 'T00:00:00') : new Date();
        pcy = d0.getFullYear(); pcm = d0.getMonth();
      })();

      function mountPickupCal() {
        if (!pickupDrop) return;
        const fa = uniquePickupDates.length ? new Date(uniquePickupDates[0] + 'T00:00:00') : null;
        const la = uniquePickupDates.length ? new Date(uniquePickupDates[uniquePickupDates.length-1] + 'T00:00:00') : null;
        const canPrev = fa && (pcy * 12 + pcm) > (fa.getFullYear() * 12 + fa.getMonth());
        const canNext = la && (pcy * 12 + pcm) < (la.getFullYear() * 12 + la.getMonth());
        pickupDrop.innerHTML = buildCalHtml(pcy, pcm, pickedDate, ds => availSet.has(ds), canPrev, canNext);

        pickupDrop.querySelector('.cal-prev')?.addEventListener('click', e => {
          e.stopPropagation();
          pcm--; if (pcm < 0) { pcm = 11; pcy--; } mountPickupCal();
        });
        pickupDrop.querySelector('.cal-next')?.addEventListener('click', e => {
          e.stopPropagation();
          pcm++; if (pcm > 11) { pcm = 0; pcy++; } mountPickupCal();
        });
        pickupDrop.querySelectorAll('.cpick').forEach(el => {
          el.addEventListener('mouseenter', () => { if (el.dataset.date !== pickedDate) el.style.background = 'var(--primary-bg)'; });
          el.addEventListener('mouseleave', () => { if (el.dataset.date !== pickedDate) el.style.background = ''; });
          el.addEventListener('click', e => {
            e.stopPropagation();
            pickedDate = el.dataset.date;
            if (pickupBtn) { pickupBtn.querySelector('span').textContent = thaiDate(pickedDate); pickupBtn.style.color = 'var(--text)'; }
            closeAll();
            pickedTime = '';
            renderTimeBtns(new Date(pickedDate + 'T00:00:00').getDay());
            if (timeGroup) timeGroup.style.display = '';
          });
        });
      }

      pickupBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = pickupDrop?.style.display !== 'none';
        closeAll();
        if (!wasOpen && pickupDrop) { mountPickupCal(); pickupDrop.style.display = ''; }
      });

      // ── Return calendar ───────────────────────────────────────────────────
      let rcy, rcm;
      (() => {
        const d0 = new Date((pickedReturn || todayStr) + 'T00:00:00');
        rcy = d0.getFullYear(); rcm = d0.getMonth();
      })();

      function mountReturnCal() {
        if (!returnDrop) return;
        const fa = uniqueReturnDates.length ? new Date(uniqueReturnDates[0] + 'T00:00:00') : null;
        const la = uniqueReturnDates.length ? new Date(uniqueReturnDates[uniqueReturnDates.length-1] + 'T00:00:00') : null;
        const canPrev = fa && (rcy * 12 + rcm) > (fa.getFullYear() * 12 + fa.getMonth());
        const canNext = la && (rcy * 12 + rcm) < (la.getFullYear() * 12 + la.getMonth());
        returnDrop.innerHTML = buildCalHtml(rcy, rcm, pickedReturn, ds => returnAvailSet.has(ds), canPrev, canNext);

        returnDrop.querySelector('.cal-prev')?.addEventListener('click', e => {
          e.stopPropagation();
          rcm--; if (rcm < 0) { rcm = 11; rcy--; } mountReturnCal();
        });
        returnDrop.querySelector('.cal-next')?.addEventListener('click', e => {
          e.stopPropagation();
          rcm++; if (rcm > 11) { rcm = 0; rcy++; } mountReturnCal();
        });
        returnDrop.querySelectorAll('.cpick').forEach(el => {
          el.addEventListener('mouseenter', () => { if (el.dataset.date !== pickedReturn) el.style.background = 'var(--primary-bg)'; });
          el.addEventListener('mouseleave', () => { if (el.dataset.date !== pickedReturn) el.style.background = ''; });
          el.addEventListener('click', e => {
            e.stopPropagation();
            pickedReturn = el.dataset.date;
            if (returnBtn) { returnBtn.querySelector('span').textContent = thaiDate(pickedReturn); returnBtn.style.color = 'var(--text)'; }
            closeAll();
            pickedReturnTime = '';
            renderReturnTimeBtns(new Date(pickedReturn + 'T00:00:00').getDay());
            if (returnTimeGroup) returnTimeGroup.style.display = '';
          });
        });
      }

      returnBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = returnDrop?.style.display !== 'none';
        closeAll();
        if (!wasOpen && returnDrop) { mountReturnCal(); returnDrop.style.display = ''; }
      });

      // ── Time buttons ──────────────────────────────────────────────────────
      function renderTimeBtns(dayOfWeek) {
        const times = timesByDay[dayOfWeek] || [];
        if (!timeBtnsDiv) return;
        const onStyle  = `background:var(--primary);color:#fff;border-color:var(--primary);font-weight:700;box-shadow:0 2px 6px rgba(123,23,40,.25)`;
        const offStyle = `background:#fff;color:var(--text);border-color:var(--border-strong)`;
        timeBtnsDiv.innerHTML = times.length
          ? times.map(t => `
              <button type="button" class="time-btn" data-time="${t}"
                style="padding:.45rem 1.4rem;border-radius:999px;border:1.5px solid;font-size:.95em;
                  cursor:pointer;transition:all .15s;${t === pickedTime ? onStyle : offStyle}">
                ${t}
              </button>`).join('')
          : '<span style="color:var(--text-muted);font-size:.88em">ไม่มีเวลาให้เลือกในวันนี้</span>';
        timeBtnsDiv.querySelectorAll('.time-btn').forEach(b => {
          b.addEventListener('click', () => {
            pickedTime = b.dataset.time;
            timeBtnsDiv.querySelectorAll('.time-btn').forEach(tb => {
              tb.style.cssText = `padding:.45rem 1.4rem;border-radius:999px;border:1.5px solid;font-size:.95em;cursor:pointer;transition:all .15s;${offStyle}`;
            });
            b.style.cssText = `padding:.45rem 1.4rem;border-radius:999px;border:1.5px solid;font-size:.95em;cursor:pointer;transition:all .15s;${onStyle}`;
          });
        });
        if (timeGroup) timeGroup.style.display = '';
      }

      // ── Return time buttons ───────────────────────────────────────────────
      function renderReturnTimeBtns(dayOfWeek) {
        const times = timesByDay[dayOfWeek] || [];
        if (!returnTimeBtnsDiv) return;
        const onStyle  = `background:var(--primary);color:#fff;border-color:var(--primary);font-weight:700;box-shadow:0 2px 6px rgba(123,23,40,.25)`;
        const offStyle = `background:#fff;color:var(--text);border-color:var(--border-strong)`;
        returnTimeBtnsDiv.innerHTML = times.length
          ? times.map(t => `
              <button type="button" class="return-time-btn" data-time="${t}"
                style="padding:.45rem 1.4rem;border-radius:999px;border:1.5px solid;font-size:.95em;
                  cursor:pointer;transition:all .15s;${t === pickedReturnTime ? onStyle : offStyle}">
                ${t}
              </button>`).join('')
          : '<span style="color:var(--text-muted);font-size:.88em">ไม่มีเวลาให้เลือกในวันนี้</span>';
        returnTimeBtnsDiv.querySelectorAll('.return-time-btn').forEach(b => {
          b.addEventListener('click', () => {
            pickedReturnTime = b.dataset.time;
            returnTimeBtnsDiv.querySelectorAll('.return-time-btn').forEach(tb => {
              tb.style.cssText = `padding:.45rem 1.4rem;border-radius:999px;border:1.5px solid;font-size:.95em;cursor:pointer;transition:all .15s;${offStyle}`;
            });
            b.style.cssText = `padding:.45rem 1.4rem;border-radius:999px;border:1.5px solid;font-size:.95em;cursor:pointer;transition:all .15s;${onStyle}`;
          });
        });
        if (returnTimeGroup) returnTimeGroup.style.display = '';
      }

      // Restore pre-selected state on page load
      if (pickedDate) {
        if (request.requested_pickup_datetime) pickedTime = request.requested_pickup_datetime.slice(11, 16);
        renderTimeBtns(new Date(pickedDate + 'T00:00:00').getDay());
      }
      if (pickedReturn) {
        if (request.requested_return_datetime) pickedReturnTime = request.requested_return_datetime.slice(11, 16);
        renderReturnTimeBtns(new Date(pickedReturn + 'T00:00:00').getDay());
      }

      // ── Submit ────────────────────────────────────────────────────────────
      document.getElementById('btn-submit')?.addEventListener('click', async () => {
        const msgEl = document.getElementById('submit-section-msg');
        if (!pickedDate)       { if (msgEl) msgEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกวันรับอุปกรณ์</div>';   return; }
        if (!pickedTime)       { if (msgEl) msgEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกเวลารับอุปกรณ์</div>';  return; }
        if (!pickedReturn)     { if (msgEl) msgEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกวันคืนอุปกรณ์</div>';   return; }
        if (!pickedReturnTime) { if (msgEl) msgEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกเวลาคืนอุปกรณ์</div>'; return; }
        const btn = document.getElementById('btn-submit');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังส่ง…'; }
        if (msgEl) msgEl.innerHTML = '';
        try {
          await updateRequest(id, {
            requested_pickup_datetime: `${pickedDate}T${pickedTime}`,
            requested_return_datetime:  `${pickedReturn}T${pickedReturnTime}`,
          });
          await submitRequest(id);
          await renderPage();
        } catch (err) {
          if (msgEl) msgEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          if (btn) { btn.disabled = false; btn.textContent = 'ส่งคำขอ'; }
        }
      });
    }

    // ── Remove item (draft) ───────────────────────────────────────────────────
    document.querySelectorAll('.do-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await removeRequestItem(id, btn.dataset.itemId); await renderPage(); }
        catch (err) { errBox(err.message); }
      });
    });

    // ── Edit / save / cancel quantity_requested (draft owner, global) ────────
    const btnEditQty   = document.getElementById('btn-edit-qty');
    const btnSaveQty   = document.getElementById('btn-save-qty');
    const btnCancelQty = document.getElementById('btn-cancel-qty');

    function enterEditMode() {
      document.querySelectorAll('.qty-text').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.edit-req-qty').forEach(el => el.style.display = 'inline-block');
      if (btnEditQty)   btnEditQty.style.display   = 'none';
      if (btnSaveQty)   btnSaveQty.style.display   = '';
      if (btnCancelQty) btnCancelQty.style.display = '';
    }

    function exitEditMode() {
      document.querySelectorAll('.edit-req-qty').forEach(el => {
        el.value = el.dataset.orig;
        el.style.display = 'none';
      });
      document.querySelectorAll('.qty-text').forEach(el => el.style.display = '');
      if (btnEditQty)   btnEditQty.style.display   = '';
      if (btnSaveQty)   btnSaveQty.style.display   = 'none';
      if (btnCancelQty) btnCancelQty.style.display = 'none';
    }

    btnEditQty?.addEventListener('click', enterEditMode);
    btnCancelQty?.addEventListener('click', exitEditMode);

    btnSaveQty?.addEventListener('click', async () => {
      const inputs  = [...document.querySelectorAll('.edit-req-qty')];
      const changed = inputs.filter(inp => parseInt(inp.value) !== parseInt(inp.dataset.orig) && parseInt(inp.value) >= 1);

      if (changed.length === 0) { exitEditMode(); return; }

      btnSaveQty.disabled = true;
      btnSaveQty.textContent = 'กำลังบันทึก…';

      try {
        // No PATCH for draft items — remove then re-add with new quantity
        for (const inp of changed) {
          await removeRequestItem(id, inp.dataset.itemId);
          await addRequestItem(id, { item_id: inp.dataset.itemId, quantity_requested: parseInt(inp.value) });
        }
        inputs.forEach(inp => {
          inp.dataset.orig = inp.value;
          const txt = inp.closest('td')?.querySelector('.qty-text');
          if (txt) txt.textContent = inp.value;
        });
        exitEditMode();
        successBox('บันทึกจำนวนแล้ว');
      } catch (err) { errBox(err.message); }

      btnSaveQty.disabled = false;
      btnSaveQty.textContent = 'บันทึก';
    });

    // ── Adjust quantity_approved (processing, admin) ──────────────────────────
    document.querySelectorAll('.do-adj').forEach(btn => {
      btn.addEventListener('click', async () => {
        const input = document.querySelector(`.adj-qty[data-item-id="${btn.dataset.itemId}"]`);
        const qty   = parseInt(input?.value);
        if (isNaN(qty)) return;
        try {
          await adjustRequestItem(id, btn.dataset.itemId, { quantity_approved: qty });
          successBox('บันทึกจำนวนอนุมัติแล้ว');
        } catch (err) { errBox(err.message); }
      });
    });

    // ── Cancel request ────────────────────────────────────────────────────────
    document.getElementById('btn-cancel')?.addEventListener('click', async () => {
      const isPending = status === 'pending';
      const title = isPending ? 'ยกเลิกการส่งคำขอ' : 'ยืนยันการยกเลิกคำขอ';
      const body  = isPending
        ? '<p>ยกเลิกการส่ง คำขอจะกลับไปเป็นร่างและสามารถแก้ไขได้อีก</p>'
        : '<p>คุณต้องการยกเลิกคำขอนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>';
      const close = openModal(title, `
        ${body}
        <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
          <button class="btn btn-secondary" id="modal-cancel">ไม่ยกเลิก</button>
          <button class="btn btn-danger" id="modal-confirm">${isPending ? 'ยกเลิกการส่ง' : 'ยืนยันยกเลิก'}</button>
        </div>`);
      document.getElementById('modal-cancel').onclick  = close;
      document.getElementById('modal-confirm').onclick = async () => {
        close();
        try { await cancelRequest(id); await renderPage(); }
        catch (err) { errBox(err.message); }
      };
    });

    // ── Process request (pending → processing) ────────────────────────────────
    document.getElementById('btn-process')?.addEventListener('click', async () => {
      const note = document.getElementById('process-note')?.value;
      try {
        await processRequest(id, { admin_note: note || undefined });
        await renderPage();
      } catch (err) { errBox(err.message); }
    });

    // ── Confirm pickup ────────────────────────────────────────────────────────
    document.getElementById('btn-pickup')?.addEventListener('click', () => {
      const close = openModal('ยืนยันการรับอุปกรณ์', `
        <p>กรุณาถ่ายรูปเพื่อยืนยันการรับอุปกรณ์</p>
        <div class="form-group" style="margin-top:1rem">
          <label class="form-label">รูปถ่ายการรับ <span class="form-required">*</span></label>
          <input type="file" accept="image/*" id="pickup-photo">
        </div>
        <div id="pickup-modal-msg"></div>
        <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
          <button class="btn btn-secondary" id="modal-cancel">ยกเลิก</button>
          <button class="btn btn-success" id="modal-confirm">ยืนยันการรับ</button>
        </div>`);
      document.getElementById('modal-cancel').onclick  = close;
      document.getElementById('modal-confirm').onclick = async () => {
        const file  = document.getElementById('pickup-photo')?.files?.[0];
        const msgEl = document.getElementById('pickup-modal-msg');
        if (!file) {
          if (msgEl) msgEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกรูปถ่าย</div>';
          return;
        }
        const btn = document.getElementById('modal-confirm');
        btn.disabled = true; btn.textContent = 'กำลังอัปโหลด…';
        try {
          const r2Key = await uploadPhoto(file);
          await confirmPickup(id, { photo_r2_key: r2Key });
          close();
          await renderPage();
        } catch (err) {
          if (msgEl) msgEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'ยืนยันการรับ';
        }
      };
    });

    // ── Condition report ──────────────────────────────────────────────────────
    const allOkCheck = document.getElementById('all-ok-check');
    allOkCheck?.addEventListener('change', () => {
      const wrap = document.getElementById('cond-items-wrap');
      if (wrap) wrap.style.display = allOkCheck.checked ? 'none' : '';
    });

    document.getElementById('btn-conditions')?.addEventListener('click', async () => {
      const msgEl  = document.getElementById('cond-msg');
      const allOk  = document.getElementById('all-ok-check')?.checked ?? false;
      let payload;
      if (allOk) {
        payload = { all_ok: true, items: [] };
      } else {
        const condItems = [...document.querySelectorAll('.cond-type')].map(sel => {
          const reqItemId = sel.dataset.reqItemId;
          const noteEl    = document.querySelector(`.cond-note[data-req-item-id="${reqItemId}"]`);
          return {
            borrow_request_item_id: reqItemId,
            condition:              sel.value,
            note:                   noteEl?.value || '',
          };
        });
        payload = { all_ok: false, items: condItems };
      }
      try {
        await submitConditions(id, payload);
        if (msgEl) {
          msgEl.innerHTML = '<div class="alert alert-success">บันทึกรายงานสภาพแล้ว</div>';
          setTimeout(() => { if (msgEl) msgEl.innerHTML = ''; }, 3000);
        }
      } catch (err) {
        if (msgEl) msgEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      }
    });

    // ── Return (open modal via actions-bar button) ────────────────────────────
    document.getElementById('btn-open-return')?.addEventListener('click', () => {
      const close = openModal('คืนอุปกรณ์', `
        <div class="form-group" style="margin-top:1rem">
          <label class="form-label">รูปถ่ายการคืน <span class="form-required">*</span></label>
          <input type="file" accept="image/*" id="return-photo-modal" class="return-photo">
        </div>
        <div id="return-modal-msg"></div>
        <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
          <button class="btn btn-secondary" id="modal-cancel">ยกเลิก</button>
          <button class="btn btn-primary" id="modal-confirm">ส่งการคืน</button>
        </div>`);
      document.getElementById('modal-cancel').onclick  = close;
      document.getElementById('modal-confirm').onclick = async () => {
        const file  = document.getElementById('return-photo-modal')?.files?.[0];
        const msgEl = document.getElementById('return-modal-msg');
        if (!file) {
          if (msgEl) msgEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกรูปถ่าย</div>';
          return;
        }
        const btn = document.getElementById('modal-confirm');
        btn.disabled = true; btn.textContent = 'กำลังอัปโหลด…';
        try {
          const r2Key = await uploadPhoto(file);
          await submitReturn(id, { photo_r2_key: r2Key });
          close();
          await renderPage();
        } catch (err) {
          if (msgEl) msgEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'ส่งการคืน';
        }
      };
    });

    // ── Inline return form (card in in_lend) ─────────────────────────────────
    document.getElementById('btn-return')?.addEventListener('click', async () => {
      const file  = document.getElementById('return-photo')?.files?.[0];
      const msgEl = document.getElementById('return-msg');
      if (!file) {
        if (msgEl) msgEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกรูปถ่าย</div>';
        return;
      }
      const btn = document.getElementById('btn-return');
      btn.disabled = true; btn.textContent = 'กำลังอัปโหลด…';
      try {
        const r2Key = await uploadPhoto(file);
        await submitReturn(id, { photo_r2_key: r2Key });
        await renderPage();
      } catch (err) {
        if (msgEl) msgEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'คืนอุปกรณ์';
      }
    });
  }

  await renderPage();
}

init();
