import { requireAuth } from '../auth.js';
import { getProject, createProject, updateProject, getNotifications } from '../api.js';
import { h, renderNavbar } from '../ui.js';
import { initDatePickers } from '../datepicker.js';

const ORG_TYPES = [
  'ESC: พัฒนาองค์กร', 'ESC: การเงิน', 'ESC: เลขานุการ', 'ESC: เทคโนโลยี',
  'ESC: ประชาสัมพันธ์และการตลาด', 'ESC: วิชาการ', 'ESC: กิจการภายใน',
  'ESC: กิจการภายนอก', 'ESC: นิสิตสัมพันธ์', 'ESC: CSR', 'ESC: Sustain',
  'ESC: OS', 'ชมรม', 'โครงการ', 'ภาค', 'Group',
];

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const isEdit = Boolean(id);
  let existing = null;

  if (isEdit) {
    try {
      const res = await getProject(id);
      existing = res.data;
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    // Access check: must be leader or admin
    const isAdmin = user.role === 'admin';
    const isLeader = existing.leader_id === user.id;
    if (!isAdmin && !isLeader) {
      app.innerHTML = '<div class="alert alert-error">คุณไม่มีสิทธิ์แก้ไขโครงการนี้</div>';
      return;
    }
  }

  // Get current org_type value
  const currentOrgType = existing?.org_type || existing?.organization_type || '';

  // Date helper: slice to YYYY-MM-DD for date inputs
  const dateVal = (field) =>
    existing && existing[field] ? String(existing[field]).slice(0, 10) : '';

  const cancelHref = isEdit ? `project-detail.html?id=${h(id)}` : 'projects.html';

  app.innerHTML = `
    <a href="${cancelHref}" class="back-btn">← กลับ</a>
    <div class="page-header">
      <h1 class="page-title">${isEdit ? 'แก้ไขโครงการ' : 'สร้างโครงการ'}</h1>
    </div>
    <div class="card" style="max-width:640px">
      <div id="form-error"></div>
      <form id="project-form" class="form">

        <div class="form-group">
          <label class="form-label" for="f-name">
            ชื่อโครงการ <span class="form-required">*</span>
          </label>
          <input
            id="f-name"
            class="form-input"
            name="name"
            type="text"
            required
            autocomplete="off"
            value="${h(existing?.name ?? '')}"
            placeholder="ชื่อโครงการ">
        </div>

        <div class="form-group">
          <label class="form-label" for="f-org-type">
            ประเภทโครงการ <span class="form-required">*</span>
          </label>
          <select id="f-org-type" class="form-select" name="org_type" required>
            <option value="">-- เลือกประเภทโครงการ --</option>
            ${ORG_TYPES.map(t =>
              `<option value="${h(t)}"${currentOrgType === t ? ' selected' : ''}>${h(t)}</option>`
            ).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="f-desc">คำอธิบาย</label>
          <textarea
            id="f-desc"
            class="form-textarea"
            name="description"
            rows="4"
            placeholder="รายละเอียดโครงการ (ไม่บังคับ)">${h(existing?.description ?? '')}</textarea>
          <div class="form-hint">ไม่บังคับ</div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="f-start">
              วันเริ่มต้น <span class="form-required">*</span>
            </label>
            <input
              id="f-start"
              class="form-input"
              type="date"
              name="start_date"
              required
              value="${dateVal('start_date')}">
          </div>
          <div class="form-group">
            <label class="form-label" for="f-end">
              วันสิ้นสุด <span class="form-required">*</span>
            </label>
            <input
              id="f-end"
              class="form-input"
              type="date"
              name="end_date"
              required
              value="${dateVal('end_date')}">
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="submit-btn">
            ${isEdit ? 'บันทึกการแก้ไข' : 'สร้างโครงการ'}
          </button>
          <a href="${cancelHref}" class="btn btn-secondary">ยกเลิก</a>
        </div>

      </form>
    </div>`;

  initDatePickers(document.getElementById('app'));

  document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = document.getElementById('submit-btn');
    const errEl = document.getElementById('form-error');
    errEl.innerHTML = '';

    const startDate = fd.get('start_date');
    const endDate   = fd.get('end_date');

    if (endDate && startDate && endDate <= startDate) {
      errEl.innerHTML = '<div class="alert alert-error">วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น</div>';
      return;
    }

    const orgType = fd.get('org_type');
    if (!orgType) {
      errEl.innerHTML = '<div class="alert alert-error">กรุณาเลือกประเภทโครงการ</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';

    const data = {
      name:              fd.get('name'),
      organization_type: orgType,
      description: fd.get('description') || undefined,
      start_date:  startDate,
      end_date:    endDate,
    };

    try {
      if (isEdit) {
        await updateProject(id, data);
        window.location.href = `project-detail.html?id=${id}`;
      } else {
        const res = await createProject(data);
        const newId = res.data?.id ?? res.id;
        window.location.href = `project-detail.html?id=${newId}`;
      }
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = isEdit ? 'บันทึกการแก้ไข' : 'สร้างโครงการ';
    }
  });
}

init();
