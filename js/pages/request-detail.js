import { requireAuth } from '../auth.js';
import {
  getRequest, getRequestReturns, getReturn, getNotifications,
  addRequestItem, removeRequestItem, adjustRequestItem,
  submitRequest, cancelRequest, unsubmitRequest, processRequest, markReady, confirmPickup,
  getConditions, submitConditions, submitReturn, confirmReturn, uploadPhoto,
  updateRequest, getSlots, getHolidays,
} from '../api.js';
import {
  h, statusBadge, formatDate, formatDateTime, formatCountdown,
  renderNavbar, showError, openModal, loadAuthPhotos,
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

    let request, returns, conditions, returnDetail = null;
    try {
      const [reqRes, retRes, condRes] = await Promise.all([
        getRequest(id),
        getRequestReturns(id).catch(() => ({ data: [] })),
        getConditions(id).catch(() => ({ data: [] })),
      ]);
      request    = reqRes?.data;
      returns    = retRes?.data    ?? [];
      conditions = condRes?.data   ?? [];

      if (request?.status === 'returned' && user.role === 'admin') {
        const pending = returns.find(r => r.status === 'pending');
        if (pending) {
          returnDetail = await getReturn(pending.id).then(r => r?.data ?? r).catch(() => null);
        }
      }
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

    if ((status === 'draft' && isOwner) || (status === 'processing' && isAdmin)) {
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

      if (status === 'draft' && isOwner) {
        // Return: tomorrow → +90 days on slot days (same slot-day rule, backend validates)
        const retEnd = new Date(); retEnd.setDate(retEnd.getDate() + 90);
        for (let d = new Date(start); d <= retEnd; d.setDate(d.getDate() + 1)) {
          if (allowedDays.has(d.getDay())) uniqueReturnDates.push(toDateStr(new Date(d)));
        }
      }

      // Filter out Thai public holidays
      {
        const startYear = start.getFullYear();
        const endYear   = new Date(Date.now() + 90 * 864e5).getFullYear();
        const hdYears   = startYear === endYear ? [startYear] : [startYear, endYear];
        const hdResults = await Promise.all(hdYears.map(y => getHolidays(y).catch(() => ({ data: [] }))));
        const holidaySet = new Set(hdResults.flatMap(r => (r?.data ?? []).map(hd => hd.date)));
        uniquePickupDates = uniquePickupDates.filter(ds => !holidaySet.has(ds));
        uniqueReturnDates = uniqueReturnDates.filter(ds => !holidaySet.has(ds));
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
          ${canEdit ? '<th style="width:6rem">ตำแหน่ง</th>' : ''}
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
                      ? `<img data-photo-key="${h(it.photo_r2_key)}" alt=""
                          style="width:32px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0;border:1px solid var(--border)">`
                      : `<div style="width:32px;height:32px;border-radius:4px;background:var(--surface-hover,#f3f4f6);display:flex;align-items:center;justify-content:center;font-size:.9em;flex-shrink:0;border:1px solid var(--border)">📦</div>`}
                    <span>${h(it.item_name || it.name || '-')}</span>
                  </div>
                </td>
                ${canEdit ? `
                  <td style="font-family:monospace;font-size:.85em;color:${it.item_stock_location ? 'var(--text)' : 'var(--text-muted)'}">
                    ${h(it.item_stock_location || '-')}
                  </td>` : ''}
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
                      <button class="adj-tick do-adj"
                        data-item-id="${h(it.item_id || it.id)}"
                        title="บันทึก">✓</button>
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
          <button class="btn btn-primary" id="btn-process" style="margin-top:.75rem">เริ่มดำเนินการ</button>
        </div>`;
    }

    // ── Condition report (in_lend + owner) ───────────────────────────────────
    function conditionReportHtml() {
      if (!(isOwner && inLendStatuses.includes(status) && approvedItems.length > 0)) return '';
      const prevConds        = conditions.filter(c => c.condition_type && c.condition_type !== 'ok');
      const prevById         = new Map(prevConds.map(c => [c.borrow_request_item_id, c]));
      const preIssueItems    = approvedItems.filter(it => prevById.has(it.id));
      const availableItems   = approvedItems.filter(it => !prevById.has(it.id));

      function issueRowHtml(it, existing) {
        const ct   = existing?.condition_type || 'missing';
        const note = existing?.note || '';
        const qty  = h(String(it.quantity_approved));
        const unit = h(it.unit || 'ชิ้น');
        return `
          <div class="cond-issue-row" data-req-item-id="${h(it.id)}"
            style="display:flex;gap:.5rem;align-items:center;padding:.5rem .75rem;background:var(--bg-muted,#f5f5f5);border-radius:.375rem;border:1px solid var(--border)">
            <span style="flex:1;font-size:.9em">${h(it.item_name)}
              <span style="color:var(--text-muted);font-size:.85em">(${qty} ${unit})</span>
            </span>
            <select class="form-select cond-type" data-req-item-id="${h(it.id)}" style="width:9rem;font-size:.85em">
              <option value="missing" ${ct === 'missing' ? 'selected' : ''}>สูญหาย</option>
              <option value="broken"  ${ct === 'broken'  ? 'selected' : ''}>ชำรุด</option>
            </select>
            <input type="text" class="form-input cond-note" data-req-item-id="${h(it.id)}"
              value="${h(note)}" placeholder="เช่น 2 จาก ${qty} ${unit}"
              style="width:13rem;font-size:.85em">
            <button class="cond-remove-btn" type="button"
              data-req-item-id="${h(it.id)}" data-name="${h(it.item_name)}"
              data-qty="${qty}" data-unit="${unit}"
              style="padding:.2rem .5rem;font-size:.9em;color:var(--danger,#dc2626);background:none;border:1px solid var(--border);border-radius:.25rem;cursor:pointer">✕</button>
          </div>`;
      }

      return `
        <div class="card">
          <div class="card-title">รายงานสภาพอุปกรณ์</div>
          <p class="form-hint" style="margin-bottom:.75rem">
            เพิ่มเฉพาะรายการที่มีปัญหา และระบุจำนวนที่มีปัญหาในหมายเหตุ
            เจ้าหน้าที่จะยืนยันจำนวนจริงเมื่อรับคืน
          </p>
          <div id="cond-msg"></div>
          <div id="cond-issue-list" style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:.75rem">
            ${preIssueItems.map(it => issueRowHtml(it, prevById.get(it.id))).join('')}
          </div>
          <div id="cond-add-wrap" class="form-group" style="display:flex;gap:.5rem;align-items:center;margin-bottom:.75rem${availableItems.length === 0 ? ';display:none' : ''}">
            <select id="cond-add-select" class="form-select" style="flex:1">
              <option value="">— เลือกรายการที่มีปัญหา —</option>
              ${availableItems.map(it => `
                <option value="${h(it.id)}"
                  data-name="${h(it.item_name)}"
                  data-qty="${h(String(it.quantity_approved))}"
                  data-unit="${h(it.unit || 'ชิ้น')}">
                  ${h(it.item_name)} (${h(String(it.quantity_approved))} ${h(it.unit || 'ชิ้น')})
                </option>`).join('')}
            </select>
            <button class="btn btn-secondary" id="cond-add-btn" type="button">+ เพิ่ม</button>
          </div>
          <p class="form-hint" style="margin-bottom:.75rem">หากทุกรายการปกติ ไม่ต้องเพิ่มรายการใด กดบันทึกได้เลย</p>
          <button class="btn btn-secondary" id="btn-conditions">บันทึกรายงานสภาพ</button>
        </div>`;
    }

    // ── Return section (in_lend + owner) ─────────────────────────────────────
    function returnFormHtml() {
      if (!(isOwner && inLendStatuses.includes(status))) return '';
      const condDone = !!request.condition_reported_at;
      return `
        <div class="card">
          <div class="card-title">คืนอุปกรณ์</div>
          ${!condDone ? `<div class="alert alert-warning" style="margin-bottom:.75rem">กรุณาบันทึกรายงานสภาพอุปกรณ์ก่อนดำเนินการคืน</div>` : ''}
          <div class="return-form">
            <div class="form-group">
              <label class="form-label">รูปถ่ายการคืน <span class="form-required">*</span></label>
              <input type="file" accept="image/*" id="return-photo" class="return-photo" ${!condDone ? 'disabled' : ''}>
            </div>
            <div class="form-group" style="margin-top:.75rem">
              <label style="display:flex;align-items:center;gap:.5rem;cursor:${condDone ? 'pointer' : 'default'}">
                <input type="checkbox" id="return-all-ok" checked ${!condDone ? 'disabled' : ''}>
                <span>อุปกรณ์ทุกชิ้นครบและสภาพดี</span>
              </label>
            </div>
            <div class="form-group" style="margin-top:.5rem">
              <label class="form-label">หมายเหตุ (ถ้ามี)</label>
              <textarea id="return-note" class="form-input" rows="2" style="resize:vertical" placeholder="เช่น มีรอยขีดข่วนเล็กน้อย" ${!condDone ? 'disabled' : ''}></textarea>
            </div>
            <div id="return-msg"></div>
            <button class="btn btn-primary" id="btn-return" ${!condDone ? 'disabled' : ''}>คืนอุปกรณ์</button>
          </div>
        </div>`;
    }

    // ── Admin: confirm return (returned + admin) ──────────────────────────────
    function adminConfirmReturnHtml() {
      if (!(isAdmin && status === 'returned')) return '';
      const pending = returns.find(r => r.status === 'pending');
      if (!pending) return '';
      const condProblems = conditions.filter(c => c.condition_type);
      const confirmItems = (returnDetail?.items ?? approvedItems).map(it => ({
        item_id:            it.item_id ?? it.id,
        item_name:          it.item_name ?? it.name ?? '-',
        item_unit:          it.item_unit ?? it.unit ?? '',
        quantity_approved:  it.quantity_approved ?? 0,
        quantity_returned:  it.quantity_returned  ?? null,
        quantity_to_repair: it.quantity_to_repair ?? null,
      }));
      return `
        <div class="card">
          <div class="card-title">ยืนยันการรับคืน</div>
          ${pending.photo_r2_key
            ? `<img data-photo-key="${h(pending.photo_r2_key)}" alt="รูปการคืน"
                style="max-width:300px;width:100%;border-radius:8px;margin-bottom:1rem;display:block">`
            : ''}
          <div class="info-row">
            <span class="info-label">สภาพที่แจ้ง:</span>
            ${pending.all_items_ok === 1 || pending.all_items_ok === true
              ? '<span style="color:var(--success)">ปกติทุกชิ้น</span>'
              : '<span style="color:var(--error);font-weight:600">มีปัญหา</span>'}
          </div>
          ${pending.note ? `<div class="info-row"><span class="info-label">หมายเหตุ:</span> ${h(pending.note)}</div>` : ''}
          ${condProblems.length > 0 ? `
            <div class="alert alert-warning" style="margin:.75rem 0">
              <strong>รายงานปัญหาจากผู้ยืม:</strong>
              <ul style="margin:.5rem 0 0;padding-left:1.2rem">
                ${condProblems.map(c => `
                  <li>${h(c.item_name ?? '-')}
                    ${c.condition_type === 'missing'
                      ? ' — <span style="color:var(--error)">สูญหาย</span>'
                      : ' — <span style="color:var(--warning,#d97706)">ชำรุด</span>'}
                    ${c.note ? `: ${h(c.note)}` : ''}
                  </li>`).join('')}
              </ul>
            </div>` : ''}
          <p class="form-hint" style="margin-bottom:1rem">
            ระบุจำนวนที่รับคืนจริงและจำนวนที่ต้องส่งซ่อม — จำนวนที่หายไปจะถูกหักจากสต็อก
          </p>
          <div id="confirm-return-error"></div>
          <form id="admin-confirm-form">
            <div class="table-wrap" style="margin-bottom:1rem">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>ชื่ออุปกรณ์</th>
                    <th>อนุมัติ</th>
                    <th>รับคืนได้ <span class="form-required">*</span></th>
                    <th>ส่งซ่อม</th>
                  </tr>
                </thead>
                <tbody>
                  ${confirmItems.map(it => `
                    <tr>
                      <td>${h(it.item_name)}${it.item_unit ? ` <span style="color:var(--text-muted);font-size:.82em">(${h(it.item_unit)})</span>` : ''}</td>
                      <td>${it.quantity_approved}</td>
                      <td>
                        <input type="number" class="form-input qty-confirm-returned" min="0"
                          max="${it.quantity_approved}"
                          value="${it.quantity_returned ?? it.quantity_approved}"
                          data-item-id="${h(String(it.item_id))}"
                          data-max="${it.quantity_approved}"
                          style="width:80px">
                      </td>
                      <td>
                        <input type="number" class="form-input qty-confirm-repair" min="0"
                          value="${it.quantity_to_repair ?? 0}"
                          style="width:80px">
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
            <button type="submit" class="btn btn-primary">ยืนยันการรับคืน</button>
          </form>
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
                ${r.photo_r2_key ? `<div style="margin-top:.5rem"><img data-photo-key="${h(r.photo_r2_key)}" alt="รูปการคืน" style="max-width:260px;width:100%;border-radius:6px;display:block"></div>` : ''}
              </div>`).join('')}
          </div>
        </div>`;
    }

    // ── Main HTML ────────────────────────────────────────────────────────────
    app.innerHTML = `
      <a href="requests.html" class="back-btn">← คำขอยืม</a>

      <div class="req-header">
        <div class="req-title-row">
          <span class="req-id">#${h(id)}</span>
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
        ${isOwner && status === 'pending' ? `
          <button class="btn btn-secondary" id="btn-unsubmit">ยกเลิกการส่ง (กลับเป็นร่าง)</button>
          <button class="btn btn-danger"    id="btn-cancel">ยกเลิกคำขอ</button>
        ` : ''}
        ${isAdmin && status === 'processing' ? `
          <button class="btn btn-success" id="btn-ready" disabled>พร้อมรับ</button>
          <button class="btn btn-danger"  id="btn-cancel">ยกเลิก</button>
        ` : ''}
        ${(isOwner || isAdmin) && status === 'ready_for_pickup'
          ? '<button class="btn btn-success" id="btn-pickup">รับอุปกรณ์</button>' : ''}
        ${''/* return is handled by the inline card below */}
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
      ${adminConfirmReturnHtml()}
      ${returnsHistoryHtml()}`;

    loadAuthPhotos(app);

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

    // ── Shared calendar constants & renderer (used by draft + admin ready modal)
    const todayStr  = toDateStr(new Date());
    const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                       'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const DOW_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];

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

    // ── Draft handlers: dropdown calendars + time picker + submit ───────────
    if (isOwner && status === 'draft') {
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
    function syncReadyBtn() {
      const readyBtn = document.getElementById('btn-ready');
      if (!readyBtn) return;
      const ticks = document.querySelectorAll('.do-adj');
      const allDone = ticks.length > 0 && [...ticks].every(b => b.dataset.confirmed === '1');
      readyBtn.disabled = !allDone;
    }

    document.querySelectorAll('.do-adj').forEach(btn => {
      btn.addEventListener('click', async () => {
        // Untick: reset highlight without hitting the API
        if (btn.dataset.confirmed === '1') {
          const row = btn.closest('tr');
          row.style.background  = '';
          btn.style.background  = '';
          btn.style.borderColor = '';
          btn.style.color       = '';
          btn.dataset.confirmed = '0';
          syncReadyBtn();
          return;
        }

        const input = document.querySelector(`.adj-qty[data-item-id="${btn.dataset.itemId}"]`);
        const qty   = parseInt(input?.value);
        if (isNaN(qty)) return;
        btn.disabled = true;
        try {
          await adjustRequestItem(id, btn.dataset.itemId, { quantity_approved: qty });
          const row      = btn.closest('tr');
          const approved = qty > 0;
          row.style.transition  = 'background .25s';
          row.style.background  = approved ? 'var(--success-bg)' : 'var(--error-bg)';
          btn.style.background  = approved ? 'var(--success)' : 'var(--error)';
          btn.style.borderColor = approved ? 'var(--success)' : 'var(--error)';
          btn.style.color       = '#fff';
          btn.dataset.confirmed = '1';
          btn.disabled          = false;
          syncReadyBtn();
        } catch (err) {
          errBox(err.message);
          btn.disabled = false;
        }
      });
    });

    // ── Unsubmit (pending → draft) ────────────────────────────────────────────
    document.getElementById('btn-unsubmit')?.addEventListener('click', async () => {
      const close = openModal('ยกเลิกการส่ง', `
        <p>คำขอจะกลับไปเป็นร่างและสามารถแก้ไขแล้วส่งใหม่ได้อีกครั้ง</p>
        <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
          <button class="btn btn-secondary" id="modal-cancel">ยกเลิก</button>
          <button class="btn btn-primary"   id="modal-confirm">กลับเป็นร่าง</button>
        </div>`);
      document.getElementById('modal-cancel').onclick  = close;
      document.getElementById('modal-confirm').onclick = async () => {
        close();
        try { await unsubmitRequest(id); await renderPage(); }
        catch (err) { errBox(err.message); }
      };
    });

    // ── Cancel request ────────────────────────────────────────────────────────
    document.getElementById('btn-cancel')?.addEventListener('click', async () => {
      const close = openModal('ยืนยันการยกเลิกคำขอ', `
        <p>คุณต้องการยกเลิกคำขอนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
        <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
          <button class="btn btn-secondary" id="modal-cancel">ไม่ยกเลิก</button>
          <button class="btn btn-danger" id="modal-confirm">ยืนยันยกเลิก</button>
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

    // ── Mark ready (processing → ready_for_pickup) ───────────────────────────
    document.getElementById('btn-ready')?.addEventListener('click', () => {
      const preStr  = request.confirmed_pickup_datetime || request.requested_pickup_datetime || '';
      const preDate = preStr.slice(0, 10);
      const preTime = preStr.slice(11, 16);
      const availSet2 = new Set(uniquePickupDates);

      let modalDate = availSet2.has(preDate) ? preDate : (uniquePickupDates[0] || '');
      let modalTime = (modalDate && timesByDay[new Date(modalDate + 'T00:00:00').getDay()]?.includes(preTime))
        ? preTime : '';

      const initD = modalDate ? new Date(modalDate + 'T00:00:00') : new Date();
      let mcy = initD.getFullYear(), mcm = initD.getMonth();

      const close = openModal('ยืนยันวันรับอุปกรณ์', `
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:.75rem">
          ยืนยันหรือแก้ไขวันและเวลานัดรับ — ผู้ขอจะได้รับการแจ้งเตือน
        </p>
        <div class="form-group" style="margin-bottom:.75rem">
          <label class="form-label">วันรับ <span class="form-required">*</span></label>
          <div id="ready-cal"></div>
        </div>
        <div id="ready-time-group" style="margin-bottom:.75rem;${modalDate ? '' : 'display:none'}">
          <label class="form-label">เวลารับ <span class="form-required">*</span></label>
          <div id="ready-time-btns" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.3rem"></div>
        </div>
        <div id="ready-error"></div>
        <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
          <button class="btn btn-secondary" id="modal-cancel">ยกเลิก</button>
          <button class="btn btn-success"   id="modal-confirm">ยืนยันพร้อมรับ</button>
        </div>`);

      const onStyle  = `background:var(--primary);color:#fff;border-color:var(--primary);font-weight:700;box-shadow:0 2px 6px rgba(123,23,40,.25)`;
      const offStyle = `background:#fff;color:var(--text);border-color:var(--border-strong)`;

      function renderReadyTimeBtns(dayOfWeek) {
        const container = document.getElementById('ready-time-btns');
        if (!container) return;
        const times = timesByDay[dayOfWeek] || [];
        container.innerHTML = times.length
          ? times.map(t => `
              <button type="button" class="ready-time-btn" data-time="${t}"
                style="padding:.45rem 1.4rem;border-radius:999px;border:1.5px solid;font-size:.95em;cursor:pointer;transition:all .15s;${t === modalTime ? onStyle : offStyle}">
                ${t}
              </button>`).join('')
          : '<span style="color:var(--text-muted);font-size:.88em">ไม่มีเวลาในวันนี้</span>';
        container.querySelectorAll('.ready-time-btn').forEach(b => {
          b.addEventListener('click', () => {
            modalTime = b.dataset.time;
            container.querySelectorAll('.ready-time-btn').forEach(tb => {
              tb.style.cssText = `padding:.45rem 1.4rem;border-radius:999px;border:1.5px solid;font-size:.95em;cursor:pointer;transition:all .15s;${offStyle}`;
            });
            b.style.cssText = `padding:.45rem 1.4rem;border-radius:999px;border:1.5px solid;font-size:.95em;cursor:pointer;transition:all .15s;${onStyle}`;
          });
        });
      }

      function mountReadyCal() {
        const calEl = document.getElementById('ready-cal');
        if (!calEl) return;
        const fa = uniquePickupDates.length ? new Date(uniquePickupDates[0] + 'T00:00:00') : null;
        const la = uniquePickupDates.length ? new Date(uniquePickupDates[uniquePickupDates.length - 1] + 'T00:00:00') : null;
        const canPrev = fa && (mcy * 12 + mcm) > (fa.getFullYear() * 12 + fa.getMonth());
        const canNext = la && (mcy * 12 + mcm) < (la.getFullYear() * 12 + la.getMonth());
        calEl.innerHTML = buildCalHtml(mcy, mcm, modalDate, ds => availSet2.has(ds), canPrev, canNext);
        calEl.querySelector('.cal-prev')?.addEventListener('click', () => {
          mcm--; if (mcm < 0) { mcm = 11; mcy--; } mountReadyCal();
        });
        calEl.querySelector('.cal-next')?.addEventListener('click', () => {
          mcm++; if (mcm > 11) { mcm = 0; mcy++; } mountReadyCal();
        });
        calEl.querySelectorAll('.cpick[data-date]').forEach(cell => {
          cell.addEventListener('click', () => {
            if (!cell.dataset.date) return;
            modalDate = cell.dataset.date;
            modalTime = '';
            mountReadyCal();
            renderReadyTimeBtns(new Date(modalDate + 'T00:00:00').getDay());
            const tg = document.getElementById('ready-time-group');
            if (tg) tg.style.display = '';
          });
        });
      }

      mountReadyCal();
      if (modalDate) renderReadyTimeBtns(new Date(modalDate + 'T00:00:00').getDay());

      document.getElementById('modal-cancel').onclick = close;
      document.getElementById('modal-confirm').onclick = async () => {
        const errEl = document.getElementById('ready-error');
        if (!modalDate) { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกวันรับ</div>'; return; }
        if (!modalTime) { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกเวลารับ</div>'; return; }
        const btn = document.getElementById('modal-confirm');
        btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
        try {
          await markReady(id, { confirmed_pickup_datetime: `${modalDate}T${modalTime}` });
          close();
          await renderPage();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'ยืนยันพร้อมรับ';
        }
      };
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
    document.getElementById('cond-add-btn')?.addEventListener('click', () => {
      const sel = document.getElementById('cond-add-select');
      const val = sel?.value;
      if (!val) return;
      const opt  = sel.querySelector(`option[value="${val}"]`);
      if (!opt) return;
      const name = opt.dataset.name;
      const qty  = opt.dataset.qty;
      const unit = opt.dataset.unit || 'ชิ้น';
      opt.remove();
      sel.value = '';
      if (sel.options.length <= 1) document.getElementById('cond-add-wrap')?.style.setProperty('display','none');

      const row = document.createElement('div');
      row.className = 'cond-issue-row';
      row.dataset.reqItemId = val;
      row.style.cssText = 'display:flex;gap:.5rem;align-items:center;padding:.5rem .75rem;background:var(--bg-muted,#f5f5f5);border-radius:.375rem;border:1px solid var(--border)';
      row.innerHTML = `
        <span style="flex:1;font-size:.9em">${h(name)}
          <span style="color:var(--text-muted);font-size:.85em">(${h(qty)} ${h(unit)})</span>
        </span>
        <select class="form-select cond-type" data-req-item-id="${h(val)}" style="width:9rem;font-size:.85em">
          <option value="missing">สูญหาย</option>
          <option value="broken">ชำรุด</option>
        </select>
        <input type="text" class="form-input cond-note" data-req-item-id="${h(val)}"
          placeholder="เช่น 2 จาก ${h(qty)} ${h(unit)}" style="width:13rem;font-size:.85em">
        <button class="cond-remove-btn" type="button"
          data-req-item-id="${h(val)}" data-name="${h(name)}" data-qty="${h(qty)}" data-unit="${h(unit)}"
          style="padding:.2rem .5rem;font-size:.9em;color:var(--danger,#dc2626);background:none;border:1px solid var(--border);border-radius:.25rem;cursor:pointer">✕</button>`;
      document.getElementById('cond-issue-list')?.appendChild(row);
    });

    document.getElementById('cond-issue-list')?.addEventListener('click', e => {
      const btn = e.target.closest('.cond-remove-btn');
      if (!btn) return;
      const row = btn.closest('.cond-issue-row');
      if (!row) return;
      const { reqItemId: val, name, qty, unit = 'ชิ้น' } = btn.dataset;
      const sel = document.getElementById('cond-add-select');
      if (sel) {
        const opt = document.createElement('option');
        opt.value = val; opt.dataset.name = name; opt.dataset.qty = qty; opt.dataset.unit = unit;
        opt.textContent = `${name} (${qty} ${unit})`;
        sel.appendChild(opt);
        document.getElementById('cond-add-wrap')?.style.removeProperty('display');
      }
      row.remove();
    });

    document.getElementById('btn-conditions')?.addEventListener('click', async () => {
      const msgEl = document.getElementById('cond-msg');
      const condItems = [...document.querySelectorAll('#cond-issue-list .cond-issue-row')].map(row => {
        const reqItemId = row.dataset.reqItemId;
        const note      = row.querySelector('.cond-note')?.value.trim();
        return {
          borrow_request_item_id: reqItemId,
          condition_type:         row.querySelector('.cond-type')?.value,
          ...(note ? { note } : {}),
        };
      });
      const btn = document.getElementById('btn-conditions');
      btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
      try {
        await submitConditions(id, { conditions: condItems });
        await renderPage();
      } catch (err) {
        if (msgEl) msgEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'บันทึกรายงานสภาพ';
      }
    });

    // ── Inline return form (card in in_lend) ─────────────────────────────────
    document.getElementById('btn-return')?.addEventListener('click', async () => {
      const file   = document.getElementById('return-photo')?.files?.[0];
      const allOk  = document.getElementById('return-all-ok')?.checked ? 1 : 0;
      const note   = document.getElementById('return-note')?.value.trim() || undefined;
      const msgEl  = document.getElementById('return-msg');
      if (!file) {
        if (msgEl) msgEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกรูปถ่าย</div>';
        return;
      }
      const btn = document.getElementById('btn-return');
      btn.disabled = true; btn.textContent = 'กำลังอัปโหลด…';
      try {
        const r2Key = await uploadPhoto(file);
        await submitReturn(id, { photo_r2_key: r2Key, all_items_ok: allOk, note });
        await renderPage();
      } catch (err) {
        if (msgEl) msgEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'คืนอุปกรณ์';
      }
    });

    // ── Admin: confirm return ─────────────────────────────────────────────────
    document.getElementById('admin-confirm-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const errEl   = document.getElementById('confirm-return-error');
      errEl.innerHTML = '';
      const pending = returns.find(r => r.status === 'pending');
      if (!pending) return;

      const retInputs = [...document.querySelectorAll('.qty-confirm-returned')];
      const repInputs = [...document.querySelectorAll('.qty-confirm-repair')];
      const payload   = [];
      let valid       = true;

      retInputs.forEach((inp, i) => {
        const qty_returned  = parseInt(inp.value, 10) || 0;
        const qty_to_repair = parseInt(repInputs[i]?.value, 10) || 0;
        const max           = parseInt(inp.dataset.max, 10);
        if (qty_returned < 0 || qty_returned > max) {
          errEl.innerHTML = `<div class="alert alert-error">จำนวนที่รับคืนต้องอยู่ระหว่าง 0–${max}</div>`;
          valid = false;
        }
        if (valid && qty_to_repair > qty_returned) {
          errEl.innerHTML = '<div class="alert alert-error">จำนวนส่งซ่อมต้องไม่เกินจำนวนที่รับคืน</div>';
          valid = false;
        }
        if (valid) payload.push({
          item_id:           inp.dataset.itemId,
          quantity_returned: qty_returned,
          ...(qty_to_repair > 0 ? { quantity_to_repair: qty_to_repair } : {}),
        });
      });

      if (!valid) return;
      const btn = e.submitter || document.querySelector('#admin-confirm-form [type=submit]');
      btn.disabled = true; btn.textContent = 'กำลังยืนยัน…';
      try {
        await confirmReturn(pending.id, { items: payload });
        await renderPage();
      } catch (err) {
        errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'ยืนยันการรับคืน';
      }
    });
  }

  await renderPage();
}

init();
