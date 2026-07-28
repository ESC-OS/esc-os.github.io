import { requireAuth } from '../auth.js';
import {
  getProject, deleteProject, getProjectMembers, addMember, removeMember,
  transferLeader, leaveProject, getProjectIncidents,
  getRequests, getVisits, getDeposits, getStorageAreas, getDonations,
  getNotifications,
} from '../api.js';
import { h, statusBadge, formatDate, formatDateTime, renderNavbar, showError, openModal } from '../ui.js';
import { openProjectModal, openRequestModal, openVisitModal, openDepositModal } from '../forms.js';

// Map request status to tab key
function reqTab(status) {
  if (['draft', 'pending'].includes(status)) return 'draft';
  if (['processing', 'ready_for_pickup'].includes(status)) return 'processing';
  if (status === 'in_lend') return 'active';
  return 'done';
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) { window.location.href = 'projects.html'; return; }

  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  await render();

  async function render() {
    let project, members, requests, visits, deposits, storageAreas, donations;

    try {
      [
        { data: project },
        { data: members },
      ] = await Promise.all([
        getProject(id),
        getProjectMembers(id),
      ]);
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    members = members ?? [];

    // Fetch all services (non-blocking — degrade gracefully)
    let incidents = [];
    [requests, visits, deposits, storageAreas, donations, incidents] = await Promise.all([
      getRequests({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getVisits({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getDeposits({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getStorageAreas({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getDonations({ project_id: id, limit: 100 }).then(r => r?.data ?? []).catch(() => []),
      getProjectIncidents(id).then(r => r?.data ?? []).catch(() => []),
    ]);

    const isLeader = project.leader_id === user.id;
    const isAdmin  = user.role === 'admin';
    const canManage = isLeader || isAdmin;
    const isSelfMember = members.some(m => m.user_id === user.id && m.role === 'member');
    const isSelfInProject = isLeader || isSelfMember;

    // ── Helpers ───────────────────────────────────────────
    function avatarEl(m) {
      if (m.avatar_url) {
        return `<img src="${h(m.avatar_url)}" alt="${h(m.name)}" class="member-avatar">`;
      }
      const initial = h((m.name || '?').charAt(0).toUpperCase());
      return `<div class="member-avatar-ph">${initial}</div>`;
    }

    function memberRow(m) {
      const isCurrentLeader = m.role === 'leader';
      const isSelf = m.user_id === user.id;
      return `
        <li class="member-item">
          ${avatarEl(m)}
          <div style="flex:1;min-width:0">
            <div style="font-size:.88rem;font-weight:500">${h(m.name || m.user_id)}</div>
            ${m.email ? `<div style="font-size:.75rem;color:var(--text-muted)">${h(m.email)}</div>` : ''}
          </div>
          <span class="member-role">${isCurrentLeader ? 'หัวหน้า' : 'สมาชิก'}</span>
          ${canManage && !isSelf && !isCurrentLeader
            ? `<button class="btn btn-sm btn-danger remove-member-btn" data-uid="${h(m.user_id)}" data-name="${h(m.name || m.user_id)}">ลบ</button>`
            : ''}
        </li>`;
    }

    // ── Borrow request rows ───────────────────────────────
    function reqRow(r) {
      return `
        <a href="request-detail.html?id=${h(r.id)}" class="svc-row">
          <span class="svc-row-id">${h(String(r.id))}</span>
          <span class="svc-row-name">${h(r.name || r.title || r.purpose || ('คำขอ #' + r.id))}</span>
          <span class="svc-row-meta">${statusBadge(r.status)}</span>
          <span class="svc-row-arrow">›</span>
        </a>`;
    }

    // Group requests into tabs
    const reqGroups = { draft: [], processing: [], active: [], done: [] };
    requests.forEach(r => reqGroups[reqTab(r.status)].push(r));

    function reqTabContent(key) {
      const list = reqGroups[key];
      if (!list.length) return '<p class="empty-text" style="padding:.75rem 0">ไม่มีรายการ</p>';
      return `<div class="svc-list">${list.map(reqRow).join('')}</div>`;
    }

    // ── Service compact rows ──────────────────────────────
    function visitRow(v) {
      return `
        <a href="visit-detail.html?id=${h(v.id)}" class="svc-row">
          <span class="svc-row-id">${h(String(v.id))}</span>
          <span class="svc-row-name">เยี่ยมชม ${formatDate(v.visit_date)}</span>
          <span class="svc-row-meta">${statusBadge(v.status)}</span>
          <span class="svc-row-arrow">›</span>
        </a>`;
    }

    function depositRow(d) {
      return `
        <a href="deposit-detail.html?id=${h(d.id)}" class="svc-row">
          <span class="svc-row-id">${h(String(d.id))}</span>
          <span class="svc-row-name">ฝากของ ${formatDate(d.deposit_date || d.created_at)}</span>
          <span class="svc-row-meta">${statusBadge(d.status)}</span>
          <span class="svc-row-arrow">›</span>
        </a>`;
    }

    function storageRow(s) {
      return `
        <a href="storage-area-detail.html?id=${h(s.id)}" class="svc-row">
          <span class="svc-row-id">${h(String(s.id))}</span>
          <span class="svc-row-name">พื้นที่จัดเก็บ ${s.location ? h(s.location) : ''}</span>
          <span class="svc-row-meta">${statusBadge(s.status)}</span>
          <span class="svc-row-arrow">›</span>
        </a>`;
    }

    function donationRow(d) {
      return `
        <a href="donation-detail.html?id=${h(d.id)}" class="svc-row">
          <span class="svc-row-id">${h(String(d.id))}</span>
          <span class="svc-row-name">บริจาค ${formatDate(d.created_at)}</span>
          <span class="svc-row-meta">${statusBadge(d.status)}</span>
          <span class="svc-row-arrow">›</span>
        </a>`;
    }

    function svcSection(title, href, items, rowFn, emptyText, createHtml = '') {
      return `
        <div class="card" style="margin-top:1.25rem">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
            <div class="card-title" style="margin:0">${title} <span style="font-weight:400;font-size:.85rem;color:var(--text-muted)">(${items.length})</span></div>
            <div style="display:flex;gap:.4rem;align-items:center">
              ${createHtml}
              <a href="${href}" class="btn btn-sm btn-secondary">ดูทั้งหมด</a>
            </div>
          </div>
          ${items.length === 0
            ? `<p class="empty-text">${emptyText}</p>`
            : `<div class="svc-list">${items.map(rowFn).join('')}</div>`}
        </div>`;
    }

    // ── Render HTML ───────────────────────────────────────
    const orgType = project.org_type || project.organization_type || '';
    const totalMembers = members.length;

    app.innerHTML = `
      <a href="projects.html" class="back-btn">← กลับ</a>

      <!-- Header card -->
      <div class="card" style="margin-bottom:1.25rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem">
          <div>
            <h1 style="font-size:1.5rem;font-weight:700;color:var(--primary);margin:0 0 .4rem">${h(project.name)}</h1>
            <div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;font-size:.88rem;color:var(--text-muted)">
              ${orgType ? `<span class="member-role" style="font-size:.8rem">${h(orgType)}</span>` : ''}
              <span>${formatDate(project.start_date)} – ${formatDate(project.end_date)}</span>
              <span>${totalMembers} สมาชิก</span>
            </div>
            ${project.description ? `<p style="margin-top:.6rem;font-size:.9rem;color:var(--text-muted)">${h(project.description)}</p>` : ''}
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            ${canManage ? `
              <button class="btn btn-secondary btn-sm" id="edit-proj-btn">แก้ไข</button>
              <button class="btn btn-danger btn-sm" id="delete-btn">ลบโครงการ</button>` : ''}
            ${isSelfMember ? `<button class="btn btn-secondary btn-sm" id="leave-btn">ออกจากโครงการ</button>` : ''}
          </div>
        </div>
      </div>

      <!-- Members card -->
      <div class="card" style="margin-bottom:1.25rem">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
          <div class="card-title" style="margin:0">สมาชิก (${totalMembers})</div>
          <div style="display:flex;gap:.4rem;align-items:center">
            ${isLeader ? `<button class="btn btn-sm btn-secondary" id="transfer-btn">เปลี่ยนหัวหน้า</button>` : ''}
            ${canManage ? `<button class="btn btn-sm btn-primary" id="add-member-btn">+ เพิ่มสมาชิก</button>` : ''}
          </div>
        </div>
        <ul class="member-list" id="member-list">
          ${members.map(m => memberRow(m)).join('')}
        </ul>
      </div>

      <!-- Borrow requests section with tabs -->
      <div class="card" style="margin-bottom:1.25rem">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
          <div class="card-title" style="margin:0">คำขอยืม <span style="font-weight:400;font-size:.85rem;color:var(--text-muted)">(${requests.length})</span></div>
          <div style="display:flex;gap:.4rem;align-items:center">
            <button class="btn btn-sm btn-primary" id="qa-request">+ คำขอยืม</button>
            <a href="requests.html" class="btn btn-sm btn-secondary">ดูทั้งหมด</a>
          </div>
        </div>
        <div class="tab-bar" style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:.75rem">
          <button class="tab-btn tab-active" data-tab="draft" style="padding:.45rem 1rem;background:none;border:none;font-size:.88rem;cursor:pointer;color:var(--primary);border-bottom:2px solid var(--primary);margin-bottom:-2px;font-weight:600">ร่าง/รอ (${reqGroups.draft.length})</button>
          <button class="tab-btn" data-tab="processing" style="padding:.45rem 1rem;background:none;border:none;font-size:.88rem;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px">เตรียม (${reqGroups.processing.length})</button>
          <button class="tab-btn" data-tab="active" style="padding:.45rem 1rem;background:none;border:none;font-size:.88rem;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px">กำลังยืม (${reqGroups.active.length})</button>
          <button class="tab-btn" data-tab="done" style="padding:.45rem 1rem;background:none;border:none;font-size:.88rem;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px">คืนแล้ว (${reqGroups.done.length})</button>
        </div>
        <div id="tab-draft" class="tab-panel">${reqTabContent('draft')}</div>
        <div id="tab-processing" class="tab-panel" style="display:none">${reqTabContent('processing')}</div>
        <div id="tab-active" class="tab-panel" style="display:none">${reqTabContent('active')}</div>
        <div id="tab-done" class="tab-panel" style="display:none">${reqTabContent('done')}</div>
      </div>

      <!-- Other services -->
      ${svcSection('การเยี่ยมชม', `visits.html`, visits, visitRow, 'ยังไม่มีการจองเยี่ยมชม',
        `<button class="btn btn-sm btn-primary" id="qa-visit">+ เยี่ยมชม</button>`)}
      ${svcSection('การฝากของชั่วคราว', `deposits.html`, deposits, depositRow, 'ยังไม่มีการฝากของ',
        `<button class="btn btn-sm btn-primary" id="qa-deposit">+ ฝากชั่วคราว</button>`)}
      ${svcSection('พื้นที่จัดเก็บ', `storage-areas.html`, storageAreas, storageRow, 'ยังไม่มีคำขอพื้นที่จัดเก็บ',
        `<a href="storage-area-form.html?project_id=${h(id)}" class="btn btn-sm btn-primary">+ พื้นที่จัดเก็บ</a>`)}
      ${svcSection('การบริจาค', `donations.html`, donations, donationRow, 'ยังไม่มีการบริจาค',
        `<a href="donation-form.html?project_id=${h(id)}" class="btn btn-sm btn-primary">+ บริจาค</a>`)}

      <!-- Behavior history -->
      ${incidents.length > 0 ? `
        <div class="card" style="margin-top:1.25rem;border-left:3px solid var(--error)">
          <div class="card-title" style="color:var(--error)">ประวัติพฤติกรรม (${incidents.length})</div>
          <div class="svc-list">
            ${incidents.map(inc => {
              const typeLabel = inc.incident_type === 'late_return' ? 'คืนล่าช้า'
                : inc.incident_type === 'policy_violation' ? 'ละเมิดนโยบาย'
                : inc.incident_type === 'no_show_visit' ? 'ไม่มาตามนัดเยี่ยมชม'
                : h(inc.incident_type);
              return `
                <div class="svc-row" style="cursor:default">
                  <span class="svc-row-id" style="color:var(--error);font-weight:600">${typeLabel}</span>
                  <span class="svc-row-name">${h(inc.note || '-')}</span>
                  <span class="svc-row-meta" style="font-size:.8rem;color:var(--text-muted)">${formatDate(inc.created_at)}</span>
                </div>`;
            }).join('')}
          </div>
        </div>` : ''}
    `;

    // ── Edit project ──────────────────────────────────────
    document.getElementById('edit-proj-btn')?.addEventListener('click', () => {
      openProjectModal({ editId: id, onSuccess: () => render() });
    });

    // ── Quick action modals ───────────────────────────────
    document.getElementById('qa-request')?.addEventListener('click', () => {
      openRequestModal({
        projectId: id,
        onSuccess: reqId => { if (reqId) window.location.href = `request-detail.html?id=${encodeURIComponent(reqId)}`; },
      });
    });
    document.getElementById('qa-visit')?.addEventListener('click', () => {
      openVisitModal({ projectId: id, onSuccess: () => render() });
    });
    document.getElementById('qa-deposit')?.addEventListener('click', () => {
      openDepositModal({
        projectId: id,
        onSuccess: depId => { if (depId) window.location.href = `deposit-detail.html?id=${encodeURIComponent(depId)}`; },
      });
    });

    // ── Tab switching ─────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => {
          const isActive = b.dataset.tab === tab;
          b.style.color = isActive ? 'var(--primary)' : 'var(--text-muted)';
          b.style.borderBottomColor = isActive ? 'var(--primary)' : 'transparent';
          b.style.fontWeight = isActive ? '600' : '400';
        });
        document.querySelectorAll('.tab-panel').forEach(p => {
          p.style.display = p.id === `tab-${tab}` ? '' : 'none';
        });
      });
    });

    // ── Delete project ────────────────────────────────────
    document.getElementById('delete-btn')?.addEventListener('click', () => {
      const close = openModal('ยืนยันการลบโครงการ', `
        <p>คุณต้องการลบโครงการ <strong>${h(project.name)}</strong> ใช่หรือไม่?</p>
        <p style="color:var(--text-muted);font-size:.88rem;margin-top:.4rem">การดำเนินการนี้ไม่สามารถยกเลิกได้</p>
        <div class="form-actions" style="margin-top:1rem">
          <button class="btn btn-danger" id="confirm-delete-btn">ลบโครงการ</button>
          <button class="btn btn-secondary" id="cancel-delete-btn">ยกเลิก</button>
        </div>
      `);
      document.getElementById('cancel-delete-btn').addEventListener('click', close);
      document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        try {
          await deleteProject(id);
          window.location.href = 'projects.html';
        } catch (err) {
          close();
          showError(err.message);
        }
      });
    });

    // ── Remove member ─────────────────────────────────────
    document.querySelectorAll('.remove-member-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.uid;
        const name = btn.dataset.name;
        const close = openModal('ลบสมาชิก', `
          <p>คุณต้องการลบ <strong>${h(name)}</strong> ออกจากโครงการใช่หรือไม่?</p>
          <div class="form-actions" style="margin-top:1rem">
            <button class="btn btn-danger" id="confirm-remove-btn">ลบสมาชิก</button>
            <button class="btn btn-secondary" id="cancel-remove-btn">ยกเลิก</button>
          </div>
        `);
        document.getElementById('cancel-remove-btn').addEventListener('click', close);
        document.getElementById('confirm-remove-btn').addEventListener('click', async () => {
          try {
            await removeMember(id, uid);
            close();
            await render();
          } catch (err) {
            close();
            showError(err.message);
          }
        });
      });
    });

    // ── Transfer leader ───────────────────────────────────
    document.getElementById('transfer-btn')?.addEventListener('click', () => {
      const eligibleMembers = members.filter(m => m.role === 'member');
      if (eligibleMembers.length === 0) {
        showError('ไม่มีสมาชิกที่สามารถโอนตำแหน่งให้ได้');
        return;
      }
      const opts = eligibleMembers.map(m =>
        `<option value="${h(m.user_id)}">${h(m.name || m.user_id)}</option>`
      ).join('');
      const close = openModal('โอนตำแหน่งหัวหน้า', `
        <p style="margin-bottom:.75rem">เลือกสมาชิกที่จะรับตำแหน่งหัวหน้าโครงการ</p>
        <div id="transfer-error"></div>
        <div class="form-group">
          <select class="form-select" id="transfer-select">
            <option value="">-- เลือกสมาชิก --</option>
            ${opts}
          </select>
        </div>
        <div class="form-actions" style="margin-top:1rem">
          <button class="btn btn-primary" id="transfer-confirm-btn">โอนตำแหน่ง</button>
          <button class="btn btn-secondary" id="transfer-cancel-btn">ยกเลิก</button>
        </div>
      `);
      document.getElementById('transfer-cancel-btn').addEventListener('click', close);
      document.getElementById('transfer-confirm-btn').addEventListener('click', async () => {
        const uid = document.getElementById('transfer-select')?.value;
        if (!uid) {
          document.getElementById('transfer-error').innerHTML = '<div class="alert alert-error" style="margin-bottom:.5rem">กรุณาเลือกสมาชิก</div>';
          return;
        }
        try {
          await transferLeader(id, uid);
          close();
          await render();
        } catch (err) {
          document.getElementById('transfer-error').innerHTML = `<div class="alert alert-error" style="margin-bottom:.5rem">${h(err.message)}</div>`;
        }
      });
    });

    // ── Leave project ─────────────────────────────────────
    document.getElementById('leave-btn')?.addEventListener('click', () => {
      const close = openModal('ออกจากโครงการ', `
        <p>คุณต้องการออกจากโครงการ <strong>${h(project.name)}</strong> ใช่หรือไม่?</p>
        <div class="form-actions" style="margin-top:1rem">
          <button class="btn btn-danger" id="leave-confirm-btn">ออกจากโครงการ</button>
          <button class="btn btn-secondary" id="leave-cancel-btn">ยกเลิก</button>
        </div>
      `);
      document.getElementById('leave-cancel-btn').addEventListener('click', close);
      document.getElementById('leave-confirm-btn').addEventListener('click', async () => {
        try {
          await leaveProject(id);
          window.location.href = 'projects.html';
        } catch (err) {
          close();
          showError(err.message);
        }
      });
    });

    // ── Add member ────────────────────────────────────────
    document.getElementById('add-member-btn')?.addEventListener('click', () => {
      const close = openModal('เพิ่มสมาชิก', `
        <div id="add-member-error"></div>
        <div class="form-group" style="margin-bottom:.5rem">
          <label class="form-label" style="margin-bottom:.4rem">อีเมลผู้ใช้</label>
          <input class="form-input" id="member-email" placeholder="อีเมล @chula.ac.th" type="email" autocomplete="off">
        </div>
        <div style="margin-top:.75rem;display:flex;gap:.5rem">
          <button class="btn btn-primary" id="add-btn">เพิ่ม</button>
          <button class="btn btn-secondary" id="cancel-btn">ยกเลิก</button>
        </div>
      `);

      document.getElementById('cancel-btn').addEventListener('click', close);

      document.getElementById('add-btn').addEventListener('click', async () => {
        const errEl = document.getElementById('add-member-error');
        errEl.innerHTML = '';
        const email = (document.getElementById('member-email')?.value ?? '').trim();
        if (!email) {
          errEl.innerHTML = '<div class="alert alert-error" style="margin-bottom:.5rem">กรุณากรอกอีเมล</div>';
          return;
        }
        try {
          await addMember(id, { email });
          close();
          await render();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error" style="margin-bottom:.5rem">${h(err.message)}</div>`;
        }
      });

      // Allow pressing Enter in the email field to submit
      document.getElementById('member-email')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('add-btn')?.click();
        }
      });
    });
  }
}

init();
