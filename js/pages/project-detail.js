import { requireAuth } from '../auth.js';
import { getProject, deleteProject, getRequests, addProjectMember, removeProjectMember, transferOwnership, searchUsers, createVisit } from '../api.js';
import { h, statusBadge, formatDate, openModal, projectStatusBadge, showToast, showConfirm } from '../ui.js';
import { openProjectModal } from '../project-modal.js';
import { openRequestModal } from '../request-modal.js';

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

    const isArchived  = project.status === 'archived';
    const canManage   = user.role === 'admin' || (!isArchived && user.id === project.owner_id);
    const linked      = reqData.requests.filter(r => r.project_id === id);
    const isActive    = project.status === 'active';

    app.innerHTML = `
      <button class="back-btn" onclick="history.back()">← กลับ</button>
      <div class="page-header">
        <div>
          <h1 class="page-title">${h(project.name)}</h1>
          ${projectStatusBadge(project.status)}
        </div>
        <div class="actions-bar">
          ${isActive ? `<button class="btn btn-primary do-create-req">+ สร้างคำขอยืม</button>` : ''}
          ${isActive ? `<button class="btn btn-secondary" id="book-visit-btn">นัดชมคลัง</button>` : ''}
          ${canManage ? `
            <button class="btn btn-secondary" id="edit-proj-btn">แก้ไข</button>
            <button class="btn btn-danger" id="delete-btn">ลบ</button>` : ''}
        </div>
      </div>
      <div id="page-error"></div>

      <div class="card">
        <div class="card-title">รายละเอียดโครงการ</div>
        <div class="proj-info-grid">
          <div class="info-row"><span class="info-label">เจ้าของโครงการ</span><span>${h(project.owner_name)}</span></div>
          ${project.unit_type ? `<div class="info-row"><span class="info-label">ประเภทหน่วยงาน</span><span>${h(project.unit_type)}</span></div>` : ''}
          <div class="info-row"><span class="info-label">ช่วงเวลา</span><span>${formatDate(project.start_date)} → ${formatDate(project.end_date)}</span></div>
          ${project.group          ? `<div class="info-row"><span class="info-label">กลุ่ม</span><span>${h(project.group)}</span></div>` : ''}
          ${project.in_charge_person ? `<div class="info-row"><span class="info-label">ผู้รับผิดชอบ</span><span>${h(project.in_charge_person)}</span></div>` : ''}
          ${project.description    ? `<div class="info-row" style="grid-column:1/-1"><span class="info-label">คำอธิบาย</span><span>${h(project.description)}</span></div>` : ''}
        </div>
      </div>

      <div class="proj-bottom-grid">
        <div class="card">
          <div class="card-header">
            <h2>สมาชิก (${members.length})</h2>
            <div style="display:flex;gap:.4rem">
              ${canManage ? `<button class="btn btn-secondary btn-sm" id="transfer-ownership-btn">โอนสิทธิ์</button>` : ''}
              ${canManage ? `<button class="btn btn-primary btn-sm" id="add-member-btn">+ เพิ่ม</button>` : ''}
            </div>
          </div>
          <ul class="member-list" id="member-list">
            ${members.map(m => `
              <li class="member-item">
                ${m.avatar_url
                  ? `<img src="${h(m.avatar_url)}" alt="${h(m.name)}" class="member-avatar">`
                  : `<div class="member-avatar-ph">${h(m.name.charAt(0))}</div>`}
                <div style="flex:1;min-width:0">
                  <div style="font-size:.88rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h(m.name)}</div>
                  <div style="font-size:.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h(m.email)}</div>
                </div>
                <span class="member-role">${m.role === 'leader' ? 'ผู้รับผิดชอบ' : 'สมาชิก'}</span>
                ${canManage && m.role !== 'leader'
                  ? `<button class="btn btn-danger btn-sm do-remove-member" data-uid="${h(m.user_id)}">✕</button>`
                  : ''}
              </li>`).join('')}
          </ul>
        </div>

        <div class="card">
          <div class="card-header">
            <h2>คำขอยืม${linked.length > 0 ? ` (${linked.length})` : ''}</h2>
            ${isActive ? `<button class="btn btn-primary btn-sm do-create-req">+ สร้าง</button>` : ''}
          </div>
          ${linked.length > 0 ? `
            <div style="display:flex;flex-direction:column;gap:.5rem">
              ${linked.map(r => `
                <a href="/request-detail/?id=${h(r.id)}" class="request-link-row">
                  <span style="font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${r.name ? h(r.name) : `<span class="mono">#${h(r.id.slice(0,8))}</span>`}
                  </span>
                  ${statusBadge(r.status)}
                  <span class="muted" style="white-space:nowrap;flex-shrink:0">${formatDate(r.requested_pickup_datetime)}</span>
                </a>`).join('')}
            </div>` : `
            <div class="dash-empty" style="padding:1.5rem">
              <p style="font-size:.88rem;color:var(--text-muted)">ยังไม่มีคำขอยืมสำหรับโครงการนี้</p>
            </div>`}
        </div>
      </div>`;

    document.querySelectorAll('.do-create-req').forEach(btn => {
      btn.addEventListener('click', () => openRequestModal({ projectId: id, project }));
    });

    document.getElementById('book-visit-btn')?.addEventListener('click', () => {
      const VISIT_SLOTS = ['12:30', '16:30'];
      const todayStr = new Date().toISOString().slice(0, 10);

      const close = openModal('นัดชมคลังอุปกรณ์', `
        <div id="visit-error"></div>
        <div class="form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">วันที่นัด <span class="form-required">*</span></label>
              <input type="date" class="form-input" id="visit-date" min="${todayStr}">
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
            <input class="form-input" id="visit-purpose" placeholder="เช่น ดูรายการอุปกรณ์" autocomplete="off">
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" id="visit-submit-btn">ส่งคำนัด</button>
            <button class="btn btn-secondary" id="visit-cancel-btn">ยกเลิก</button>
          </div>
        </div>`);

      document.getElementById('visit-cancel-btn').addEventListener('click', close);
      document.getElementById('visit-submit-btn').addEventListener('click', async () => {
        const dateVal = document.getElementById('visit-date').value;
        const slot    = document.getElementById('visit-slot').value;
        const purpose = document.getElementById('visit-purpose').value.trim();
        const errBox  = document.getElementById('visit-error');
        const btn     = document.getElementById('visit-submit-btn');
        errBox.innerHTML = '';

        if (!dateVal) { errBox.innerHTML = `<div class="alert alert-error">กรุณาเลือกวันที่</div>`; return; }
        const d = new Date(dateVal + 'T12:00:00');
        if (d.getDay() < 1 || d.getDay() > 5) { errBox.innerHTML = `<div class="alert alert-error">กรุณาเลือกวันจันทร์ – ศุกร์เท่านั้น</div>`; return; }
        if (!slot)    { errBox.innerHTML = `<div class="alert alert-error">กรุณาเลือกช่วงเวลา</div>`; return; }
        if (!purpose) { errBox.innerHTML = `<div class="alert alert-error">กรุณาระบุวัตถุประสงค์</div>`; return; }

        btn.disabled = true; btn.textContent = 'กำลังส่ง...';
        try {
          await createVisit({ project_id: id, visit_date: dateVal, visit_slot: slot, purpose });
          close();
          showToast('ส่งคำนัดชมสำเร็จ');
        } catch (err) {
          errBox.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'ส่งคำนัด';
        }
      });
    });

    document.getElementById('edit-proj-btn')?.addEventListener('click', () => {
      openProjectModal(project, () => renderPage());
    });

    document.getElementById('delete-btn')?.addEventListener('click', () => {
      const close = openModal('ลบโครงการ', `
        <div id="del-error"></div>
        <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:1rem;line-height:1.6">
          การลบโครงการไม่สามารถย้อนกลับได้ กรุณาพิมพ์ชื่อโครงการเพื่อยืนยัน
        </p>
        <div class="form-group" style="margin-bottom:.25rem">
          <label class="form-label" style="font-weight:600;color:var(--text)">${h(project.name)}</label>
          <input class="form-input" id="del-confirm-input" placeholder="พิมพ์ชื่อโครงการ" autocomplete="off">
        </div>
        <div class="form-actions" style="margin-top:1.25rem">
          <button class="btn btn-danger" id="del-confirm-btn" disabled>ลบโครงการ</button>
          <button class="btn btn-secondary" id="del-cancel-btn">ยกเลิก</button>
        </div>`);

      const input  = document.getElementById('del-confirm-input');
      const delBtn = document.getElementById('del-confirm-btn');

      input.addEventListener('input', () => {
        delBtn.disabled = input.value !== project.name;
      });

      document.getElementById('del-cancel-btn').addEventListener('click', close);

      delBtn.addEventListener('click', async () => {
        if (input.value !== project.name) return;
        delBtn.disabled = true; delBtn.textContent = 'กำลังลบ...';
        try {
          await deleteProject(id);
          window.location.href = '/projects/';
        } catch (err) {
          document.getElementById('del-error').innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          delBtn.disabled = false; delBtn.textContent = 'ลบโครงการ';
        }
      });
    });

    document.getElementById('transfer-ownership-btn')?.addEventListener('click', () => {
      const eligible = members.filter(m => m.user_id !== user.id);
      if (eligible.length === 0) {
        showToast('ไม่มีสมาชิกที่สามารถโอนให้ได้ กรุณาเพิ่มสมาชิกก่อน', 'error');
        return;
      }

      let selectedUser = null;

      const close = openModal('โอนสิทธิ์ความเป็นเจ้าของ', `
        <div id="transfer-error"></div>
        <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:1rem;line-height:1.6">
          คุณจะยังคงอยู่ในโครงการในฐานะสมาชิก
        </p>
        <div class="form">
          <div class="form-group" style="position:relative">
            <label class="form-label">ค้นหาสมาชิก</label>
            <input class="form-input" id="transfer-search" placeholder="ค้นหาชื่อหรืออีเมล..." autocomplete="off">
            <div id="transfer-results" class="search-dropdown" style="display:none"></div>
          </div>
          <div id="transfer-selected" style="display:none;margin-top:.35rem"></div>
          <div class="form-actions">
            <button class="btn btn-primary" id="do-transfer-btn" disabled>โอนสิทธิ์</button>
            <button class="btn btn-secondary" id="cancel-transfer-btn">ยกเลิก</button>
          </div>
        </div>`);

      const searchInput = document.getElementById('transfer-search');
      const resultsBox  = document.getElementById('transfer-results');
      const selectedBox = document.getElementById('transfer-selected');
      const confirmBtn  = document.getElementById('do-transfer-btn');
      const errorBox    = document.getElementById('transfer-error');

      function showResults(q) {
        const filtered = q
          ? eligible.filter(m => m.name.toLowerCase().includes(q.toLowerCase()) || m.email.toLowerCase().includes(q.toLowerCase()))
          : eligible;
        resultsBox.innerHTML = filtered.length === 0
          ? `<div class="search-dropdown-empty">ไม่พบสมาชิก</div>`
          : filtered.map((m, i) => `
              <div class="search-dropdown-item" data-idx="${i}">
                ${m.avatar_url
                  ? `<img src="${h(m.avatar_url)}" class="member-avatar" alt="${h(m.name)}">`
                  : `<div class="member-avatar-ph">${h(m.name.charAt(0))}</div>`}
                <div>
                  <div style="font-weight:600">${h(m.name)}</div>
                  <div style="font-size:.75rem;color:var(--text-muted)">${h(m.email)}</div>
                </div>
              </div>`).join('');
        resultsBox.querySelectorAll('.search-dropdown-item').forEach(el => {
          el.addEventListener('mousedown', e => {
            e.preventDefault();
            const picked = filtered[+el.dataset.idx];
            selectedUser = { id: picked.user_id, name: picked.name, email: picked.email, avatar_url: picked.avatar_url };
            searchInput.value = picked.name;
            resultsBox.style.display = 'none';
            selectedBox.style.display = 'block';
            selectedBox.innerHTML = `
              <div style="display:flex;align-items:center;gap:.6rem;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.5rem .75rem">
                ${picked.avatar_url
                  ? `<img src="${h(picked.avatar_url)}" class="member-avatar" alt="${h(picked.name)}">`
                  : `<div class="member-avatar-ph">${h(picked.name.charAt(0))}</div>`}
                <div>
                  <div style="font-weight:600;font-size:.88rem">${h(picked.name)}</div>
                  <div style="font-size:.75rem;color:var(--text-muted)">${h(picked.email)}</div>
                </div>
              </div>`;
            confirmBtn.disabled = false;
          });
        });
        resultsBox.style.display = 'block';
      }

      searchInput.addEventListener('focus', () => showResults(searchInput.value.trim()));
      searchInput.addEventListener('input', () => {
        selectedUser = null; confirmBtn.disabled = true;
        selectedBox.style.display = 'none';
        showResults(searchInput.value.trim());
      });
      searchInput.addEventListener('blur', () => setTimeout(() => { resultsBox.style.display = 'none'; }, 150));

      document.getElementById('cancel-transfer-btn').addEventListener('click', close);
      confirmBtn.addEventListener('click', async () => {
        if (!selectedUser) return;
        confirmBtn.disabled = true; confirmBtn.textContent = 'กำลังโอน...';
        try {
          await transferOwnership(id, selectedUser.id);
          close();
          showToast('โอนสิทธิ์สำเร็จ');
          await renderPage();
        } catch (err) {
          errorBox.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          confirmBtn.disabled = false; confirmBtn.textContent = 'โอนสิทธิ์';
        }
      });
    });

    document.querySelectorAll('.do-remove-member').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm('ต้องการนำสมาชิกนี้ออกจากโครงการ?', { danger: true })) return;
        try { await removeProjectMember(id, btn.dataset.uid); showToast('นำสมาชิกออกแล้ว'); await renderPage(); }
        catch (err) { alert(err.message); }
      });
    });

    document.getElementById('add-member-btn')?.addEventListener('click', () => {
      let selectedUser = null;
      let debounceTimer;

      const close = openModal('เพิ่มสมาชิก', `
        <div id="member-modal-error"></div>
        <div class="form">
          <div class="form-group" style="position:relative">
            <label class="form-label">ค้นหา (ชื่อ, อีเมล หรือรหัสนักศึกษา)</label>
            <input class="form-input" id="member-search" placeholder="เช่น 65090045 หรือ beam..." autofocus autocomplete="off">
            <div id="member-results" class="search-dropdown" style="display:none"></div>
          </div>
          <div id="member-selected-box" style="display:none;margin-top:.35rem"></div>
          <div class="form-actions">
            <button class="btn btn-primary" id="do-add-member-btn" disabled>เพิ่ม</button>
            <button class="btn btn-secondary" id="cancel-member-btn">ยกเลิก</button>
          </div>
        </div>`, { wide: true });

      const searchInput = document.getElementById('member-search');
      const resultsBox  = document.getElementById('member-results');
      const selectedBox = document.getElementById('member-selected-box');
      const addBtn      = document.getElementById('do-add-member-btn');
      const errorBox    = document.getElementById('member-modal-error');

      function pickUser(u) {
        selectedUser = u;
        resultsBox.style.display = 'none';
        searchInput.value = u.name;
        selectedBox.style.display = 'block';
        selectedBox.innerHTML = `
          <div style="display:flex;align-items:center;gap:.6rem;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.5rem .75rem">
            ${u.avatar_url
              ? `<img src="${h(u.avatar_url)}" class="member-avatar" alt="${h(u.name)}">`
              : `<div class="member-avatar-ph">${h(u.name.charAt(0))}</div>`}
            <div>
              <div style="font-weight:600;font-size:.88rem">${h(u.name)}</div>
              <div style="font-size:.75rem;color:var(--text-muted)">${h(u.email)}</div>
            </div>
          </div>`;
        addBtn.disabled = false;
      }

      async function fetchUserResults(q) {
        try {
          const { users } = await searchUsers(q);
          resultsBox.innerHTML = users.length === 0
            ? `<div class="search-dropdown-empty">ไม่พบผู้ใช้</div>`
            : users.map((u, i) => `
                <div class="search-dropdown-item" data-idx="${i}">
                  ${u.avatar_url
                    ? `<img src="${h(u.avatar_url)}" class="member-avatar" alt="${h(u.name)}">`
                    : `<div class="member-avatar-ph">${h(u.name.charAt(0))}</div>`}
                  <div>
                    <div style="font-weight:600">${h(u.name)}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${h(u.email)}</div>
                  </div>
                </div>`).join('');
          resultsBox.querySelectorAll('.search-dropdown-item').forEach(el => {
            el.addEventListener('mousedown', (e) => { e.preventDefault(); pickUser(users[+el.dataset.idx]); });
          });
          resultsBox.style.display = 'block';
        } catch {}
      }

      searchInput.addEventListener('focus', () => fetchUserResults(searchInput.value.trim()));

      searchInput.addEventListener('input', () => {
        selectedUser = null;
        addBtn.disabled = true;
        selectedBox.style.display = 'none';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchUserResults(searchInput.value.trim()), 300);
      });

      searchInput.addEventListener('blur', () => setTimeout(() => { resultsBox.style.display = 'none'; }, 150));

      document.getElementById('cancel-member-btn').addEventListener('click', close);
      addBtn.addEventListener('click', async () => {
        if (!selectedUser) return;
        addBtn.disabled = true; addBtn.textContent = 'กำลังเพิ่ม...';
        try {
          await addProjectMember(id, { email: selectedUser.email });
          close();
          showToast('เพิ่มสมาชิกสำเร็จ');
          await renderPage();
        } catch (err) {
          errorBox.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          addBtn.disabled = false; addBtn.textContent = 'เพิ่ม';
        }
      });
    });
  }

  await renderPage();
}
init();
