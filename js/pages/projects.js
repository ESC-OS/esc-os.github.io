import { requireAuth } from '../auth.js';
import { getProjects, getNotifications } from '../api.js';
import { h, formatDate, renderNavbar } from '../ui.js';
import { openProjectModal } from '../forms.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  let projects;
  try {
    const res = await getProjects({ limit: 100 });
    projects = res?.data ?? [];
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    return;
  }

  function projectCard(p) {
    const isLeader = p.leader_id === user.id;
    const orgLabel = h(p.org_type || p.organization_type || '');
    const desc = h(p.description || '');
    return `
      <a href="project-detail.html?id=${h(p.id)}" class="project-card">
        <div style="flex:1;min-width:0">
          <div class="project-card-name">
            ${h(p.name)}
            ${isLeader ? `<span class="member-role" style="margin-left:.4rem;font-size:.72rem;color:var(--primary);border-color:var(--primary)">หัวหน้า</span>` : ''}
          </div>
          ${orgLabel ? `<div class="project-card-meta">${orgLabel}</div>` : ''}
          ${desc ? `<div style="font-size:.82rem;color:var(--text-muted);margin-top:.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:480px">${desc}</div>` : ''}
        </div>
        <div class="project-card-dates">
          <div>${formatDate(p.start_date)}</div>
          <div>– ${formatDate(p.end_date)}</div>
          <div style="margin-top:.3rem;font-size:.78rem">${h(String(p.member_count ?? 0))} สมาชิก</div>
        </div>
      </a>`;
  }

  function onCreated(newProj) {
    if (newProj?.id) {
      window.location.href = `project-detail.html?id=${encodeURIComponent(newProj.id)}`;
    } else {
      init();
    }
  }

  if (projects.length === 0) {
    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">โครงการของฉัน</h1>
        <button class="btn btn-primary" id="btn-new-proj-hdr">+ สร้างโครงการ</button>
      </div>
      <div class="card" style="text-align:center;padding:3rem 1.5rem">
        <div style="font-size:2.5rem;margin-bottom:.75rem">📂</div>
        <p style="color:var(--text-muted);margin-bottom:1.25rem">ยังไม่มีโครงการ</p>
        <button class="btn btn-primary" id="btn-new-proj-empty">+ สร้างโครงการ</button>
      </div>`;

    document.getElementById('btn-new-proj-hdr')?.addEventListener('click', () => openProjectModal({ onSuccess: onCreated }));
    document.getElementById('btn-new-proj-empty')?.addEventListener('click', () => openProjectModal({ onSuccess: onCreated }));
    return;
  }

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">โครงการของฉัน</h1>
      <button class="btn btn-primary" id="btn-new-proj">+ สร้างโครงการ</button>
    </div>
    <div class="project-list">
      ${projects.map(p => projectCard(p)).join('')}
    </div>`;

  document.getElementById('btn-new-proj')?.addEventListener('click', () => openProjectModal({ onSuccess: onCreated }));
}

init();
