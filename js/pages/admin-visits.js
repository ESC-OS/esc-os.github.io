import { requireAuth } from '../auth.js';
import { getVisits, confirmVisit, cancelVisit, assignVisit, searchUsers } from '../api.js';
import { h, showToast, showConfirm, openModal } from '../ui.js';
import { renderSelect, initSelect } from '../select.js';

const STATUS_LABELS = { pending: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', cancelled: 'ยกเลิกแล้ว', archived: 'ที่ผ่านมา' };
const STATUS_BADGE  = { pending: 'badge-processing', confirmed: 'badge-ready_for_pickup', cancelled: 'badge-cancelled', archived: 'badge-draft' };

function visitBadge(status) {
  return `<span class="badge ${STATUS_BADGE[status] ?? 'badge-draft'}">${STATUS_LABELS[status] ?? status}</span>`;
}

function formatVisitDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function openAssignModal(visitId, onSuccess) {
  let selectedUser = null;
  let searchTimeout = null;

  const close = openModal('มอบหมายผู้รับผิดชอบ', `
    <div id="assign-error"></div>
    <div class="search-container" style="position:relative;margin-bottom:.75rem">
      <input class="form-input" id="assign-search" placeholder="ค้นหาชื่อเจ้าหน้าที่..." autocomplete="off">
      <div id="assign-dropdown" class="search-dropdown" style="display:none;position:absolute;width:100%;z-index:10;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);box-shadow:0 4px 12px rgba(0,0,0,.1);max-height:220px;overflow-y:auto"></div>
    </div>
    <div id="assign-selected" style="display:none;padding:.6rem .75rem;border-radius:var(--radius-sm);background:var(--bg);border:1px solid var(--border);margin-bottom:.75rem;font-size:.88rem"></div>
    <div class="form-actions">
      <button class="btn btn-primary" id="assign-confirm-btn" disabled>มอบหมาย</button>
      <button class="btn btn-secondary" id="assign-cancel-btn">ยกเลิก</button>
    </div>`);

  const searchEl   = document.getElementById('assign-search');
  const dropdown   = document.getElementById('assign-dropdown');
  const selectedEl = document.getElementById('assign-selected');
  const confirmBtn = document.getElementById('assign-confirm-btn');
  const errBox     = document.getElementById('assign-error');

  document.getElementById('assign-cancel-btn').addEventListener('click', close);

  function selectUser(u) {
    selectedUser = u;
    searchEl.value = u.name;
    dropdown.style.display = 'none';
    selectedEl.style.display = 'block';
    selectedEl.innerHTML = u.avatar_url
      ? `<img src="${h(u.avatar_url)}" class="member-avatar" style="width:28px;height:28px"> ${h(u.name)}`
      : `<span class="member-avatar-ph" style="width:28px;height:28px;font-size:.75rem">${h(u.name.charAt(0))}</span> ${h(u.name)}`;
    confirmBtn.disabled = false;
  }

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim();
    selectedUser = null;
    confirmBtn.disabled = true;
    selectedEl.style.display = 'none';
    clearTimeout(searchTimeout);
    if (!q) { dropdown.style.display = 'none'; return; }
    searchTimeout = setTimeout(async () => {
      try {
        const { users } = await searchUsers(q, 'staff');
        const { users: admins } = await searchUsers(q, 'admin');
        const all = [...users, ...admins].filter((u, i, a) => a.findIndex(x => x.id === u.id) === i);
        if (!all.length) { dropdown.innerHTML = `<div style="padding:.5rem .75rem;color:var(--text-muted);font-size:.85rem">ไม่พบผู้ใช้</div>`; dropdown.style.display = 'block'; return; }
        dropdown.innerHTML = all.map(u => `
          <div class="search-result-item" data-id="${h(u.id)}" style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem;cursor:pointer">
            ${u.avatar_url ? `<img src="${h(u.avatar_url)}" class="member-avatar" style="width:28px;height:28px">` : `<span class="member-avatar-ph" style="width:28px;height:28px;font-size:.75rem">${h(u.name.charAt(0))}</span>`}
            <div>
              <div style="font-weight:600;font-size:.88rem">${h(u.name)}</div>
              <div style="font-size:.75rem;color:var(--text-muted)">${h(u.email ?? '')}</div>
            </div>
          </div>`).join('');
        dropdown.style.display = 'block';
        dropdown.querySelectorAll('.search-result-item').forEach(item => {
          item.addEventListener('click', () => selectUser(all.find(u => u.id === item.dataset.id)));
        });
      } catch { dropdown.style.display = 'none'; }
    }, 300);
  });

  confirmBtn.addEventListener('click', async () => {
    if (!selectedUser) return;
    confirmBtn.disabled = true; confirmBtn.textContent = 'กำลังบันทึก...';
    try {
      await assignVisit(visitId, selectedUser.id);
      close(); showToast('มอบหมายผู้รับผิดชอบสำเร็จ');
      onSuccess();
    } catch (err) {
      errBox.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      confirmBtn.disabled = false; confirmBtn.textContent = 'มอบหมาย';
    }
  });
}

