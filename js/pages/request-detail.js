import { requireAuth, refreshNavStatus } from '../auth.js';
import {
  getRequest, getReturn, getRequestReturns, getItems, getProject,
  addRequestItem, removeRequestItem, patchRequestItem, submitRequest, cancelRequest,
  rejectRequest, processRequest, tickItem, markReady, confirmPickup,
  submitReturn, uploadPhoto, updateRequest, photoUrl, assignHandler, searchUsers, fetchPhotoBlobUrl,
} from '../api.js';
import { h, statusBadge, formatDateTime, formatCountdown, showToast, showConfirm, openModal } from '../ui.js';
import { renderPicker, initPicker } from '../datepicker.js';

let countdownInterval = null;

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.href = '/requests/'; return; }

  const app = document.getElementById('app');

  async function load() {
    const [{ request, items }, returnsData] = await Promise.all([
      getRequest(id),
      getRequestReturns(id).catch(() => ({ returns: [] })),
    ]);
    let project = null;
    if (request.project_id) {
      try { const r = await getProject(request.project_id); project = r.project; } catch {}
    }
    return { request, items, returns: returnsData.returns, project };
  }

  async function renderPage() {
    clearInterval(countdownInterval);
    const { request, items, returns, project } = await load();
    const isStaff   = user.role === 'staff' || user.role === 'admin';
    const isOwner   = user.id === request.requester_id;
    const status    = request.status;
    const canCancel = isOwner && ['draft', 'pending', 'processing', 'ready_for_pickup'].includes(status);
    const allPrepared = items.filter(i => (i.quantity_approved ?? 0) > 0).every(i => i.is_prepared === 1);

    function itemRows() {
      const showApprovedDisplay = ['ready_for_pickup', 'in_lend', 'overdue', 'returned', 'completed', 'return_rejected'].includes(status)
                                  || (status === 'processing' && !isStaff);
      const showApprovedEdit    = isStaff && status === 'processing';
      return items.map(it => `
        <tr data-item-id="${h(it.item_id)}">
          <td>
            <div style="display:flex;align-items:center;gap:.55rem">
              ${it.photo_url
                ? `<img src="${h(it.photo_url)}" alt="${h(it.item_name)}" class="table-item-thumb" style="flex-shrink:0">`
                : `<div class="table-item-thumb table-item-thumb-ph" style="flex-shrink:0"></div>`}
              <div>
                <div style="font-weight:600">${h(it.item_name)}</div>
                <div class="mono" style="font-size:.72rem;color:var(--text-muted)">#${h(String(it.item_id).slice(0, 8))}</div>
              </div>
            </div>
          </td>
          <td>${h(it.category || '-')}</td>
          <td>${it.quantity_requested}</td>
          ${showApprovedDisplay ? `<td>${it.quantity_approved ?? '-'}</td>` : ''}
          ${showApprovedEdit
            ? `<td><input type="number" class="qty-input edit-approved-qty" data-item="${h(it.item_id)}"
                  min="0" max="${it.quantity_requested}" value="${it.quantity_approved ?? it.quantity_requested}"></td>` : ''}
          ${isStaff && status === 'processing'
            ? `<td><button class="tick-btn ${it.is_prepared ? 'ticked' : ''} do-tick" data-item="${h(it.item_id)}" title="คลิกเพื่อ${it.is_prepared ? 'ยกเลิก' : 'ทำเครื่องหมาย'}">
                ${it.is_prepared ? '✓' : ''}</button></td>` : ''}
          ${isOwner && status === 'draft'
            ? `<td><button class="remove-item-btn do-remove" data-item="${h(it.item_id)}" title="นำออก">✕</button></td>` : ''}
        </tr>`).join('');
    }

    function itemsTable() {
      const showApprovedDisplay = ['ready_for_pickup', 'in_lend', 'overdue', 'returned', 'completed', 'return_rejected'].includes(status)
                                  || (status === 'processing' && !isStaff);
      const showApprovedEdit    = isStaff && status === 'processing';
      return `
        <table class="req-items-table">
          <thead>
            <tr>
              <th>อุปกรณ์</th><th>หมวดหมู่</th><th>จำนวนที่ขอ</th>
              ${(showApprovedDisplay || showApprovedEdit) ? '<th>จำนวนที่อนุมัติ</th>' : ''}
              ${isStaff && status === 'processing' ? '<th>เตรียมแล้ว</th>' : ''}
              ${isOwner && status === 'draft'      ? '<th></th>'           : ''}
            </tr>
          </thead>
          <tbody id="items-tbody">${itemRows()}</tbody>
        </table>`;
    }

    // Status stepper
    const FLOW_STEPS = [
      { key: 'draft',            label: 'ร่าง' },
      { key: 'pending',          label: 'รอดำเนินการ' },
      { key: 'processing',       label: 'กำลังดำเนินการ' },
      { key: 'ready_for_pickup', label: 'พร้อมรับ' },
      { key: 'in_lend',          label: 'กำลังยืม' },
      { key: 'returned',         label: 'คืนแล้ว' },
      { key: 'completed',        label: 'เสร็จสิ้น' },
    ];
    const STEP_MAP = { overdue: 4, return_rejected: 5, rejected: 1, cancelled: -1 };
    const currentStep = STEP_MAP[status] ?? FLOW_STEPS.findIndex(s => s.key === status);
    const stepper = `
      <div class="status-stepper">
        ${FLOW_STEPS.map((step, i) => {
          const isDone   = i < currentStep;
          const isActive = i === currentStep;
          const isSpecialError = isActive && ['overdue','return_rejected','rejected','cancelled'].includes(status);
          let cls = isDone ? 'done' : isActive ? (isSpecialError ? 'error' : 'active') : '';
          return `
            <div class="step-item ${cls}">
              <div class="step-dot">${isDone ? '✓' : i + 1}</div>
              <div class="step-label">${step.label}</div>
            </div>`;
        }).join('')}
      </div>`;

    // Context hint for draft stage
    const draftHint = isOwner && status === 'draft' ? `
      <div class="flow-hint">
        <strong>ขั้นตอนที่ 1:</strong> เพิ่มอุปกรณ์ที่ต้องการยืมด้านล่าง แล้วกดปุ่ม "ส่งคำขอ" เพื่อส่งให้เจ้าหน้าที่อนุมัติ
      </div>` : '';

    app.innerHTML = `
      <button class="back-btn" onclick="history.back()">← กลับ</button>
      ${stepper}
      ${draftHint}
      <div class="req-header">
        <div class="req-title-row">
          ${request.name ? `<span style="font-weight:700;font-size:1.05rem">${h(request.name)}</span>` : ''}
          <span class="req-id">#${h(id.slice(0, 8))}</span>
          ${statusBadge(status)}
        </div>
        <div class="actions-bar">
          ${isOwner && status === 'draft'
            ? items.length > 0
              ? `<button class="btn btn-success" id="btn-submit">ส่งคำขอ</button>`
              : `<button class="btn btn-success" disabled title="กรุณาเพิ่มอุปกรณ์ก่อน" style="opacity:.45">ส่งคำขอ</button>`
            : ''}
          ${(isOwner || isStaff) && status === 'ready_for_pickup'
            ? `<button class="btn btn-success" id="btn-pickup">ยืนยันการรับ</button>` : ''}
          ${isStaff && status === 'processing'
            ? `<button class="btn btn-success" id="btn-ready" ${!allPrepared ? 'disabled title="ต้องทำเครื่องหมายเตรียมแล้วทุกรายการก่อน"' : ''}>พร้อมให้รับแล้ว</button>`
            : ''}
          ${canCancel
            ? `<button class="btn btn-danger" id="btn-cancel">ยกเลิกคำขอ</button>` : ''}
        </div>
      </div>

      <div id="action-error"></div>

      <div class="card">
        <div class="card-title">ข้อมูลคำขอ</div>
        ${status === 'draft' && (isOwner || isStaff) ? `
          <div id="req-edit-error"></div>
          <div class="form" style="margin-top:.1rem">
            <div class="form-group">
              <label class="form-label">ชื่อคำขอ</label>
              <input class="form-input" id="edit-req-name" value="${h(request.name || '')}" placeholder="เช่น ยืมอุปกรณ์สำหรับกิจกรรม..." autocomplete="off">
            </div>
            ${request.project_name ? `<div class="info-row" style="margin-bottom:.75rem"><span class="info-label">โครงการ</span><a href="/project-detail/?id=${h(request.project_id)}" style="color:var(--primary)">${h(request.project_name)}</a></div>` : ''}
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">วันที่รับ</label>
                ${renderPicker({ id: 'edit-pickup', withTime: true, restricted: true,
                    value: (request.requested_pickup_datetime || '').slice(0, 16),
                    min: project ? project.start_date : '', max: project ? project.end_date : '' })}
              </div>
              <div class="form-group">
                <label class="form-label">วันที่คืน</label>
                ${renderPicker({ id: 'edit-return', withTime: true, restricted: true,
                    value: (request.requested_return_datetime || '').slice(0, 16),
                    min: project ? project.start_date : '', max: project ? project.end_date : '' })}
              </div>
            </div>
            <div class="form-actions" style="padding-top:.1rem">
              <button class="btn btn-primary btn-sm" id="btn-save-req">บันทึก</button>
            </div>
          </div>` : `
          <div class="req-info-grid">
            ${request.project_name ? `<div class="info-row"><span class="info-label">โครงการ</span><a href="/project-detail/?id=${h(request.project_id)}" style="color:var(--primary)">${h(request.project_name)}</a></div>` : ''}
            <div class="info-row"><span class="info-label">วันที่รับที่ขอ</span><span>${formatDateTime(request.requested_pickup_datetime)}</span></div>
            ${request.confirmed_pickup_datetime ? `<div class="info-row"><span class="info-label">วันที่รับยืนยัน</span><span>${formatDateTime(request.confirmed_pickup_datetime)}</span></div>` : ''}
            <div class="info-row"><span class="info-label">วันที่คืน</span><span>${formatDateTime(request.requested_return_datetime)}</span></div>
            ${request.submitted_at ? `<div class="info-row"><span class="info-label">ส่งเมื่อ</span><span>${formatDateTime(request.submitted_at)}</span></div>` : ''}
            ${request.pickup_timeout_at && status === 'ready_for_pickup'
              ? `<div class="info-row"><span class="info-label">หมดเวลารับ</span><span class="countdown">${formatCountdown(request.pickup_timeout_at)}</span></div>` : ''}
          </div>
          ${request.admin_note ? `<div class="alert alert-info" style="margin-top:.75rem">หมายเหตุจากเจ้าหน้าที่: ${h(request.admin_note)}</div>` : ''}`}
      </div>

      ${request.processing_by ? `
      <div class="card">
        <div class="card-header">
          <div class="card-title" style="margin-bottom:0">ผู้ดำเนินการ</div>
          ${isStaff && ['processing', 'ready_for_pickup', 'in_lend'].includes(status)
            ? `<button class="btn btn-secondary btn-sm" id="btn-reassign">เปลี่ยน</button>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:.75rem;margin-top:.85rem">
          ${request.handler_avatar_url
            ? `<img src="${h(request.handler_avatar_url)}" alt="${h(request.handler_name)}" class="member-avatar" style="width:40px;height:40px;flex-shrink:0">`
            : `<div class="member-avatar-ph" style="width:40px;height:40px;font-size:.9rem;flex-shrink:0">${h((request.handler_name || '?').charAt(0))}</div>`}
          <div>
            <div style="font-weight:600">${h(request.handler_name)}</div>
            <div style="font-size:.8rem;color:var(--text-muted)">${h(request.handler_email)}</div>
            ${request.handler_phone   ? `<div style="font-size:.8rem;color:var(--text-muted)">${h(request.handler_phone)}</div>` : ''}
            ${request.handler_line_id ? `<div style="font-size:.8rem;color:var(--text-muted)">LINE: ${h(request.handler_line_id)}</div>` : ''}
          </div>
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:.6rem">
          <div class="card-title" style="margin-bottom:0">รายการอุปกรณ์</div>
          ${isOwner && status === 'draft' ? `
            <div class="add-item-row" id="add-item-section" style="border:none;padding:0;margin:0;flex:1;min-width:200px">
              <div style="position:relative;flex:1;min-width:0">
                <input class="form-input" id="add-item-search" placeholder="ค้นหาอุปกรณ์..." autocomplete="off" style="margin:0">
                <div id="item-search-results" class="search-dropdown search-dropdown-up" style="display:none"></div>
              </div>
              <input type="number" class="add-item-qty" id="add-item-qty" min="1" value="1">
              <button class="btn btn-primary btn-sm" id="btn-add-item" disabled>+ เพิ่ม</button>
            </div>` : ''}
        </div>
        <div id="add-warnings"></div>
        <div id="items-wrap">${itemsTable()}</div>

        ${isStaff && status === 'pending' ? `
          <div class="process-section">
            <div class="form-group" style="margin-bottom:.75rem">
              <label class="form-label" style="font-size:.82rem">วันและเวลารับยืนยัน (ไม่บังคับ)</label>
              <div style="max-width:280px">${renderPicker({ id: 'process-pickup', withTime: true })}</div>
            </div>
            <div class="form-group" style="margin-bottom:.75rem">
              <label class="form-label" style="font-size:.82rem">หมายเหตุ (ไม่บังคับ)</label>
              <textarea class="form-textarea" id="process-note" style="min-height:60px"></textarea>
            </div>
            <div class="inline-row">
              <button class="btn btn-primary" id="btn-process">อนุมัติและเริ่มดำเนินการ</button>
              <input class="reject-input" id="reject-note" placeholder="เหตุผลการปฏิเสธ">
              <button class="btn btn-danger" id="btn-reject">ปฏิเสธ</button>
            </div>
          </div>` : ''}
      </div>

      ${isOwner && (status === 'in_lend' || status === 'overdue' || status === 'return_rejected') ? `
        <div class="card">
          <div class="card-title">คืนอุปกรณ์</div>
          ${status === 'return_rejected' ? '<div class="alert alert-error" style="margin-bottom:.75rem">การคืนก่อนหน้าถูกปฏิเสธ กรุณาส่งใหม่</div>' : ''}
          <div class="return-form">
            <div class="form-group">
              <label class="form-label">รูปถ่ายการคืน <span class="form-required">*</span></label>
              <input type="file" accept="image/*" id="return-photo">
            </div>
            <div class="form-group">
              <textarea class="form-textarea" id="return-note" placeholder="หมายเหตุ (ไม่บังคับ)" style="min-height:60px"></textarea>
            </div>
            <button class="btn btn-primary" id="btn-return">ส่งการคืน</button>
          </div>
        </div>` : ''}

      ${returns.length > 0 ? `
        <div class="card">
          <div class="card-title">ประวัติการคืน</div>
          <div style="display:flex;flex-direction:column;gap:.75rem">
            ${returns.map(r => `
              <div class="return-card">
                <div>ส่งโดย <strong>${h(r.submitted_by_name)}</strong> เมื่อ ${formatDateTime(r.submitted_at)}</div>
                <div>สถานะ: <strong>${r.status === 'confirmed' ? '✓ ยืนยันแล้ว' : r.status === 'rejected' ? '✗ ถูกปฏิเสธ' : 'รอยืนยัน'}</strong></div>
                ${r.note ? `<div>หมายเหตุ: ${h(r.note)}</div>` : ''}
                ${r.admin_note ? `<div class="alert alert-info">หมายเหตุเจ้าหน้าที่: ${h(r.admin_note)}</div>` : ''}
                <div class="return-photo-slot" data-return-id="${h(r.id)}">
                  <div class="return-photo-ph">กำลังโหลดรูป...</div>
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}`;

    document.querySelectorAll('.return-photo-slot').forEach(async slot => {
      try {
        const { return: ret } = await getReturn(slot.dataset.returnId);
        if (!ret.photo_url) { slot.innerHTML = ''; return; }
        const blobUrl = await fetchPhotoBlobUrl(ret.photo_url);
        if (blobUrl) slot.innerHTML = `<img src="${blobUrl}" alt="รูปการคืน" class="return-photo">`;
        else slot.innerHTML = '';
      } catch { slot.innerHTML = ''; }
    });

    if (status === 'ready_for_pickup' && request.pickup_timeout_at) {
      const updateCountdown = () => {
        const el = document.querySelector('.countdown');
        if (el) el.textContent = formatCountdown(request.pickup_timeout_at);
      };
      countdownInterval = setInterval(updateCountdown, 30000);
    }

    initPicker('process-pickup');
    initPicker('edit-pickup');
    initPicker('edit-return');

    const saveBtn = document.getElementById('btn-save-req');
    saveBtn?.addEventListener('click', async () => {
      const name   = document.getElementById('edit-req-name')?.value.trim() || null;
      const pickup = document.getElementById('edit-pickup')?.dataset.value || undefined;
      const ret    = document.getElementById('edit-return')?.dataset.value || undefined;
      const errEl  = document.getElementById('req-edit-error');
      if (errEl) errEl.innerHTML = '';
      const body = {};
      if (name !== undefined)  body.name = name;
      if (pickup !== undefined) body.requested_pickup_datetime = pickup;
      if (ret    !== undefined) body.requested_return_datetime = ret;
      saveBtn.disabled = true;
      saveBtn.textContent = 'กำลังบันทึก...';
      try {
        await updateRequest(id, body);
        showToast('บันทึกสำเร็จ');
        await renderPage();
      } catch (err) {
        if (errEl) errEl.innerHTML = `<div class="alert alert-error" style="margin-bottom:.6rem">${h(err.message)}</div>`;
        saveBtn.disabled = false;
        saveBtn.textContent = 'บันทึก';
      }
    });

    function errBox(msg) {
      document.getElementById('action-error').innerHTML = `<div class="alert alert-error">${h(msg)}</div>`;
    }

    if (isOwner && status === 'draft') {
      let selectedItem = null;
      let itemDebounce;

      const itemSearch  = document.getElementById('add-item-search');
      const itemResults = document.getElementById('item-search-results');
      const addBtn      = document.getElementById('btn-add-item');

      async function fetchItemResults(q) {
        try {
          const { items: found } = await getItems({ search: q || undefined, limit: 10 });
          const avail = found.filter(i => i.is_active === 1 && i.available_quantity > 0);
          itemResults.innerHTML = avail.length === 0
            ? `<div class="search-dropdown-empty">ไม่พบอุปกรณ์</div>`
            : avail.map((i, idx) => `
                <div class="search-dropdown-item" data-idx="${idx}">
                  ${i.image_r2_key
                    ? `<img src="${photoUrl(i.image_r2_key)}" alt="${h(i.name)}" class="table-item-thumb" style="flex-shrink:0">`
                    : `<div class="table-item-thumb table-item-thumb-ph" style="flex-shrink:0"></div>`}
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:600">${h(i.name)}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">
                      <span class="mono">#${h(String(i.id).slice(0, 8))}</span>
                      ${i.category ? ` · ${h(i.category)}` : ''} · พร้อมใช้ ${i.available_quantity}${i.unit ? ' ' + h(i.unit) : ''}
                    </div>
                  </div>
                </div>`).join('');
          itemResults.querySelectorAll('.search-dropdown-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
              e.preventDefault();
              selectedItem = avail[+el.dataset.idx];
              itemSearch.value = selectedItem.name;
              itemResults.style.display = 'none';
              addBtn.disabled = false;
              document.getElementById('add-item-qty').max = selectedItem.available_quantity;
            });
          });
          itemResults.style.display = 'block';
        } catch {}
      }

      itemSearch.addEventListener('focus', () => fetchItemResults(itemSearch.value.trim()));

      itemSearch.addEventListener('input', () => {
        selectedItem = null;
        addBtn.disabled = true;
        clearTimeout(itemDebounce);
        itemDebounce = setTimeout(() => fetchItemResults(itemSearch.value.trim()), 300);
      });

      itemSearch.addEventListener('blur', () => setTimeout(() => { itemResults.style.display = 'none'; }, 150));

      addBtn.addEventListener('click', async () => {
        if (!selectedItem) return;
        const qty = parseInt(document.getElementById('add-item-qty').value);
        try {
          const { warnings } = await addRequestItem(id, { item_id: selectedItem.id, quantity_requested: qty });
          if (warnings?.length) {
            document.getElementById('add-warnings').innerHTML =
              warnings.map(w => `<div class="alert alert-warning">⚠ ${h(w)}</div>`).join('');
          }
          showToast('เพิ่มอุปกรณ์สำเร็จ');
          await renderPage();
        } catch (err) { errBox(err.message); }
      });
    }

    document.querySelectorAll('.do-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await removeRequestItem(id, btn.dataset.item); await renderPage(); }
        catch (err) { errBox(err.message); }
      });
    });

    document.getElementById('btn-submit')?.addEventListener('click', async () => {
      if (!await showConfirm('ยืนยันการส่งคำขอ?')) return;
      try { await submitRequest(id); refreshNavStatus(); window.location.href = '/requests/'; }
      catch (err) { errBox(err.message); }
    });

    document.getElementById('btn-cancel')?.addEventListener('click', async () => {
      if (!await showConfirm('ยืนยันการยกเลิกคำขอ?', { danger: true })) return;
      try { await cancelRequest(id); showToast('ยกเลิกคำขอแล้ว'); await renderPage(); refreshNavStatus(); }
      catch (err) { errBox(err.message); }
    });

    document.getElementById('btn-pickup')?.addEventListener('click', async () => {
      try { await confirmPickup(id); showToast('ยืนยันการรับอุปกรณ์แล้ว'); await renderPage(); refreshNavStatus(); }
      catch (err) { errBox(err.message); }
    });

    document.getElementById('btn-ready')?.addEventListener('click', async () => {
      try { await markReady(id); showToast('ทำเครื่องหมายพร้อมรับแล้ว'); await renderPage(); refreshNavStatus(); }
      catch (err) { errBox(err.message); }
    });

    document.querySelectorAll('.do-tick').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await tickItem(id, btn.dataset.item); await renderPage(); }
        catch (err) { errBox(err.message); }
      });
    });

    document.getElementById('btn-reassign')?.addEventListener('click', () => {
      let selectedUser = null;
      let debounceTimer;

      const close = openModal('เปลี่ยนผู้ดำเนินการ', `
        <div id="reassign-error"></div>
        <div class="form">
          <div class="form-group" style="position:relative">
            <label class="form-label">ค้นหาเจ้าหน้าที่</label>
            <input class="form-input" id="reassign-search" placeholder="ค้นหาชื่อหรืออีเมล..." autocomplete="off">
            <div id="reassign-results" class="search-dropdown" style="display:none"></div>
          </div>
          <div id="reassign-selected" style="display:none;margin-top:.35rem"></div>
          <div class="form-actions">
            <button class="btn btn-primary" id="do-reassign-btn" disabled>เปลี่ยน</button>
            <button class="btn btn-secondary" id="cancel-reassign-btn">ยกเลิก</button>
          </div>
        </div>`);

      const searchInput = document.getElementById('reassign-search');
      const resultsBox  = document.getElementById('reassign-results');
      const selectedBox = document.getElementById('reassign-selected');
      const confirmBtn  = document.getElementById('do-reassign-btn');
      const errorBox    = document.getElementById('reassign-error');

      function pickUser(u) {
        selectedUser = u;
        resultsBox.style.display = 'none';
        searchInput.value = u.name;
        selectedBox.style.display = 'block';
        selectedBox.innerHTML = `
          <div style="display:flex;align-items:center;gap:.6rem;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.5rem .75rem">
            ${u.avatar_url
              ? `<img src="${h(u.avatar_url)}" class="member-avatar" alt="${h(u.name)}">`
              : `<div class="member-avatar-ph">${h(u.name.charAt(0))}</div>`}
            <div>
              <div style="font-weight:600;font-size:.88rem">${h(u.name)}</div>
              <div style="font-size:.75rem;color:var(--text-muted)">${h(u.email)}</div>
            </div>
          </div>`;
        confirmBtn.disabled = false;
      }

      async function fetchResults(q) {
        try {
          const { users } = await searchUsers(q, 'staff');
          resultsBox.innerHTML = users.length === 0
            ? `<div class="search-dropdown-empty">ไม่พบเจ้าหน้าที่</div>`
            : users.map((u, i) => `
                <div class="search-dropdown-item" data-idx="${i}">
                  ${u.avatar_url
                    ? `<img src="${h(u.avatar_url)}" class="member-avatar" alt="${h(u.name)}">`
                    : `<div class="member-avatar-ph">${h(u.name.charAt(0))}</div>`}
                  <div>
                    <div style="font-weight:600">${h(u.name)}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${h(u.email)}</div>
                  </div>
                </div>`).join('');
          resultsBox.querySelectorAll('.search-dropdown-item').forEach(el => {
            el.addEventListener('mousedown', e => { e.preventDefault(); pickUser(users[+el.dataset.idx]); });
          });
          resultsBox.style.display = 'block';
        } catch {}
      }

      searchInput.addEventListener('focus', () => fetchResults(searchInput.value.trim()));
      searchInput.addEventListener('input', () => {
        selectedUser = null; confirmBtn.disabled = true;
        selectedBox.style.display = 'none';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchResults(searchInput.value.trim()), 300);
      });
      searchInput.addEventListener('blur', () => setTimeout(() => { resultsBox.style.display = 'none'; }, 150));

      document.getElementById('cancel-reassign-btn').addEventListener('click', close);
      confirmBtn.addEventListener('click', async () => {
        if (!selectedUser) return;
        confirmBtn.disabled = true; confirmBtn.textContent = 'กำลังเปลี่ยน...';
        try {
          await assignHandler(id, selectedUser.id);
          close();
          showToast('เปลี่ยนผู้ดำเนินการสำเร็จ');
          await renderPage();
        } catch (err) {
          errorBox.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          confirmBtn.disabled = false; confirmBtn.textContent = 'เปลี่ยน';
        }
      });
    });

    document.querySelectorAll('.edit-approved-qty').forEach(inp => {
      inp.addEventListener('change', async () => {
        const qty = parseInt(inp.value);
        if (isNaN(qty)) return;
        inp.disabled = true;
        try {
          const { request_item } = await patchRequestItem(id, inp.dataset.item, { quantity_approved: qty });
          inp.value = request_item.quantity_approved;
        } catch (err) {
          errBox(err.message);
        } finally {
          inp.disabled = false;
        }
      });
    });

    document.getElementById('btn-process')?.addEventListener('click', async () => {
      const pickup = document.getElementById('process-pickup')?.dataset.value || '';
      const note   = document.getElementById('process-note').value;
      try {
        await processRequest(id, {
          confirmed_pickup_datetime: pickup || undefined,
          admin_note: note || undefined,
        });
        showToast('ดำเนินการสำเร็จ');
        await renderPage();
        refreshNavStatus();
      } catch (err) { errBox(err.message); }
    });

    document.getElementById('btn-reject')?.addEventListener('click', async () => {
      const note = document.getElementById('reject-note').value;
      if (!note) { errBox('กรุณาระบุเหตุผลการปฏิเสธ'); return; }
      try { await rejectRequest(id, { admin_note: note }); showToast('ปฏิเสธคำขอแล้ว'); await renderPage(); refreshNavStatus(); }
      catch (err) { errBox(err.message); }
    });

    document.getElementById('btn-return')?.addEventListener('click', async () => {
      const file = document.getElementById('return-photo').files[0];
      if (!file) { errBox('กรุณาเลือกรูปถ่าย'); return; }
      const btn = document.getElementById('btn-return');
      btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...';
      try {
        const r2Key = await uploadPhoto(file);
        const note  = document.getElementById('return-note').value;
        await submitReturn(id, { photo_r2_key: r2Key, note: note || undefined });
        refreshNavStatus();
        window.location.href = '/requests/';
      } catch (err) {
        errBox(err.message);
        btn.disabled = false; btn.textContent = 'ส่งการคืน';
      }
    });
  }

  await renderPage();
}

init();
