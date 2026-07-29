import { createProject, updateProject } from './api.js';
import { h, openModal, showToast } from './ui.js';
import { renderPicker, initPicker } from './datepicker.js';
import { renderSelect, initSelect } from './select.js';

/**
 * Opens a create-or-edit project modal.
 * @param {object|null} existing  Pass null to create, or a project object to edit.
 * @param {function}    onSuccess Called with the project (create) or undefined (edit) on save.
 */
const UNIT_TYPES = ['กวศ', 'ส่วนกรุ๊ป', 'ชมรม', 'ภาควิชา', 'กิจกรรมทั่วไป', 'อื่นๆ'];

export function openProjectModal(existing = null, onSuccess) {
  const isEdit      = Boolean(existing);
  const val         = (f, fb = '') => existing ? String(existing[f] ?? fb) : fb;
  const currentUnit = existing?.unit_type ?? '';

  const today = new Date().toLocaleDateString('en-CA');

  const unitSelectHtml = renderSelect({
    id: 'pm-unit-type',
    variant: 'form',
    value: currentUnit,
    options: [
      ...(!isEdit || !currentUnit ? [['', '— เลือกประเภทหน่วยงาน —']] : []),
      ...UNIT_TYPES.map(u => [u, u]),
    ],
  });

  const close = openModal(
    isEdit ? 'แก้ไขโครงการ' : 'สร้างโครงการใหม่',
    `<div id="proj-modal-error"></div>
     <form id="proj-modal-form" class="form">
       <div class="form-group">
         <label class="form-label">ชื่อโครงการ <span class="form-required">*</span></label>
         <input class="form-input" name="name" required value="${h(val('name'))}" placeholder="เช่น ค่ายอาสา 2026">
       </div>
       <div class="form-group">
         <label class="form-label">ประเภทหน่วยงาน <span class="form-required">*</span></label>
         ${unitSelectHtml}
       </div>
       <div class="form-group">
         <label class="form-label">คำอธิบาย</label>
         <textarea class="form-textarea" name="description" style="min-height:72px">${h(val('description'))}</textarea>
       </div>
       <div class="form-row">
         <div class="form-group">
           <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
             <label class="form-label" style="margin:0">วันที่เริ่มต้น <span class="form-required">*</span></label>
             <button type="button" class="btn btn-sm btn-secondary" id="pm-today-start">วันนี้</button>
           </div>
           ${renderPicker({ id: 'pm-start', name: 'start_date', value: val('start_date', '').slice(0, 10) })}
         </div>
         <div class="form-group">
           <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
             <label class="form-label" style="margin:0">วันที่สิ้นสุด <span class="form-required">*</span></label>
             <button type="button" class="btn btn-sm btn-secondary" id="pm-today-end">วันนี้</button>
           </div>
           ${renderPicker({ id: 'pm-end', name: 'end_date', value: val('end_date', '').slice(0, 10) })}
         </div>
       </div>
       <div class="form-actions">
         <button type="submit" class="btn btn-primary" id="pm-submit">
           ${isEdit ? 'บันทึกการแก้ไข' : 'สร้างโครงการ'}
         </button>
         <button type="button" class="btn btn-secondary" id="pm-cancel">ยกเลิก</button>
       </div>
     </form>`,
    { wide: true },
  );

  const startPicker = initPicker('pm-start');
  const endPicker   = initPicker('pm-end');
  const unitSelect  = initSelect('pm-unit-type');

  document.getElementById('pm-today-start').addEventListener('click', () => startPicker.setValue(today));
  document.getElementById('pm-today-end').addEventListener('click',   () => endPicker.setValue(today));
  document.getElementById('pm-cancel').addEventListener('click', close);

  document.getElementById('proj-modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd    = new FormData(e.target);
    const btn   = document.getElementById('pm-submit');
    const errEl = document.getElementById('proj-modal-error');
    errEl.innerHTML = '';

    const startDate = fd.get('start_date');
    const endDate   = fd.get('end_date');
    const unitType  = unitSelect?.getValue() ?? '';

    if (!startDate || !endDate) {
      errEl.innerHTML = `<div class="alert alert-error">กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด</div>`;
      return;
    }
    if (!isEdit && !unitType) {
      errEl.innerHTML = `<div class="alert alert-error">กรุณาเลือกประเภทหน่วยงาน</div>`;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    const data = {
      name:        fd.get('name'),
      description: fd.get('description') || undefined,
      start_date:  startDate,
      end_date:    endDate,
      ...(unitType ? { unit_type: unitType } : {}),
    };

    try {
      if (isEdit) {
        await updateProject(existing.id, data);
        showToast('บันทึกการแก้ไขสำเร็จ');
        close();
        onSuccess?.();
      } else {
        const { project } = await createProject(data);
        showToast('สร้างโครงการสำเร็จ');
        close();
        onSuccess?.(project);
      }
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = isEdit ? 'บันทึกการแก้ไข' : 'สร้างโครงการ';
    }
  });
}
