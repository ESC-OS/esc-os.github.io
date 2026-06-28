import { requireAuth, refreshNavStatus } from '../auth.js';
import { getAllReturns, getReturn, getRequest, confirmReturn, rejectReturn, fetchPhotoBlobUrl } from '../api.js';
import { h, formatDateTime, showToast, openModal, showConfirm } from '../ui.js';
import { renderSelect, initSelect } from '../select.js';

async function init() {
  const user = await requireAuth(['staff', 'admin']);
  if (!user) return;

  const app = document.getElementById('app');

  async function renderPage(statusFilter = 'pending') {
    const { returns } = await getAllReturns(statusFilter || undefined);

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">การคืนอุปกรณ์</h1>
        ${renderSelect({ id: 'status-filter', value: statusFilter, options: [
          ['', 'ทั้งหมด'], ['pending', 'รอยืนยัน'],
          ['confirmed', 'ยืนยันแล้ว'], ['rejected', 'ถูกปฏิเสธ'],
        ] })}
      </div>
      ${returns.length === 0
        ? '<p class="empty-text">ไม่มีรายการคืน</p>'
        : `<div style="display:flex;flex-direction:column;gap:.75rem">
            ${returns.map(r => `
              <div class="return-admin-card">
                <div class="return-photo-slot" data-return-id="${h(r.id)}">
                  <div class="return-photo-ph">กำลังโหลดรูป...</div>
                </div>
                <div style="flex:1">
                  <div class="info-row">
                    <span class="info-label">คำขอ:</span>
                    <a href="/request-detail/?id=${h(r.borrow_request_id)}" style="color:var(--primary)">
                      #${h(r.borrow_request_id.slice(0, 8))}
                    </a>
                  </div>
                  <div class="info-row"><span class="info-label">ส่งโดย:</span>${h(r.submitted_by_name)}</div>
                  <div class="info-row"><span class="info-label">เวลา:</span>${formatDateTime(r.submitted_at)}</div>
                  ${r.note ? `<div class="info-row"><span class="info-label">หมายเหตุ:</span>${h(r.note)}</div>` : ''}
                  <div class="info-row">
                    <span class="info-label">สถานะ:</span>
                    <span class="status-pill status-pill-${h(r.status)}">
                      ${r.status === 'confirmed' ? 'ยืนยันแล้ว' : r.status === 'rejected' ? 'ถูกปฏิเสธ' : 'รอยืนยัน'}
                    </span>
                  </div>
                  ${r.admin_note ? `<div class="info-row"><span class="info-label">หมายเหตุเจ้าหน้าที่:</span>${h(r.admin_note)}</div>` : ''}
                </div>
                <div class="actions-bar" style="flex-direction:column;align-items:flex-start;gap:.5rem">
                  <a href="/request-detail/?id=${h(r.borrow_request_id)}" class="btn btn-outline-primary btn-sm">ดูคำขอ</a>
                  ${r.status === 'pending' ? `
                    <button class="btn btn-success btn-sm do-confirm"
                      data-id="${h(r.id)}"
                      data-request-id="${h(r.borrow_request_id)}">ยืนยันการคืน</button>
                    <div style="display:flex;flex-direction:column;gap:.3rem;width:100%">
                      <input class="stock-note reject-note-input" data-id="${h(r.id)}" placeholder="เหตุผลการปฏิเสธ" style="font-size:.82rem">
                      <button class="btn btn-danger btn-sm do-reject" data-id="${h(r.id)}">ปฏิเสธ</button>
                    </div>` : ''}
                </div>
              </div>`).join('')}
          </div>`}`;

    document.querySelectorAll('.return-photo-slot').forEach(async slot => {
      try {
        const { return: ret } = await getReturn(slot.dataset.returnId);
        if (!ret.photo_url) { slot.innerHTML = ''; return; }
        const blobUrl = await fetchPhotoBlobUrl(ret.photo_url);
        if (blobUrl) slot.innerHTML = `<img src="${blobUrl}" alt="รูปการคืน" class="return-admin-photo">`;
        else slot.innerHTML = '';
      } catch { slot.innerHTML = ''; }
    });

    initSelect('status-filter', v => renderPage(v));

    document.querySelectorAll('.do-confirm').forEach(btn => {
      btn.addEventListener('click', async () => {
        const returnId  = btn.dataset.id;
        const requestId = btn.dataset.requestId;
        btn.disabled = true; btn.textContent = 'กำลังโหลด...';

        let requestItems;
        try {
          const { items } = await getRequest(requestId);
          requestItems = items.filter(it => (it.quantity_approved ?? 0) > 0);
        } catch (err) {
          showToast('โหลดรายการไม่ได้: ' + err.message, 'error');
          btn.disabled = false; btn.textContent = 'ยืนยันการคืน';
          return;
        }

        const SAVE_KEY = `return-confirm-${returnId}`;
        const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; } })();
        const hadSaved = saved !== null;

        const close = openModal('ยืนยันการคืน — นับจำนวน', `
          <div id="confirm-error"></div>
          ${hadSaved ? `<div class="alert alert-info" style="margin-bottom:.75rem;font-size:.82rem">โหลดข้อมูลที่กรอกไว้ก่อนหน้าแล้ว</div>` : ''}
          <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem;line-height:1.6">
            กรอกจำนวนที่ได้รับคืนและส่งซ่อม รายการที่ขาดจะถูกตัดออกจากสต็อก
          </p>
          <div class="table-wrap" style="margin-bottom:1rem">
            <table class="data-table">
              <thead>
                <tr>
                  <th>อุปกรณ์</th>
                  <th style="text-align:center">อนุมัติ</th>
                  <th style="text-align:center">คืนได้</th>
                  <th style="text-align:center">ส่งซ่อม</th>
                  <th style="text-align:center">ขาด</th>
                </tr>
              </thead>
              <tbody>
                ${requestItems.map(it => {
                  const approved  = it.quantity_approved ?? 0;
                  const sv        = saved?.[it.item_id];
                  const valRet    = sv != null ? sv.returned : approved;
                  const valRepair = sv != null ? sv.repair   : 0;
                  return `
                  <tr data-item-id="${h(it.item_id)}" data-approved="${approved}">
                    <td style="font-weight:500">${h(it.item_name)}</td>
                    <td style="text-align:center">${approved}</td>
                    <td style="text-align:center">
                      <input type="number" class="form-input qty-returned"
                        min="0" max="${approved}" value="${valRet}"
                        style="width:72px;text-align:center;padding:.35rem .4rem">
                    </td>
                    <td style="text-align:center">
                      <input type="number" class="form-input qty-repair"
                        min="0" max="${approved}" value="${valRepair}"
                        style="width:72px;text-align:center;padding:.35rem .4rem">
                    </td>
                    <td style="text-align:center;font-weight:600" class="qty-missing">0</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
            <span id="autosave-label" style="font-size:.75rem;color:var(--text-muted)"></span>
            <div class="form-actions" style="margin:0">
              <button class="btn btn-success" id="do-confirm-submit">ยืนยัน</button>
              <button class="btn btn-secondary" id="do-confirm-cancel">ยกเลิก</button>
            </div>
          </div>`, { wide: true, onClose: () => { btn.disabled = false; btn.textContent = 'ยืนยันการคืน'; } });

        let saveTimer;
        function saveProgress() {
          const data = {};
          document.querySelectorAll('#modal-root tr[data-item-id]').forEach(row => {
            data[row.dataset.itemId] = {
              returned: parseInt(row.querySelector('.qty-returned').value) || 0,
              repair:   parseInt(row.querySelector('.qty-repair').value)   || 0,
            };
          });
          localStorage.setItem(SAVE_KEY, JSON.stringify(data));
          const lbl = document.getElementById('autosave-label');
          if (lbl) lbl.textContent = 'บันทึกอัตโนมัติแล้ว ✓';
        }

        function updateMissing(row) {
          const approved = parseInt(row.dataset.approved) || 0;
          const returned = parseInt(row.querySelector('.qty-returned').value) || 0;
          const repair   = parseInt(row.querySelector('.qty-repair').value)   || 0;
          const missing  = Math.max(0, approved - returned - repair);
          row.querySelector('.qty-missing').textContent = missing;
          row.querySelector('.qty-missing').style.color = missing > 0 ? 'var(--danger)' : '';
        }

        document.querySelectorAll('#modal-root tr[data-item-id]').forEach(row => {
          updateMissing(row);
          row.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('input', () => {
              const approved = parseInt(row.dataset.approved) || 0;
              const returned = parseInt(row.querySelector('.qty-returned').value) || 0;
              const repair   = parseInt(row.querySelector('.qty-repair').value)   || 0;
              if (returned + repair > approved) {
                if (inp.classList.contains('qty-repair')) {
                  inp.value = Math.max(0, approved - returned);
                } else {
                  inp.value = Math.max(0, approved - repair);
                }
              }
              updateMissing(row);
              clearTimeout(saveTimer);
              saveTimer = setTimeout(saveProgress, 600);
            });
          });
        });

        document.getElementById('do-confirm-cancel').addEventListener('click', () => {
          close();
          btn.disabled = false; btn.textContent = 'ยืนยันการคืน';
        });

        document.getElementById('do-confirm-submit').addEventListener('click', async () => {
          const submitBtn = document.getElementById('do-confirm-submit');
          submitBtn.disabled = true; submitBtn.textContent = 'กำลังบันทึก...';

          const items = [];
          document.querySelectorAll('#modal-root tr[data-item-id]').forEach(row => {
            items.push({
              item_id:            parseInt(row.dataset.itemId),
              quantity_returned:  parseInt(row.querySelector('.qty-returned').value) || 0,
              quantity_to_repair: parseInt(row.querySelector('.qty-repair').value)   || 0,
            });
          });

          try {
            await confirmReturn(returnId, { items });
            localStorage.removeItem(SAVE_KEY);
            close();
            showToast('ยืนยันการคืนสำเร็จ');
            await renderPage(statusFilter);
            refreshNavStatus();
          } catch (err) {
            document.getElementById('confirm-error').innerHTML =
              `<div class="alert alert-error">${h(err.message)}</div>`;
            submitBtn.disabled = false; submitBtn.textContent = 'ยืนยัน';
          }
        });
      });
    });

    document.querySelectorAll('.do-reject').forEach(btn => {
      btn.addEventListener('click', async () => {
        const noteInput = document.querySelector(`.reject-note-input[data-id="${btn.dataset.id}"]`);
        const note = noteInput?.value?.trim();
        if (!note) { showToast('กรุณาระบุเหตุผลการปฏิเสธ', 'error'); return; }
        if (!await showConfirm('ปฏิเสธการคืนนี้?', { subtext: note, danger: true, confirmText: 'ปฏิเสธ' })) return;
        btn.disabled = true;
        try {
          await rejectReturn(btn.dataset.id, { admin_note: note });
          showToast('ปฏิเสธการคืนแล้ว');
          await renderPage(statusFilter);
          refreshNavStatus();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  }

  await renderPage();
}

init();
