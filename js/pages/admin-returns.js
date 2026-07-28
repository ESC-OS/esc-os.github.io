import { requireAuth } from '../auth.js';
import { getAllReturns, getReturn, confirmReturn, photoUrl, getNotifications } from '../api.js';
import { h, statusBadge, formatDateTime, renderNavbar, openModal } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  const app = document.getElementById('app');
  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  // ── list view ──────────────────────────────────────────────────────────────
  async function renderList() {
    app.innerHTML = '<p class="loading-text">กำลังโหลด...</p>';
    let returns;
    try {
      const res = await getAllReturns('pending');
      returns = res.data ?? [];
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">การคืนอุปกรณ์ (รอยืนยัน)</h1>
      </div>
      ${returns.length === 0
        ? '<p class="empty-text">ไม่มีรายการคืนที่รอยืนยัน</p>'
        : `<div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ชื่อคำขอ</th>
                  <th>รหัสคำขอ</th>
                  <th>วันที่ส่งคืน</th>
                  <th>สภาพ</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                ${returns.map(r => `
                  <tr class="clickable-row" data-return-id="${h(String(r.id))}" style="cursor:pointer" title="คลิกเพื่อดูรายละเอียด">
                    <td>${h(r.request_name ?? '-')}</td>
                    <td style="font-size:.82rem;color:var(--text-muted)">${h(String(r.request_id ?? '').slice(0, 8))}</td>
                    <td style="font-size:.82rem;white-space:nowrap">${formatDateTime(r.created_at)}</td>
                    <td>
                      ${r.all_items_ok === 1 || r.all_items_ok === true
                        ? '<span style="color:var(--success);font-weight:600">ปกติ</span>'
                        : '<span style="color:var(--error);font-weight:600">มีปัญหา</span>'}
                    </td>
                    <td>${statusBadge(r.status)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}`;

    document.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', () => renderDetail(row.dataset.returnId));
    });
  }

  // ── detail view ────────────────────────────────────────────────────────────
  async function renderDetail(returnId) {
    app.innerHTML = '<p class="loading-text">กำลังโหลด...</p>';
    let ret;
    try {
      const res = await getReturn(returnId);
      ret = res.data ?? res;
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    const conditions  = ret.conditions ?? [];
    const items       = ret.items       ?? [];
    const hasProblems = conditions.length > 0 || ret.all_items_ok === 0 || ret.all_items_ok === false;

    app.innerHTML = `
      <!-- Back -->
      <div style="margin-bottom:1rem">
        <button class="btn btn-secondary btn-sm" id="btn-back">← รายการคืน</button>
      </div>

      <div class="page-header">
        <h1 class="page-title">ยืนยันการคืน</h1>
        ${statusBadge(ret.status)}
      </div>

      <!-- Return info card -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">ข้อมูลการคืน</div>
        ${ret.photo_r2_key
          ? `<img src="${photoUrl(ret.photo_r2_key)}" alt="รูปการคืน"
               style="max-width:320px;width:100%;border-radius:8px;margin-bottom:1rem;display:block">`
          : ''}
        <div class="info-row"><span class="info-label">ชื่อคำขอ:</span> ${h(ret.request_name ?? '-')}</div>
        <div class="info-row"><span class="info-label">วันที่ส่งคืน:</span> ${formatDateTime(ret.created_at)}</div>
        ${ret.note
          ? `<div class="info-row"><span class="info-label">หมายเหตุจากผู้ใช้:</span> ${h(ret.note)}</div>`
          : ''}
        <div class="info-row">
          <span class="info-label">สภาพอุปกรณ์:</span>
          ${hasProblems
            ? '<span style="color:var(--error);font-weight:600">มีปัญหา / ชำรุด</span>'
            : '<span style="color:var(--success);font-weight:600">ปกติทุกชิ้น</span>'}
        </div>
      </div>

      <!-- Conditions -->
      ${conditions.length > 0 ? `
        <div class="card" style="margin-bottom:1.25rem;border-left:3px solid var(--error)">
          <div class="card-title" style="color:var(--error)">รายงานปัญหา</div>
          <ul style="margin:0;padding-left:1.2rem">
            ${conditions.map(c => `
              <li style="margin-bottom:.4rem">
                <strong>${h(c.item_name ?? c.item_id)}</strong>
                ${c.condition !== 'ok' ? ` — <span style="color:var(--error)">${h(c.condition)}</span>` : ''}
                ${c.note ? `: ${h(c.note)}` : ''}
              </li>`).join('')}
          </ul>
        </div>` : ''}

      <!-- Confirm form -->
      ${ret.status === 'pending' ? `
        <div class="card">
          <div class="card-title">ยืนยันการรับคืน</div>
          <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:1rem">
            ระบุจำนวนที่รับคืนจริง และจำนวนที่ต้องส่งซ่อม (ถ้ามี)
          </p>
          <div id="confirm-error"></div>
          <form id="confirm-form">
            <div class="table-wrap" style="margin-bottom:1rem">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>ชื่ออุปกรณ์</th>
                    <th>อนุมัติไป</th>
                    <th>รับคืนได้ <span class="form-required">*</span></th>
                    <th>ส่งซ่อม</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((it, idx) => `
                    <tr>
                      <td>${h(it.item_name ?? it.item_id)}</td>
                      <td>${it.quantity_approved}</td>
                      <td>
                        <input type="number" class="form-input qty-returned" min="0"
                          max="${it.quantity_approved}"
                          value="${it.quantity_approved}"
                          data-idx="${idx}"
                          data-item-id="${h(String(it.item_id))}"
                          data-max="${it.quantity_approved}"
                          style="width:80px">
                      </td>
                      <td>
                        <input type="number" class="form-input qty-repair" min="0"
                          value="0"
                          data-idx="${idx}"
                          style="width:80px">
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="confirm-submit-btn">ยืนยันการรับคืน</button>
              <button type="button" class="btn btn-secondary" id="btn-cancel">ยกเลิก</button>
            </div>
          </form>
        </div>` : `
        <div class="card">
          <p style="color:var(--text-muted)">รายการนี้ได้รับการยืนยันแล้ว</p>
        </div>`}
    `;

    // Back button
    document.getElementById('btn-back').addEventListener('click', renderList);
    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', renderList);

    // Confirm form
    const form = document.getElementById('confirm-form');
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const errEl = document.getElementById('confirm-error');
        errEl.innerHTML = '';

        const returnedInputs = form.querySelectorAll('.qty-returned');
        const repairInputs   = form.querySelectorAll('.qty-repair');
        const payload        = [];
        let valid = true;

        returnedInputs.forEach((inp, i) => {
          const qty_returned  = parseInt(inp.value, 10) || 0;
          const qty_to_repair = parseInt(repairInputs[i].value, 10) || 0;
          const max           = parseInt(inp.dataset.max, 10);

          if (qty_returned < 0 || qty_returned > max) {
            errEl.innerHTML = `<div class="alert alert-error">จำนวนที่รับคืนต้องอยู่ระหว่าง 0–${max}</div>`;
            valid = false; return;
          }
          if (qty_to_repair < 0 || qty_to_repair > qty_returned) {
            errEl.innerHTML = '<div class="alert alert-error">จำนวนส่งซ่อมต้องไม่เกินจำนวนที่รับคืน</div>';
            valid = false; return;
          }
          payload.push({
            item_id: inp.dataset.itemId,
            quantity_returned: qty_returned,
            ...(qty_to_repair > 0 ? { quantity_to_repair: qty_to_repair } : {}),
          });
        });

        if (!valid) return;

        const btn = document.getElementById('confirm-submit-btn');
        btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
        try {
          await confirmReturn(returnId, { items: payload });
          await renderList();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'ยืนยันการรับคืน';
        }
      });
    }
  }

  // ── start ──────────────────────────────────────────────────────────────────
  await renderList();
}

init();
