import { requireAuth } from '../auth.js';
import { getProjects } from '../api.js';
import { h, formatDate } from '../ui.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const app = document.getElementById('app');
  const { projects } = await getProjects();

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">โครงการของฉัน</h1>
      <a href="/project-form/" class="btn btn-primary">+ สร้างโครงการ</a>
    </div>
    ${projects.length === 0 ? `
      <div class="card" style="max-width:560px;text-align:center;padding:3rem 2rem">
        <div style="margin-bottom:1rem;color:var(--border-strong)"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
        <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:.5rem">ยังไม่มีโครงการ</h2>
        <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:1.5rem;line-height:1.7">
          ก่อนจะยืมอุปกรณ์ คุณต้องสร้างโครงการก่อน<br>
          โครงการคือกิจกรรมหรืองานที่ต้องใช้อุปกรณ์
        </p>
        <a href="/project-form/" class="btn btn-primary">สร้างโครงการแรก</a>
      </div>` : `
      <div class="project-list">
        ${projects.map(p => `
          <a href="/project-detail/?id=${h(p.id)}" class="project-card">
            <div>
              <div class="project-card-name">${h(p.name)}</div>
              ${p.group ? `<div class="project-card-meta">กลุ่ม ${h(p.group)}${p.in_charge_person ? ` · ${h(p.in_charge_person)}` : ''}</div>` : p.in_charge_person ? `<div class="project-card-meta">ผู้รับผิดชอบ: ${h(p.in_charge_person)}</div>` : ''}
              <div class="project-card-meta" style="margin-top:.2rem">ผู้รับผิดชอบ: ${h(p.owner_name)}</div>
            </div>
            <div class="project-card-dates">
              <div>${formatDate(p.start_date)}</div>
              <div>→ ${formatDate(p.end_date)}</div>
            </div>
          </a>`).join('')}
      </div>`}`;
}
init();
