import { requireAuth } from '../auth.js';
import { getUsers, updateUserRole, updateUserStatus, getNotifications } from '../api.js';
import { h, formatDate, renderNavbar, showError, showConfirmModal } from '../ui.js';

async function init() {
  const me = await requireAuth();
  if (!me) return;
  if (me.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  const app = document.getElementById('app');
  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(me, unread);

  // ── filter state ───────────────────────────────────────────────────────────
  let filterRole   = '';
  let filterActive = '';   // '' = ทั้งหมด, '1' = ใช้งาน, '0' = ไม่ใช้งาน

  let allUsers = [];

  // ── load ───────────────────────────────────────────────────────────────────
  async function loadUsers() {
    app.innerHTML = '<p class="loading-text">กำลังโหลด...</p>';
    try {
      const res = await getUsers({ limit: 100 });
      allUsers = res?.data ?? [];
      renderPage();
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  // ── filtered view ──────────────────────────────────────────────────────────
  function filteredUsers() {
    return allUsers.filter(u => {
      if (filterRole   && u.role !== filterRole)            return false;
      if (filterActive === '1' && !(u.is_active === 1 || u.is_active === true))  return false;
      if (filterActive === '0' && !(u.is_active === 0 || u.is_active === false)) return false;
      return true;
    });
  }

  // ── render ─────────────────────────────────────────────────────────────────
  function renderPage() {
    const users = filteredUsers();

    app.innerHTML = `
      <!-- Header -->
      <div class="page-header">
        <h1 class="page-title">จัดการผู้ใช้</h1>
      </div>

      <!-- Filters -->
      <div class="filter-row" style="display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem;align-items:center">
        <select class="filter-select" id="filter-role">
          <option value="">ทุกบทบาท</option>
          <option value="user"  ${filterRole === 'user'  ? 'selected' : ''}>ผู้ใช้</option>
          <option value="admin" ${filterRole === 'admin' ? 'selected' : ''}>ผู้ดูแลระบบ</option>
        </select>
        <select class="filter-select" id="filter-active">
          <option value=""  ${filterActive === ''  ? 'selected' : ''}>ทุกสถานะ</option>
          <option value="1" ${filterActive === '1' ? 'selected' : ''}>ใช้งาน</option>
          <option value="0" ${filterActive === '0' ? 'selected' : ''}>ไม่ใช้งาน</option>
        </select>
      </div>

      <!-- Table -->
      <div class="table-wrap">
        ${users.length === 0
          ? '<p class="empty-text">ไม่พบผู้ใช้</p>'
          : `<table class="data-table">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>อีเมล</th>
                  <th>ชื่อเล่น</th>
                  <th>ภาควิชา</th>
                  <th>สถานะ</th>
                  <th>บทบาท</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => {
                  const isSelf   = u.id === me.id;
                  const isActive = u.is_active === 1 || u.is_active === true;
                  return `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:.5rem">
                          <div class="nav-avatar-placeholder" style="width:30px;height:30px;font-size:.82rem;flex-shrink:0">
                            ${h((u.name ?? '?').charAt(0).toUpperCase())}
                          </div>
                          <span>${h(u.name ?? '-')}</span>
                          ${isSelf ? '<span style="font-size:.72rem;color:var(--primary);margin-left:.3rem">(คุณ)</span>' : ''}
                        </div>
                      </td>
                      <td>${h(u.email ?? '-')}</td>
                      <td>${h(u.nickname ?? '-')}</td>
                      <td>${h(u.department ?? '-')}</td>
                      <td>
                        ${isActive
                          ? '<span class="badge" style="background:var(--success);color:#fff">ใช้งาน</span>'
                          : '<span class="badge" style="background:var(--text-muted);color:#fff">ไม่ใช้งาน</span>'}
                      </td>
                      <td>
                        <select class="role-select" data-uid="${h(String(u.id))}"
                          ${isSelf ? 'disabled title="ไม่สามารถเปลี่ยนบทบาทของตัวเองได้"' : ''}>
                          <option value="user"  ${u.role === 'user'  ? 'selected' : ''}>ผู้ใช้</option>
                          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>ผู้ดูแลระบบ</option>
                        </select>
                      </td>
                      <td>
                        ${!isSelf ? `
                          <button class="btn btn-sm do-toggle-status"
                            data-uid="${h(String(u.id))}"
                            data-active="${isActive ? '1' : '0'}"
                            style="${isActive
                              ? 'color:var(--error);border-color:var(--error)'
                              : 'color:var(--success);border-color:var(--success)'}">
                            ${isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          </button>` : '<span style="color:var(--text-muted);font-size:.82rem">—</span>'}
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>`}
      </div>`;

    bindEvents();
  }

  // ── bind ───────────────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('filter-role').addEventListener('change', e => {
      filterRole = e.target.value; renderPage();
    });
    document.getElementById('filter-active').addEventListener('change', e => {
      filterActive = e.target.value; renderPage();
    });

    // Role change
    document.querySelectorAll('.role-select').forEach(sel => {
      sel.dataset.prev = sel.value;
      sel.addEventListener('change', async e => {
        const uid     = sel.dataset.uid;
        const newRole = e.target.value;
        const prev    = sel.dataset.prev;
        try {
          await updateUserRole(uid, newRole);
          // update local copy
          allUsers = allUsers.map(u =>
            String(u.id) === uid ? { ...u, role: newRole } : u
          );
          sel.dataset.prev = newRole;
        } catch (err) {
          alert(err.message);
          sel.value = prev;
        }
      });
    });

    // Toggle status
    document.querySelectorAll('.do-toggle-status').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid      = btn.dataset.uid;
        const isActive = btn.dataset.active === '1';
        const action   = isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน';
        const u        = allUsers.find(x => String(x.id) === uid);
        showConfirmModal(`${action}ผู้ใช้ "${u?.name ?? uid}"?`, async () => {
          btn.disabled = true;
          try {
            await updateUserStatus(uid, !isActive);
            allUsers = allUsers.map(x =>
              String(x.id) === uid ? { ...x, is_active: isActive ? 0 : 1 } : x
            );
            renderPage();
          } catch (err) {
            showError(err.message);
            btn.disabled = false;
          }
        }, { confirmLabel: action });
      });
    });
  }

  // ── kick off ───────────────────────────────────────────────────────────────
  await loadUsers();
}

init();