async function init() {
  const user = await requireAuth(['staff', 'admin']);
  if (!user) return;

  const app = document.getElementById('app');

  async function renderPage(statusFilter = null) {
    const { visits } = await getVisits(statusFilter);

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">นัดชมคลัง — จัดการ</h1>
        ${renderSelect({ id: 'status-filter', value: statusFilter ?? '', options: [
          ['',          'กำลังจะมาถึง'],
          ['pending',   'รอยืนยัน'],
          ['confirmed', 'ยืนยันแล้ว'],
          ['cancelled', 'ยกเลิกแล้ว'],
          ['archived',  'ที่ผ่านมา'],
        ] })}
      </div>
      ${visits.length === 0
        ? '<p class="empty-text">ไม่มีคำนัดชม</p>'
        : `<div style="display:flex;flex-direction:column;gap:.75rem">
            ${visits.map(v => `
              <div class="card">
                <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-start">

                  <div style="flex:1;min-width:220px">
                    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.65rem;flex-wrap:wrap">
                      ${visitBadge(v.status)}
                      <span style="font-weight:600">${formatVisitDate(v.visit_date)}</span>
                      <span class="badge badge-draft">${h(v.visit_slot)} น.</span>
                    </div>
                    <div class="info-row"><span class="info-label">โครงการ:</span>${h(v.project_name ?? '-')}</div>
                    <div class="info-row"><span class="info-label">วัตถุประสงค์:</span>${h(v.purpose ?? '-')}</div>
                    ${v.cancel_reason ? `<div class="info-row"><span class="info-label">เหตุผลยกเลิก:</span>${h(v.cancel_reason)}</div>` : ''}
                  </div>

                  <div style="min-width:180px">
                    <div class="info-section-label">ผู้นัด</div>
                    <div style="font-weight:600">${h(v.booked_by_name ?? '-')}</div>
                    <div style="font-size:.82rem;color:var(--text-muted)">${h(v.booked_by_email ?? '')}</div>
                    ${v.booked_by_phone   ? `<div style="font-size:.82rem;color:var(--text-muted)">📞 ${h(v.booked_by_phone)}</div>` : ''}
                    ${v.booked_by_line_id ? `<div style="font-size:.82rem;color:var(--text-muted)">LINE: ${h(v.booked_by_line_id)}</div>` : ''}
                  </div>

                  <div style="min-width:180px">
                    <div class="info-section-label">ผู้รับผิดชอบ</div>
                    ${v.handler_name
                      ? `<div style="font-weight:600">${h(v.handler_name)}</div>
                         <div style="font-size:.82rem;color:var(--text-muted)">${h(v.handler_email ?? '')}</div>
                         ${v.handler_phone   ? `<div style="font-size:.82rem;color:var(--text-muted)">📞 ${h(v.handler_phone)}</div>` : ''}
                         ${v.handler_line_id ? `<div style="font-size:.82rem;color:var(--text-muted)">LINE: ${h(v.handler_line_id)}</div>` : ''}`
                      : `<div style="font-size:.85rem;color:var(--text-muted)">ยังไม่มีผู้รับผิดชอบ</div>`}
                  </div>

                  <div class="actions-bar" style="flex-direction:column;align-items:flex-start;gap:.4rem">
                    ${v.status === 'pending' ? `
                      <button class="btn btn-success btn-sm do-confirm" data-id="${h(v.id)}">ยืนยัน</button>
                      <button class="btn btn-danger btn-sm do-cancel" data-id="${h(v.id)}">ยกเลิก</button>` : ''}
                    ${v.status !== 'cancelled' && v.status !== 'archived' ? `
                      <button class="btn btn-secondary btn-sm do-assign" data-id="${h(v.id)}">${v.handler_name ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมาย'}</button>` : ''}
                  </div>

                </div>
              </div>`).join('')}
          </div>`}`;

    initSelect('status-filter', val => renderPage(val || null));

    document.querySelectorAll('.do-confirm').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm('ยืนยันคำนัดชมนี้?', { confirmText: 'ยืนยัน' })) return;
        btn.disabled = true;
        try { await confirmVisit(btn.dataset.id); showToast('ยืนยันนัดชมสำเร็จ'); await renderPage(statusFilter); }
        catch (err) { showToast(err.message, 'error'); btn.disabled = false; }
      });
    });

    document.querySelectorAll('.do-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        let note = '';
        const close = openModal('ยกเลิกคำนัดชม', `
          <div class="form">
            <div class="form-group">
              <label class="form-label">หมายเหตุ <span style="color:var(--text-muted);font-weight:400">(ไม่บังคับ)</span></label>
              <input class="form-input" id="cancel-note" placeholder="เช่น คลังปิดวันนั้น, ติดต่อผู้นัดแล้ว..." autocomplete="off">
            </div>
            <div id="cancel-err"></div>
            <div class="form-actions">
              <button class="btn btn-danger" id="cancel-confirm-btn">ยกเลิกนัด</button>
              <button class="btn btn-secondary" id="cancel-dismiss-btn">ปิด</button>
            </div>
          </div>`);

        document.getElementById('cancel-dismiss-btn').addEventListener('click', close);
        document.getElementById('cancel-confirm-btn').addEventListener('click', async () => {
          const noteVal = document.getElementById('cancel-note').value.trim();
          const confirmBtn = document.getElementById('cancel-confirm-btn');
          confirmBtn.disabled = true; confirmBtn.textContent = 'กำลังบันทึก...';
          try {
            await cancelVisit(btn.dataset.id, noteVal ? { admin_note: noteVal } : undefined);
            close(); showToast('ยกเลิกนัดชมแล้ว'); await renderPage(statusFilter);
          } catch (err) {
            document.getElementById('cancel-err').innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
            confirmBtn.disabled = false; confirmBtn.textContent = 'ยกเลิกนัด';
          }
        });
      });
    });

    document.querySelectorAll('.do-assign').forEach(btn => {
      btn.addEventListener('click', () => openAssignModal(btn.dataset.id, () => renderPage(statusFilter)));
    });
  }

  await renderPage();
}

init();
