import { requireAuth } from '../auth.js';
import { getItem, getStockLogs, manageStock, getNotifications } from '../api.js';
import { h, formatDateTime, renderNavbar, showError } from '../ui.js';

const ACTION_META = {
  add:                  { label: 'เพิ่มสต็อก',      color: 'var(--success)', noteRequired: false },
  remove:               { label: 'นำออก',            color: 'var(--error)',   noteRequired: false },
  send_to_repair:       { label: 'ส่งซ่อม',          color: 'var(--warning)', noteRequired: true  },
  restore_from_repair:  { label: 'รับคืนจากซ่อม',   color: 'var(--info)',    noteRequired: false },
};

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  const params = new URLSearchParams(window.location.search);
  const id     = params.get('id');
  if (!id) { window.location.href = 'admin-items.html'; return; }

  const app = document.getElementById('app');
  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  async function renderPage() {
    app.innerHTML = '<p class="loading-text">กำลังโหลด...</p>';
    let item, logs;
    try {
      const [itemRes, logsRes] = await Promise.all([getItem(id), getStockLogs(id)]);
      item = itemRes.data ?? itemRes;
      logs = logsRes.data ?? logsRes ?? [];
    } catch (err) {
      app.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    app.innerHTML = `
      <!-- Back -->
      <div style="margin-bottom:1rem">
        <a href="admin-items.html" class="btn btn-secondary btn-sm">← จัดการอุปกรณ์</a>
      </div>

      <!-- Item header -->
      <div class="page-header">
        <h1 class="page-title">สต็อก: ${h(item.name)}</h1>
      </div>

      <!-- Stats -->
      <div class="admin-stats" style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">
        <div class="admin-stat card" style="flex:1;min-width:100px;text-align:center">
          <div class="admin-stat-label" style="font-size:.82rem;color:var(--text-muted)">ทั้งหมด</div>
          <div class="admin-stat-value" style="font-size:2rem;font-weight:700">${item.total_quantity}</div>
        </div>
        <div class="admin-stat card" style="flex:1;min-width:100px;text-align:center">
          <div class="admin-stat-label" style="font-size:.82rem;color:var(--text-muted)">พร้อมใช้</div>
          <div class="admin-stat-value" style="font-size:2rem;font-weight:700;color:var(--success)">${item.available_quantity}</div>
        </div>
        <div class="admin-stat card" style="flex:1;min-width:100px;text-align:center">
          <div class="admin-stat-label" style="font-size:.82rem;color:var(--text-muted)">กำลังซ่อม</div>
          <div class="admin-stat-value" style="font-size:2rem;font-weight:700;color:var(--error)">${item.repair_quantity}</div>
        </div>
      </div>

      <!-- Error placeholder -->
      <div id="stock-error"></div>

      <!-- Actions grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:1.5rem">
        ${Object.entries(ACTION_META).map(([action, meta]) => `
          <div class="card" style="display:flex;flex-direction:column;gap:.6rem">
            <div class="card-title" style="color:${meta.color};margin-bottom:0">${meta.label}</div>
            <input type="number" class="form-input stock-qty" id="${action}-qty" min="1" value="1" placeholder="จำนวน">
            <input class="form-input stock-note" id="${action}-note"
              placeholder="${meta.noteRequired ? 'เหตุผล (จำเป็น)' : 'หมายเหตุ (ถ้ามี)'}">
            <button class="btn btn-sm do-stock-action" data-action="${action}"
              style="background:${meta.color};color:#fff;border:none">${meta.label}</button>
          </div>`).join('')}
      </div>

      <!-- Log table -->
      <div class="card">
        <div class="card-title">ประวัติสต็อก</div>
        ${logs.length === 0
          ? '<p class="empty-text">ยังไม่มีประวัติ</p>'
          : `<div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>การดำเนินการ</th>
                    <th>จำนวน</th>
                    <th>หมายเหตุ</th>
                    <th>โดย</th>
                  </tr>
                </thead>
                <tbody>
                  ${logs.map(l => {
                    const meta = ACTION_META[l.action];
                    const delta = l.quantity_delta > 0 ? `+${l.quantity_delta}` : String(l.quantity_delta);
                    return `
                      <tr>
                        <td style="font-size:.8rem;white-space:nowrap">${formatDateTime(l.created_at)}</td>
                        <td>
                          <span class="log-action-${h(l.action)}"
                            style="color:${meta ? meta.color : 'inherit'};font-weight:600;font-size:.85rem">
                            ${h(meta ? meta.label : l.action)}
                          </span>
                        </td>
                        <td style="font-weight:600;color:${l.quantity_delta >= 0 ? 'var(--success)' : 'var(--error)'}">${delta}</td>
                        <td>${h(l.note ?? '-')}</td>
                        <td>${h(l.admin_name ?? '-')}</td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`}
      </div>`;

    // ── bind action buttons ──────────────────────────────────────────────────
    document.querySelectorAll('.do-stock-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action       = btn.dataset.action;
        const meta         = ACTION_META[action];
        const qtyInput     = document.getElementById(`${action}-qty`);
        const noteInput    = document.getElementById(`${action}-note`);
        const qty          = parseInt(qtyInput.value, 10);
        const note         = noteInput.value.trim();
        const errEl        = document.getElementById('stock-error');
        errEl.innerHTML    = '';

        if (!qty || qty < 1) {
          errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุจำนวนที่ถูกต้อง</div>';
          return;
        }
        if (meta.noteRequired && !note) {
          errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุเหตุผล</div>';
          return;
        }

        btn.disabled = true; btn.textContent = 'กำลังดำเนินการ...';
        try {
          await manageStock(id, { action, quantity: qty, note: note || undefined });
          await renderPage();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = meta.label;
        }
      });
    });
  }

  await renderPage();
}

init();
