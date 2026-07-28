import { requireAuth } from '../auth.js';
import {
  getProjects, getSlots, getItems,
  createRequest, updateRequest, addRequestItem, removeRequestItem, adjustRequestItem,
  submitRequest, getNotifications,
} from '../api.js';
import { h, renderNavbar, showError } from '../ui.js';
import { initDatePickers } from '../datepicker.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function upcomingSlotDatetimes(slot, weeks = 4) {
  const results = [];
  const now = new Date();
  const targetDay = slot.day_of_week === 7 ? 0 : slot.day_of_week;
  const [hh, mm] = slot.time.split(':').map(Number);
  for (let w = 0; w < weeks * 7 + 7; w++) {
    const d = new Date(now);
    d.setDate(now.getDate() + w);
    if (d.getDay() !== targetDay) continue;
    d.setHours(hh, mm, 0, 0);
    if (d <= now) continue;
    results.push(d);
    if (results.length >= weeks) break;
  }
  return results;
}

function formatThaiDate(date) {
  return date.toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ── Step indicator ────────────────────────────────────────────────────────────

function stepIndicatorHtml(active) {
  const steps = ['ข้อมูล', 'อุปกรณ์ & วันที่'];
  return `<div class="step-indicator">
    ${steps.map((label, i) => {
      const n = i + 1;
      const cls = n < active ? 'step done' : n === active ? 'step active' : 'step';
      return `<div class="${cls}"><span class="step-num">${n}</span><span class="step-label">${h(label)}</span></div>`;
    }).join('<div class="step-sep">—</div>')}
  </div>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  let projects, slots;
  try {
    [projects, slots] = await Promise.all([
      getProjects().then(r => r?.data ?? []),
      getSlots('borrow').then(r => r?.data ?? []),
    ]);
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  const activeSlots = slots.filter(s => s.is_active);

  // Build: unique upcoming pickup dates (Mon/Wed/Fri) + available times per weekday
  const uniquePickupDates = [];
  const seenDateVals = new Set();
  const timesByDay = {}; // day_of_week → sorted string[]

  for (const slot of activeSlots) {
    if (!timesByDay[slot.day_of_week]) timesByDay[slot.day_of_week] = new Set();
    timesByDay[slot.day_of_week].add(slot.time);

    for (const d of upcomingSlotDatetimes(slot, 4)) {
      const dateVal = toDateStr(d);
      if (!seenDateVals.has(dateVal)) {
        seenDateVals.add(dateVal);
        uniquePickupDates.push({ d, dateVal, dayOfWeek: slot.day_of_week, label: formatThaiDate(d) });
      }
    }
  }
  uniquePickupDates.sort((a, b) => a.d - b.d);
  for (const key of Object.keys(timesByDay)) {
    timesByDay[key] = [...timesByDay[key]].sort();
  }

  // ── STEP 1: name + project ────────────────────────────────────────────────

  await renderStep1();

  async function renderStep1(prefill = {}) {
    app.innerHTML = `
      <a href="requests.html" class="back-btn">← คำขอยืม</a>
      ${stepIndicatorHtml(1)}
      <div class="page-header">
        <h1 class="page-title">สร้างคำขอยืม</h1>
      </div>

      <div class="card" style="max-width:600px">
        <div id="step1-error"></div>
        <form id="step1-form" class="form">
          <div class="form-group">
            <label class="form-label">ชื่อคำขอ <span class="form-required">*</span></label>
            <input class="form-input" type="text" name="name" required
              placeholder="เช่น คำขอยืมอุปกรณ์ถ่ายภาพ"
              value="${h(prefill.name || '')}">
          </div>

          <div class="form-group">
            <label class="form-label">โครงการ <span class="form-required">*</span></label>
            <select class="form-select" name="project_id" id="project-select" required>
              <option value="">-- เลือกโครงการ --</option>
              ${projects.map(p => `
                <option value="${h(p.id)}"
                  data-start="${h(p.start_date || '')}"
                  data-end="${h(p.end_date || '')}"
                  ${prefill.project_id === p.id ? 'selected' : ''}>
                  ${h(p.name)}
                </option>`).join('')}
            </select>
            <span class="form-hint" id="project-hint"></span>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="step1-submit">ถัดไป: เลือกอุปกรณ์ →</button>
            <a href="requests.html" class="btn btn-secondary">ยกเลิก</a>
          </div>
        </form>
      </div>`;

    document.getElementById('project-select').addEventListener('change', (e) => {
      const opt  = e.target.selectedOptions[0];
      const hint = document.getElementById('project-hint');
      hint.textContent = opt?.dataset.start
        ? `ช่วงโครงการ: ${opt.dataset.start} → ${opt.dataset.end}`
        : '';
    });

    document.getElementById('step1-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd     = new FormData(e.target);
      const name   = fd.get('name')?.trim();
      const projId = fd.get('project_id');
      const errEl  = document.getElementById('step1-error');
      errEl.innerHTML = '';

      if (!name)   { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุชื่อคำขอ</div>'; return; }
      if (!projId) { errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกโครงการ</div>'; return; }

      const btn = document.getElementById('step1-submit');
      btn.disabled = true;
      btn.textContent = 'กำลังสร้าง…';

      try {
        const res = await createRequest({ name, project_id: projId });
        const reqId = res?.data?.id;
        if (!reqId) throw new Error('ไม่ได้รับ ID คำขอจากเซิร์ฟเวอร์');
        await renderStep2(reqId);
      } catch (err) {
        errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = 'ถัดไป: เลือกอุปกรณ์ →';
      }
    });
  }

  // ── STEP 2: items + pickup date/time + return date + submit ───────────────

  async function renderStep2(reqId) {
    app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

    let allItems;
    try {
      const res = await getItems();
      allItems = (res?.data ?? []).filter(i => i.is_active !== 0 && (i.available_quantity ?? 0) > 0);
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    const selectedItems = new Map();

    // Pickup state: selected date value + selected time string
    let pickedTime = '';

    function getPickupValue() {
      const dateVal = document.getElementById('pickup-date-sel')?.value ?? '';
      return (dateVal && pickedTime) ? `${dateVal}T${pickedTime}` : '';
    }

    function getReturnValue() {
      const dateVal = document.getElementById('return-date-input')?.value ?? '';
      return dateVal ? `${dateVal}T23:59` : '';
    }

    function renderTimeBtns(dayOfWeek) {
      const container = document.getElementById('pickup-time-btns');
      if (!container) return;
      const times = dayOfWeek ? (timesByDay[dayOfWeek] ?? []) : [];
      if (times.length === 0) {
        pickedTime = '';
        container.innerHTML = '<span style="color:var(--text-muted);font-size:.85rem">ไม่มีช่วงเวลาในวันนี้</span>';
        return;
      }
      pickedTime = '';
      container.innerHTML = times.map(t =>
        `<button type="button" class="btn btn-secondary pickup-time-btn" data-time="${t}">${t} น.</button>`
      ).join('');
      container.querySelectorAll('.pickup-time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.pickup-time-btn').forEach(b => {
            b.classList.remove('btn-primary');
            b.classList.add('btn-secondary');
          });
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-primary');
          pickedTime = btn.dataset.time;
        });
      });
    }

    function renderPage() {
      const hasSlots = uniquePickupDates.length > 0;

      app.innerHTML = `
        <a href="requests.html" class="back-btn">← คำขอยืม</a>
        ${stepIndicatorHtml(2)}
        <div class="page-header">
          <h1 class="page-title">เลือกอุปกรณ์และวันที่</h1>
        </div>

        <div id="step2-error"></div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:1.5rem;align-items:start">
          <!-- Left: search + item grid -->
          <div>
            <div class="form-group" style="margin-bottom:1rem">
              <input class="form-input" type="text" id="item-search"
                placeholder="ค้นหาอุปกรณ์…" autocomplete="off">
            </div>
            <div class="items-grid" id="items-grid">
              ${renderItemGrid(allItems)}
            </div>
          </div>

          <!-- Right: selected items + date/time + submit -->
          <div class="card" style="position:sticky;top:1rem">
            <div class="card-title">รายการที่เลือก (${selectedItems.size})</div>
            <div id="selected-list">
              ${renderSelectedList()}
            </div>

            <div style="border-top:1px solid var(--border);margin:.85rem 0 .75rem;padding-top:.85rem">

              <div class="form-group" style="margin-bottom:.75rem">
                <label class="form-label" style="font-size:.85rem">วันที่รับอุปกรณ์ <span class="form-required">*</span></label>
                ${hasSlots ? `
                  <select class="form-select" id="pickup-date-sel" style="font-size:.85rem">
                    <option value="">-- เลือกวันที่ --</option>
                    ${uniquePickupDates.map(d =>
                      `<option value="${d.dateVal}" data-dow="${d.dayOfWeek}">${d.label}</option>`
                    ).join('')}
                  </select>` : `
                  <p style="color:var(--error);font-size:.85rem;margin:0">ไม่มีช่วงเวลาที่เปิดรับในขณะนี้</p>`}
              </div>

              ${hasSlots ? `
              <div class="form-group" style="margin-bottom:.75rem">
                <label class="form-label" style="font-size:.85rem">เวลารับ <span class="form-required">*</span></label>
                <div id="pickup-time-btns" style="display:flex;gap:.5rem;flex-wrap:wrap">
                  <span style="color:var(--text-muted);font-size:.85rem">กรุณาเลือกวันที่ก่อน</span>
                </div>
              </div>` : ''}

              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:.85rem">วันที่คืนอุปกรณ์ <span class="form-required">*</span></label>
                <input type="date" class="form-input" id="return-date-input" style="font-size:.85rem">
              </div>
            </div>

            <div style="margin-top:.75rem">
              <button class="btn btn-primary" id="btn-submit-req" style="width:100%">ส่งคำขอ</button>
            </div>
          </div>
        </div>

        <div style="margin-top:1rem">
          <button class="btn btn-secondary btn-sm" id="btn-back-step1">← ยกเลิก / กลับ</button>
        </div>`;

      initDatePickers(app);
      attachStep2Events();
    }

    function renderItemGrid(items) {
      if (items.length === 0) return '<p class="empty-text">ไม่พบอุปกรณ์</p>';
      return items.map(item => {
        const isAdded = selectedItems.has(item.id);
        return `<div class="item-card">
          <div class="item-card-body">
            ${item.image_url
              ? `<img class="item-card-img" src="${h(item.image_url)}" alt="${h(item.name)}">`
              : `<div class="item-card-placeholder">📦</div>`}
            <div class="item-card-name">${h(item.name)}</div>
            <div class="item-card-meta" style="font-size:.8rem;color:${(item.available_quantity ?? 0) <= 2 ? 'var(--error)' : 'var(--text-muted)'}">
              พร้อม: ${h(String(item.available_quantity ?? 0))}
            </div>
            <button class="btn btn-sm ${isAdded ? 'btn-secondary' : 'btn-primary'} btn-add-item"
              data-item-id="${h(item.id)}"
              ${isAdded ? 'disabled' : ''}>
              ${isAdded ? '✓ เพิ่มแล้ว' : '+ เพิ่ม'}
            </button>
          </div>
        </div>`;
      }).join('');
    }

    function renderSelectedList() {
      if (selectedItems.size === 0)
        return '<p class="empty-text" style="font-size:.9rem">ยังไม่มีอุปกรณ์</p>';
      return [...selectedItems.values()].map(({ item, quantity_requested }) => `
        <div class="selected-item-row" data-item-id="${h(item.id)}"
          style="display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem;padding-bottom:.6rem;border-bottom:1px solid var(--border)">
          <span style="flex:1;font-size:.9rem">${h(item.name)}</span>
          <input type="number" class="qty-input sel-qty"
            data-item-id="${h(item.id)}"
            value="${quantity_requested}" min="1" max="${h(String(item.available_quantity ?? 99))}">
          <button class="btn btn-sm btn-danger btn-remove-sel" data-item-id="${h(item.id)}">ลบ</button>
        </div>`).join('');
    }

    function attachStep2Events() {
      // Item search
      let debounceTimer;
      document.getElementById('item-search')?.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const q = e.target.value.trim().toLowerCase();
          const filtered = q
            ? allItems.filter(i => i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q))
            : allItems;
          document.getElementById('items-grid').innerHTML = renderItemGrid(filtered);
          attachAddBtns();
        }, 300);
      });

      attachAddBtns();

      // Qty change in selected list
      document.querySelectorAll('.sel-qty').forEach(input => {
        input.addEventListener('change', async () => {
          const itemId = input.dataset.itemId;
          const entry  = selectedItems.get(itemId);
          if (!entry) return;
          const maxQty = entry.item.available_quantity ?? 99;
          const qty    = Math.min(Math.max(parseInt(input.value) || 1, 1), maxQty);
          if (qty > maxQty) showError(`จำนวนที่ขอเกินจำนวนที่พร้อมใช้งานของ "${entry.item.name}"`);
          input.value    = qty;
          input.disabled = true;
          try {
            await adjustRequestItem(reqId, itemId, { quantity_requested: qty });
            entry.quantity_requested = qty;
          } catch (err) {
            showError(err.message);
          } finally {
            input.disabled = false;
          }
        });
      });

      // Remove from selected
      document.querySelectorAll('.btn-remove-sel').forEach(btn => {
        btn.addEventListener('click', async () => {
          const itemId = btn.dataset.itemId;
          btn.disabled = true;
          try {
            await removeRequestItem(reqId, itemId);
            selectedItems.delete(itemId);
            renderPage();
          } catch (err) {
            showError(err.message);
            btn.disabled = false;
          }
        });
      });

      // Pickup date → update time buttons
      document.getElementById('pickup-date-sel')?.addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        const dow = opt?.dataset.dow ? Number(opt.dataset.dow) : null;
        renderTimeBtns(dow);
      });

      // Back
      document.getElementById('btn-back-step1')?.addEventListener('click', () => {
        window.location.href = 'requests.html';
      });

      // Submit
      document.getElementById('btn-submit-req')?.addEventListener('click', async () => {
        const errEl = document.getElementById('step2-error');
        errEl.innerHTML = '';

        if (selectedItems.size === 0) {
          errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ</div>';
          return;
        }

        const pickup = getPickupValue();
        const ret    = getReturnValue();

        if (!pickup) {
          errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกวันที่และเวลารับอุปกรณ์</div>';
          return;
        }
        if (!ret) {
          errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันที่คืนอุปกรณ์</div>';
          return;
        }
        if (new Date(ret) <= new Date(pickup)) {
          errEl.innerHTML = '<div class="alert alert-error">วันคืนต้องอยู่หลังวันรับอุปกรณ์</div>';
          return;
        }

        const now          = new Date();
        const pickupDate   = new Date(pickup);
        const retDate      = new Date(ret);
        const leadDays     = (pickupDate - now) / 864e5;
        const durationDays = (retDate - pickupDate) / 864e5;

        const warnings = [];
        if (leadDays < 3)     warnings.push('ควรแจ้งล่วงหน้าอย่างน้อย 3 วันทำการก่อนวันรับ');
        if (leadDays > 30)    warnings.push('ไม่สามารถจองล่วงหน้าเกิน 30 วัน');
        if (durationDays > 7) warnings.push('ระยะเวลายืมเกิน 7 วัน — กรุณายืนยันกับเจ้าหน้าที่');

        if (warnings.length) {
          errEl.innerHTML = warnings.map(w => `<div class="alert alert-warning">${h(w)}</div>`).join('');
          if (leadDays > 30) return;
        }

        const btn = document.getElementById('btn-submit-req');
        btn.disabled = true;
        btn.textContent = 'กำลังส่งคำขอ…';

        try {
          await updateRequest(reqId, {
            requested_pickup_datetime: pickup,
            requested_return_datetime: ret,
          });
          await submitRequest(reqId);
          window.location.href = `request-detail.html?id=${encodeURIComponent(reqId)}`;
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false;
          btn.textContent = 'ส่งคำขอ';
        }
      });
    }

    function attachAddBtns() {
      document.querySelectorAll('.btn-add-item').forEach(btn => {
        if (btn.disabled) return;
        btn.addEventListener('click', async () => {
          const itemId = btn.dataset.itemId;
          const item   = allItems.find(i => i.id === itemId);
          if (!item || selectedItems.has(itemId)) return;
          btn.disabled = true;
          btn.textContent = '…';
          try {
            await addRequestItem(reqId, { item_id: itemId, quantity_requested: 1 });
            selectedItems.set(itemId, { item, quantity_requested: 1 });
            renderPage();
          } catch (err) {
            showError(err.message);
            btn.disabled = false;
            btn.textContent = '+ เพิ่ม';
          }
        });
      });
    }

    renderPage();
  }
}

init();
