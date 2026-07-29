import { createRequest, addRequestItem, getProjects } from './api.js';
import { h, openModal, showToast, formatDate } from './ui.js';
import { renderSelect, initSelect } from './select.js';
import { renderPicker, initPicker } from './datepicker.js';

/**
 * Opens a create borrow request modal.
 * @param {object} [opts]
 * @param {string} [opts.projectId]  Pre-select and lock a specific project
 * @param {object} [opts.project]    Pre-fetched project object (avoids re-fetch)
 * @param {string} [opts.itemId]     Auto-add this item to the request after creation
 */
export async function openRequestModal({ projectId = '', project: preProject = null, itemId = '' } = {}) {
  const { projects } = await getProjects();

  const lockedProject = projectId
    ? (projects.find(p => p.id === projectId) ?? preProject)
    : null;

  const selectableProjects = projects.filter(p => p.status !== 'archived' && p.status !== 'ended');

  function getDateRange(pid) {
    const p = projects.find(p => p.id === pid);
    return { min: p?.start_date ?? '', max: p?.end_date ?? '' };
  }

  function buildPickerRow(pid) {
    const { min, max } = getDateRange(pid);
    return `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">วันที่รับ <span class="form-required">*</span></label>
          ${renderPicker({ id: 'rm-pickup', name: 'requested_pickup_datetime', withTime: true, restricted: true, min, max })}
        </div>
        <div class="form-group">
          <label class="form-label">วันที่คืน <span class="form-required">*</span></label>
          ${renderPicker({ id: 'rm-return', name: 'requested_return_datetime', withTime: true, restricted: true, min, max })}
        </div>
      </div>`;
  }

  const initPid    = lockedProject?.id ?? '';
  const projectField = lockedProject
    ? `<div class="form-group">
         <label class="form-label">โครงการ</label>
         <div class="form-input" style="background:var(--bg);color:var(--text-muted);cursor:default">
           ${h(lockedProject.name)} (${formatDate(lockedProject.start_date)} – ${formatDate(lockedProject.end_date)})
         </div>
         <input type="hidden" name="project_id" value="${h(lockedProject.id)}">
       </div>`
    : `<div class="form-group">
         <label class="form-label">โครงการ <span class="form-required">*</span></label>
         ${renderSelect({
           id: 'rm-project', name: 'project_id', value: '', variant: 'form',
           options: [['', '-- เลือกโครงการ --'], ...selectableProjects.map(p =>
             [p.id, `${p.name} (${formatDate(p.start_date)} – ${formatDate(p.end_date)})`])],
         })}
       </div>`;

  const close = openModal('สร้างคำขอยืมอุปกรณ์', `
    <div id="rm-error"></div>
    <form id="rm-form" class="form">
      <div class="form-group">
        <label class="form-label">ชื่อคำขอ <span class="form-required">*</span></label>
        <input class="form-input" name="name" required placeholder="เช่น ยืมอุปกรณ์สำหรับกิจกรรม..." autocomplete="off">
      </div>
      ${projectField}
      <div id="rm-picker-row">${buildPickerRow(initPid)}</div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" id="rm-submit">สร้างคำขอ</button>
        <button type="button" class="btn btn-secondary" id="rm-cancel">ยกเลิก</button>
      </div>
    </form>`, { wide: true });

  initPicker('rm-pickup');
  initPicker('rm-return');
  document.getElementById('rm-cancel').addEventListener('click', close);

  if (!lockedProject) {
    initSelect('rm-project', pid => {
      document.getElementById('rm-picker-row').innerHTML = buildPickerRow(pid);
      initPicker('rm-pickup');
      initPicker('rm-return');
    });
  }

  document.getElementById('rm-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd    = new FormData(e.target);
    const btn   = document.getElementById('rm-submit');
    const errEl = document.getElementById('rm-error');
    errEl.innerHTML = '';

    const pid    = fd.get('project_id');
    const pickup = fd.get('requested_pickup_datetime');
    const ret    = fd.get('requested_return_datetime');

    if (!pid) {
      errEl.innerHTML = `<div class="alert alert-error">กรุณาเลือกโครงการ</div>`;
      return;
    }
    if (!pickup || !ret) {
      errEl.innerHTML = `<div class="alert alert-error">กรุณาเลือกวันที่รับและวันที่คืน</div>`;
      return;
    }

    btn.disabled = true; btn.textContent = 'กำลังสร้าง...';
    try {
      const { request } = await createRequest({
        name:                        fd.get('name'),
        project_id:                  pid,
        requested_pickup_datetime:   pickup,
        requested_return_datetime:   ret,
      });
      if (itemId) {
        try { await addRequestItem(request.id, { item_id: itemId, quantity_requested: 1 }); } catch {}
      }
      showToast('สร้างคำขอสำเร็จ');
      close();
      window.location.href = `/request-detail/?id=${request.id}`;
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'สร้างคำขอ';
    }
  });
}
