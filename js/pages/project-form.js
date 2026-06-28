import { requireAuth } from '../auth.js';
import { getProject, createProject, updateProject } from '../api.js';
import { h } from '../ui.js';
import { renderPicker, initPicker } from '../datepicker.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  const id = new URLSearchParams(window.location.search).get('id');
  const isEdit = Boolean(id);
  let existing = null;

  if (isEdit) {
    const { project } = await getProject(id);
    existing = project;
  }

  const val = (field, fallback = '') => existing ? h(existing[field] || fallback) : fallback;

  const UNIT_TYPES = ['กวศ', 'ส่วนกรุ๊ป', 'ชมรม', 'ภาควิชา', 'กิจกรรมทั่วไป', 'อื่นๆ'];
  const currentUnit = existing?.unit_type ?? '';

  function unitTypeSelect() {
    const showPlaceholder = !isEdit || !currentUnit;
    return `<select class="form-input" name="unit_type">
      ${showPlaceholder ? `<option value="">— เลือกประเภทหน่วยงาน —</option>` : ''}
      ${UNIT_TYPES.map(u => `<option value="${h(u)}" ${currentUnit === u ? 'selected' : ''}>${h(u)}</option>`).join('')}
    </select>`;
  }

  app.innerHTML = `
    <button class="back-btn" onclick="history.back()">← กลับ</button>
    <h1 class="page-title">${isEdit ? 'แก้ไขโครงการ' : 'สร้างโครงการใหม่'}</h1>
    <div class="card" style="max-width:600px">
      <div id="form-error"></div>
      <form id="project-form" class="form">
        <div class="form-group">
          <label class="form-label">ชื่อโครงการ <span class="form-required">*</span></label>
          <input class="form-input" name="name" required value="${val('name')}">
        </div>
        <div class="form-group">
          <label class="form-label">ประเภทหน่วยงาน <span class="form-required">*</span></label>
          ${unitTypeSelect()}
        </div>
        <div class="form-group">
          <label class="form-label">คำอธิบาย</label>
          <textarea class="form-textarea" name="description">${val('description')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
              <label class="form-label" style="margin:0">วันที่เริ่มต้น <span class="form-required">*</span></label>
              <button type="button" class="btn btn-sm btn-secondary" id="today-start">วันนี้</button>
            </div>
            ${renderPicker({ id: 'start_date', name: 'start_date', value: val('start_date', '').slice(0, 10) })}
          </div>
          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
              <label class="form-label" style="margin:0">วันที่สิ้นสุด <span class="form-required">*</span></label>
              <button type="button" class="btn btn-sm btn-secondary" id="today-end">วันนี้</button>
            </div>
            ${renderPicker({ id: 'end_date', name: 'end_date', value: val('end_date', '').slice(0, 10) })}
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="submit-btn">
            ${isEdit ? 'บันทึกการแก้ไข' : 'สร้างโครงการ'}
          </button>
          <button type="button" class="btn btn-secondary" onclick="history.back()">ยกเลิก</button>
        </div>
      </form>
    </div>`;

  const today       = new Date().toLocaleDateString('en-CA');
  const startPicker = initPicker('start_date');
  const endPicker   = initPicker('end_date');

  document.getElementById('today-start').addEventListener('click', () => startPicker.setValue(today));
  document.getElementById('today-end').addEventListener('click',   () => endPicker.setValue(today));

  document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd    = new FormData(e.target);
    const btn   = document.getElementById('submit-btn');
    const errEl = document.getElementById('form-error');
    errEl.innerHTML = '';
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    const startDate = fd.get('start_date');
    const endDate   = fd.get('end_date');
    const unitType  = fd.get('unit_type');

    if (!startDate || !endDate) {
      errEl.innerHTML = `<div class="alert alert-error">กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด</div>`;
      btn.disabled = false; btn.textContent = isEdit ? 'บันทึกการแก้ไข' : 'สร้างโครงการ';
      return;
    }
    if (!isEdit && !unitType) {
      errEl.innerHTML = `<div class="alert alert-error">กรุณาเลือกประเภทหน่วยงาน</div>`;
      btn.disabled = false; btn.textContent = 'สร้างโครงการ';
      return;
    }

    const data = {
      name:        fd.get('name'),
      description: fd.get('description') || undefined,
      start_date:  startDate,
      end_date:    endDate,
      ...(unitType ? { unit_type: unitType } : {}),
    };

    try {
      if (isEdit) {
        await updateProject(id, data);
        window.location.href = `/project-detail/?id=${id}`;
      } else {
        const { project } = await createProject(data);
        window.location.href = `/project-detail/?id=${project.id}`;
      }
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = isEdit ? 'บันทึกการแก้ไข' : 'สร้างโครงการ';
    }
  });
}

init();
