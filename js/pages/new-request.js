import { requireAuth } from '../auth.js';
import { getProjects, createRequest, addRequestItem } from '../api.js';
import { h, formatDate } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const params     = new URLSearchParams(window.location.search);
  const preItemId  = params.get('item_id');
  const preProject = params.get('project_id');

  const app = document.getElementById('app');
  const { projects } = await getProjects();

  if (projects.length === 0) {
    app.innerHTML = `
      <button class="back-btn" onclick="history.back()">← กลับ</button>
      <div class="card" style="max-width:520px;text-align:center;padding:2.5rem 2rem">
        <div style="margin-bottom:1rem;color:var(--border-strong)"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
        <h2 style="font-size:1.05rem;font-weight:700;margin-bottom:.5rem">ต้องสร้างโครงการก่อน</h2>
        <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:1.5rem;line-height:1.7">
          คำขอยืมอุปกรณ์ต้องผูกกับโครงการ<br>
          สร้างโครงการก่อนแล้วค่อยกลับมายืม
        </p>
        <a href="/project-form/" class="btn btn-primary">สร้างโครงการ</a>
      </div>`;
    return;
  }

  function renderForm(selectedProjectId = '') {
    const sel = projects.find(p => p.id === selectedProjectId);
    const locked = Boolean(preProject && selectedProjectId === preProject);

    const projectField = locked
      ? `<div class="form-group">
           <label class="form-label">โครงการ</label>
           <div class="form-input" style="background:var(--bg);color:var(--text-muted);cursor:default">
             ${h(sel?.name ?? '')} (${formatDate(sel?.start_date)} – ${formatDate(sel?.end_date)})
           </div>
           <input type="hidden" name="project_id" value="${h(selectedProjectId)}">
         </div>`
      : `<div class="form-group">
           <label class="form-label">โครงการ <span class="form-required">*</span></label>
           <select class="form-select" name="project_id" id="project-select" required>
             <option value="">-- เลือกโครงการ --</option>
             ${projects.map(p => `
               <option value="${h(p.id)}"
                 data-start="${h(p.start_date)}" data-end="${h(p.end_date)}"
                 ${p.id === selectedProjectId ? 'selected' : ''}>
                 ${h(p.name)} (${formatDate(p.start_date)} – ${formatDate(p.end_date)})
               </option>`).join('')}
           </select>
           ${sel ? `<span class="form-hint">ช่วงโครงการ: ${formatDate(sel.start_date)} → ${formatDate(sel.end_date)}</span>` : ''}
         </div>`;

    return `
      <div class="form-group">
        <label class="form-label">ชื่อคำขอ <span class="form-required">*</span></label>
        <input class="form-input" name="name" required placeholder="เช่น ยืมอุปกรณ์สำหรับกิจกรรม..." autocomplete="off">
      </div>
      ${projectField}
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">วันที่รับ <span class="form-required">*</span></label>
          <input class="form-input" type="datetime-local" name="requested_pickup_datetime" id="pickup-input" required
            ${sel ? `min="${sel.start_date}T00:00" max="${sel.end_date}T23:59"` : ''}>
        </div>
        <div class="form-group">
          <label class="form-label">วันที่คืน <span class="form-required">*</span></label>
          <input class="form-input" type="datetime-local" name="requested_return_datetime" id="return-input" required
            ${sel ? `min="${sel.start_date}T00:00" max="${sel.end_date}T23:59"` : ''}>
        </div>
      </div>`;
  }

  app.innerHTML = `
    <button class="back-btn" onclick="history.back()">← กลับ</button>
    <h1 class="page-title">สร้างคำขอยืมอุปกรณ์</h1>
    <div class="card" style="max-width:600px">
      <div id="form-error"></div>
      <form id="req-form" class="form">
        <div id="form-body">${renderForm(preProject || '')}</div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="submit-btn">สร้างคำขอ</button>
          <button type="button" class="btn btn-secondary" onclick="history.back()">ยกเลิก</button>
        </div>
      </form>
    </div>`;

  function onProjectChange(e) {
    const selectedId = e.target.value;
    const body = document.getElementById('form-body');
    body.innerHTML = renderForm(selectedId);
    document.getElementById('project-select')?.addEventListener('change', onProjectChange);
  }
  document.getElementById('project-select')?.addEventListener('change', onProjectChange);

  document.getElementById('req-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd    = new FormData(e.target);
    const btn   = document.getElementById('submit-btn');
    const errEl = document.getElementById('form-error');
    errEl.innerHTML = '';

    const projectId = fd.get('project_id');
    const pickup    = fd.get('requested_pickup_datetime');
    const ret       = fd.get('requested_return_datetime');
    const sel       = projects.find(p => p.id === projectId);

    if (sel) {
      const start   = new Date(sel.start_date + 'T00:00');
      const end     = new Date(sel.end_date + 'T23:59');
      const pickupD = new Date(pickup);
      const retD    = new Date(ret);
      if (pickupD < start || pickupD > end) {
        errEl.innerHTML = `<div class="alert alert-error">วันที่รับต้องอยู่ภายในช่วงโครงการ (${formatDate(sel.start_date)} – ${formatDate(sel.end_date)})</div>`;
        return;
      }
      if (retD < start || retD > end) {
        errEl.innerHTML = `<div class="alert alert-error">วันที่คืนต้องอยู่ภายในช่วงโครงการ (${formatDate(sel.start_date)} – ${formatDate(sel.end_date)})</div>`;
        return;
      }
      if (retD <= pickupD) {
        errEl.innerHTML = `<div class="alert alert-error">วันที่คืนต้องหลังจากวันที่รับ</div>`;
        return;
      }
    }

    btn.disabled = true; btn.textContent = 'กำลังสร้าง...';
    try {
      const { request } = await createRequest({ name: fd.get('name'), project_id: projectId, requested_pickup_datetime: pickup, requested_return_datetime: ret });
      if (preItemId) {
        try { await addRequestItem(request.id, { item_id: preItemId, quantity_requested: 1 }); } catch {}
      }
      window.location.href = `/request-detail/?id=${request.id}`;
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'สร้างคำขอ';
    }
  });
}
init();
