import { requireAuth } from '../auth.js';
import { getProject, deleteProject, getRequests, addProjectMember, removeProjectMember } from '../api.js';
import { h, statusBadge, formatDate, openModal } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.href = '/projects/'; return; }

  async function renderPage() {
    const [{ project, members }, reqData] = await Promise.all([
      getProject(id),
      getRequests(),
    ]);

    const canEdit   = user.role === 'admin' || user.id === project.owner_id;
    const isLeader  = user.id === project.owner_id;
    const linked    = reqData.requests.filter(r => r.project_id === id);
    const now       = new Date();
    const isActive  = new Date(project.end_date) >= now;

    app.innerHTML = `
      <button class="back-btn" onclick="history.back()">← กลับ</button>
      <div class="page-header">
        <div>
          <h1 class="page-title">${h(project.name)}</h1>
          ${isActive
            ? '<span class="badge badge-in_lend" style="font-size:.75rem">ดำเนินการอยู่</span>'
            : '<span class="badge badge-completed" style="font-size:.75rem">สิ้นสุดแล้ว</span>'}
        </div>
        <div class="actions-bar">
          ${isActive ? `<a href="/new-request/?project_id=${h(id)}" class="btn btn-primary">+ สร้างคำขอยืม</a>` : ''}
          ${canEdit ? `
            <a href="/project-form/?id=${h(id)}" class="btn btn-secondary">แก้ไข</a>
            <button class="btn btn-danger" id="delete-btn">ลบ</button>` : ''}
        </div>
      </div>
      <div id="page-error"></div>
      <div class="project-detail-grid">
        <div>
          <div class="card">
            <div class="card-title">รายละเอียดโครงการ</div>
            ${project.group ? `<div class="info-row"><span class="info-label">กลุ่ม</span><span>${h(project.group)}</span></div>` : ''}
            ${project.in_charge_person ? `<div class="info-row"><span class="info-label">ผู้รับผิดชอบ</span><span>${h(project.in_charge_person)}</span></div>` : ''}
            ${project.description ? `<div class="info-row"><span class="info-label">คำอธิบาย</span><span>${h(project.description)}</span></div>` : ''}
            <div class="info-row"><span class="info-label">ผู้รับผิดชอบ</span><span>${h(project.owner_name)}</span></div>
            <div class="info-row"><span class="info-label">ช่วงเวลา</span>
              <span>${formatDate(project.start_date)} → ${formatDate(project.end_date)}</span>
            </div>
          </div>

          ${linked.length > 0 ? `
            <div class="card" style="margin-top:1.25rem">
              <div class="card-title">คำขอยืมที่เชื่อมโยง (${linked.length})</div>
              <div style="display:flex;flex-direction:column;gap:.5rem">
                ${linked.map(r => `
                  <a href="/request-detail/?id=${h(r.id)}" class="request-link-row">
                    <span class="mono">#${h(r.id.slice(0,8))}</span>
                    ${statusBadge(r.status)}
                    <span class="muted" style="margin-left:auto">${formatDate(r.requested_pickup_datetime)}</span>
                  </a>`).join('')}
              </div>
            </div>` : `
            <div class="card" style="margin-top:1.25rem">
              <div class="card-title">คำขอยืม</div>
              <div class="dash-empty" style="padding:1.5rem">
                <p style="font-size:.88rem;color:var(--text-muted)">ยังไม่มีคำขอยืมสำหรับโครงการนี้</p>
                ${isActive ? `<a href="/new-request/?project_id=${h(id)}" class="btn btn-primary btn-sm">สร้างคำขอยืม</a>` : ''}
              </div>
            </div>`}
        </div>

        <div class="card">
          <div class="card-header">
            <h2>สมาชิก (${members.length})</h2>
            ${isLeader ? `<button class="btn btn-primary btn-sm" id="add-member-btn">+ เพิ่ม</button>` : ''}
          </div>
          <ul class="member-list" id="member-list">
            ${members.map(m => `
              <li class="member-item">
                ${m.avatar_url
                  ? `<img src="${h(m.avatar_url)}" alt="${h(m.name)}" class="member-avatar">`
                  : `<div class="member-avatar-ph">${h(m.name.charAt(0))}</div>`}
                <div style="flex:1">
                  <div style="font-size:.88rem;font-weight:600">${h(m.name)}</div>
                  <div style="font-size:.75rem;color:var(--text-muted)">${h(m.email)}</div>
                </div>
                <span class="member-role">${m.role === 'leader' ? 'หัวหน้า' : 'สมาชิก'}</span>
                ${isLeader && m.role !== 'leader'
                  ? `<button class="btn btn-danger btn-sm do-remove-member" data-uid="${h(m.user_id)}" style="margin-left:.35rem">✕</button>`
                  : ''}
              </li>`).join('')}
          </ul>
        </div>
      </div>`;

    document.getElementById('delete-btn')?.addEventListener('click', async () => {
      if (!confirm(`ยืนยันการลบโครงการ "${project.name}"?`)) return;
      try { await deleteProject(id); window.location.href = '/projects/'; }
      catch (err) {
        document.getElementById('page-error').innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      }
    });

    document.querySelectorAll('.do-remove-member').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('ต้องการนำสมาชิกนี้ออกจากโครงการ?')) return;
        try { await removeProjectMember(id, btn.dataset.uid); await renderPage(); }
        catch (err) { alert(err.message); }
      });
    });

    document.getElementById('add-member-btn')?.addEventListener('click', () => {
      const close = openModal('เพิ่มสมาชิก', `
        <div id="member-modal-error"></div>
        <div class="form">
          <div class="form-group">
            <label class="form-label">อีเมล <span class="form-required">*</span></label>
            <input class="form-input" id="member-email" type="email" placeholder="example@chula.ac.th" autofocus>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" id="do-add-member-btn">เพิ่ม</button>
            <button class="btn btn-secondary" id="cancel-member-btn">ยกเลิก</button>
          </div>
        </div>`);

      document.getElementById('cancel-member-btn').addEventListener('click', close);
      document.getElementById('do-add-member-btn').addEventListener('click', async () => {
        const email = document.getElementById('member-email').value.trim();
        if (!email) return;
        const btn = document.getElementById('do-add-member-btn');
        btn.disabled = true; btn.textContent = 'กำลังเพิ่ม...';
        try {
          await addProjectMember(id, { email });
          close();
          await renderPage();
        } catch (err) {
          document.getElementById('member-modal-error').innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'เพิ่ม';
        }
      });
    });
  }

  await renderPage();
}
init();
