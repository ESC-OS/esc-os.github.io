import { requireAuth } from '../auth.js';
import { getVisits, cancelVisit, getProjects, createVisit } from '../api.js';
import { h, showToast, showConfirm, openModal } from '../ui.js';

const VISIT_SLOTS = ['12:30', '16:30'];

const STATUS_LABELS = { pending: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', cancelled: 'ยกเลิกแล้ว', archived: 'ที่ผ่านมา' };
const STATUS_BADGE  = { pending: 'badge-processing', confirmed: 'badge-ready_for_pickup', cancelled: 'badge-cancelled', archived: 'badge-draft' };

function visitBadge(status) {
  return `<span class="badge ${STATUS_BADGE[status] ?? 'badge-draft'}">${STATUS_LABELS[status] ?? status}</span>`;
}

function isWeekday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay() >= 1 && d.getDay() <= 5;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatVisitDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function visitCard(v, userId, canCancel = false) {
  return `
    <div class="card" style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-start">
      <div style="flex:1;min-width:200px">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem;flex-wrap:wrap">
          ${visitBadge(v.status)}
          <span style="font-weight:600">${formatVisitDate(v.visit_date)}</span>
          <span class="badge badge-draft">${h(v.visit_slot)} น.</span>
        </div>
        <div class="info-row"><span class="info-label">โครงการ:</span>${h(v.project_name ?? '-')}</div>
        <div class="info-row"><span class="info-label">วัตถุประสงค์:</span>${h(v.purpose)}</div>
        ${v.cancel_reason ? `<div class="info-row"><span class="info-label">เหตุผล:</span>${h(v.cancel_reason)}</div>` : ''}
        ${v.handler_name  ? `<div class="info-row"><span class="info-label">ผู้รับผิดชอบ:</span>${h(v.handler_name)}</div>` : ''}
      </div>
      ${canCancel && v.status === 'pending' && v.booked_by === userId
        ? `<button class="btn btn-danger btn-sm do-cancel" data-id="${h(v.id)}">ยกเลิก</button>` : ''}
    </div>`;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  let archiveLoaded = false;
  let archiveOpen   = false;

  function openBookingModal(renderPage) {
    let projects = [];
    getProjects().then(r => { projects = r.projects.filter(p => p.status === 'active'); }).catch(() => {});

    getProjects().then(({ projects: all }) => {
      const myProjects = all.filter(p => p.status === 'active');
      if (myProjects.length === 0) { showToast('คุณไม่มีโครงการที่กำลังดำเนินการ', 'error'); return; }

      const close = openModal('นัดชมคลังอุปกรณ์', `
        <div id="visit-error"></div>
        <div class="form">
          <div class="form-group">
            <label class="form-label">โครงการ <span class="form-required">*</span></label>
            <select class="form-input" id="visit-project">
              <option value="">— เลือกโครงการ —</option>
              ${myProjects.map(p => `<option value="${h(p.id)}">${h(p.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">วันที่นัด <span class="form-required">*</span></label>
              <input type="date" class="form-input" id="visit-date" min="${todayStr()}">
              <div style="font-size:.75rem;color:var(--text-muted);margin-top:.25rem">เฉพาะวันจันทร์ – ศุกร์</div>
            </div>
            <div class="form-group">
              <label class="form-label">ช่วงเวลา <span class="form-required">*</span></label>
              <select class="form-input" id="visit-slot">
                <option value="">— เลือกเวลา —</option>
                ${VISIT_SLOTS.map(s => `<option value="${s}">${s} น.</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">วัตถุประสงค์ <span class="form-required">*</span></label>
            <input class="form-input" id="visit-purpose" placeholder="เช่น ดูรายการอุปกรณ์, รับอุปกรณ์" autocomplete="off">
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" id="visit-submit-btn">ส่งคำนัด</button>
            <button class="btn btn-secondary" id="visit-cancel-btn">ยกเลิก</button>
          </div>
        </div>`);

      document.getElementById('visit-cancel-btn').addEventListener('click', close);
      document.getElementById('visit-submit-btn').addEventListener('click', async () => {
        const projectId = document.getElementById('visit-project').value;
        const dateVal   = document.getElementById('visit-date').value;
        const slot      = document.getElementById('visit-slot').value;
        const purpose   = document.getElementById('visit-purpose').value.trim();
        const errBox    = document.getElementById('visit-error');
        const btn       = document.getElementById('visit-submit-btn');
        errBox.innerHTML = '';
        if (!projectId) { errBox.innerHTML = `<div class="alert alert-error">กรุณาเลือกโครงการ</div>`; return; }
        if (!dateVal)   { errBox.innerHTML = `<div class="alert alert-error">กรุณาเลือกวันที่</div>`; return; }
        if (!isWeekday(dateVal)) { errBox.innerHTML = `<div class="alert alert-error">กรุณาเลือกวันจันทร์ – ศุกร์เท่านั้น</div>`; return; }
        if (!slot)    { errBox.innerHTML = `<div class="alert alert-error">กรุณาเลือกช่วงเวลา</div>`; return; }
        if (!purpose) { errBox.innerHTML = `<div class="alert alert-error">กรุณาระบุวัตถุประสงค์</div>`; return; }
        btn.disabled = true; btn.textContent = 'กำลังส่ง...';
        try {
          await createVisit({ project_id: projectId, visit_date: dateVal, visit_slot: slot, purpose });
          close(); showToast('ส่งคำนัดชมสำเร็จ'); await renderPage();
        } catch (err) {
          errBox.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'ส่งคำนัด';
        }
      });
    }).catch(() => showToast('โหลดโครงการไม่ได้', 'error'));
  }

  async function renderPage() {
    archiveLoaded = false;

    const { visits } = await getVisits(); // backend returns pending + confirmed by default

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">นัดชมคลังอุปกรณ์</h1>
        <button class="btn btn-primary" id="btn-book">+ นัดชม</button>
      </div>
      ${visits.length === 0
        ? `<div class="dash-empty">
            <p>ไม่มีคำนัดชมที่กำลังจะมาถึง</p>
            <p style="font-size:.85rem;color:var(--text-muted)">กดปุ่ม "+ นัดชม" เพื่อนัดเข้าชมคลังอุปกรณ์</p>
          </div>`
        : `<div style="display:flex;flex-direction:column;gap:.75rem" id="active-list">
            ${visits.map(v => visitCard(v, user.id, true)).join('')}
          </div>`}

      <div style="margin-top:1.5rem">
        <button class="btn btn-secondary btn-sm" id="toggle-archive" style="width:100%;justify-content:center">
          ดูที่ผ่านมา ▾
        </button>
        <div id="archive-section" style="display:none;margin-top:.75rem">
          <div class="spinner" style="margin:.75rem auto">กำลังโหลด...</div>
        </div>
      </div>`;

    document.getElementById('btn-book').addEventListener('click', () => openBookingModal(renderPage));

    document.querySelectorAll('.do-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm('ยกเลิกคำนัดชมนี้?', { danger: true, confirmText: 'ยกเลิกนัด' })) return;
        btn.disabled = true;
        try { await cancelVisit(btn.dataset.id); showToast('ยกเลิกนัดแล้ว'); await renderPage(); }
        catch (err) { showToast(err.message, 'error'); btn.disabled = false; }
      });
    });

    document.getElementById('toggle-archive').addEventListener('click', async () => {
      const btn     = document.getElementById('toggle-archive');
      const section = document.getElementById('archive-section');
      archiveOpen = !archiveOpen;
      btn.textContent = archiveOpen ? 'ซ่อนที่ผ่านมา ▴' : 'ดูที่ผ่านมา ▾';
      section.style.display = archiveOpen ? 'block' : 'none';

      if (archiveOpen && !archiveLoaded) {
        archiveLoaded = true;
        try {
          const { visits: archived } = await getVisits('archived');
          section.innerHTML = archived.length === 0
            ? `<p class="empty-text">ไม่มีคำนัดที่ผ่านมา</p>`
            : `<div style="display:flex;flex-direction:column;gap:.75rem">${archived.map(v => visitCard(v, user.id, false)).join('')}</div>`;
        } catch {
          section.innerHTML = `<p class="empty-text">โหลดไม่ได้</p>`;
        }
      }
    });
  }

  await renderPage();
}

init();
