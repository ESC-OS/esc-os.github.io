import { requireAuth } from '../auth.js';
import { getSlots, createSlot, updateSlot, deleteSlot, getNotifications } from '../api.js';
import { h, renderNavbar, showError, showConfirmModal } from '../ui.js';

const DAYS = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') {
    window.location.href = 'dashboard.html'; return;
  }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  let allSlots = [];

  async function loadAndRender() {
    try {
      const res = await getSlots();
      allSlots = res?.data ?? [];
    } catch (err) {
      showError('โหลดช่วงเวลาไม่สำเร็จ: ' + err.message);
      allSlots = [];
    }
    render();
  }

  function slotTable(slots, serviceType) {
    const dayOptions = DAYS.slice(1).map((name, i) =>
      `<option value="${i + 1}">${name}</option>`
    ).join('');

    const rows = slots.map(s => `
      <tr>
        <td>${h(DAYS[s.day_of_week] ?? String(s.day_of_week))}</td>
        <td>${h(s.time ?? '-')}</td>
        <td>${h(String(s.capacity ?? '-'))}</td>
        <td>
          <label style="display:inline-flex;align-items:center;gap:.4rem;cursor:pointer;">
            <input type="checkbox" class="slot-active-toggle"
              data-id="${h(String(s.id))}"
              ${s.is_active ? 'checked' : ''}
              style="accent-color:var(--primary);width:16px;height:16px;">
            <span style="font-size:.85rem;color:${s.is_active ? 'var(--success)' : 'var(--text-muted)'}">
              ${s.is_active ? 'เปิด' : 'ปิด'}
            </span>
          </label>
        </td>
        <td>
          <button class="btn btn-danger btn-sm slot-delete-btn"
            data-id="${h(String(s.id))}"
            data-label="${h(DAYS[s.day_of_week] ?? String(s.day_of_week))} ${h(s.time ?? '')}">ลบ</button>
        </td>
      </tr>
    `).join('');

    return `
      <div class="table-wrap" style="margin-bottom:1rem;">
        <table class="data-table">
          <thead>
            <tr>
              <th>วัน</th>
              <th>เวลา</th>
              <th>ความจุ</th>
              <th>สถานะ</th>
              <th>ลบ</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">ไม่มีช่วงเวลา</td></tr>`}
          </tbody>
        </table>
      </div>
      <!-- Add slot inline form -->
      <div class="inline-row" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end;">
        <select class="form-select slot-new-day" data-service="${h(serviceType)}" style="min-width:100px;">
          ${dayOptions}
        </select>
        <input type="time" class="form-input slot-new-time" data-service="${h(serviceType)}" style="min-width:120px;">
        <input type="number" class="form-input slot-new-cap" data-service="${h(serviceType)}"
          min="1" placeholder="ความจุ" style="min-width:90px;max-width:110px;">
        <button class="btn btn-primary btn-sm slot-add-btn" data-service="${h(serviceType)}">+ เพิ่มช่วงเวลา</button>
        <span class="slot-add-error" data-service="${h(serviceType)}" style="color:var(--error);font-size:.85rem;"></span>
      </div>
    `;
  }

  function render() {
    const borrowSlots = allSlots.filter(s => s.service_type === 'borrow');
    const visitSlots  = allSlots.filter(s => s.service_type === 'visit');

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">ช่วงเวลาปฏิบัติการ</h1>
      </div>

      <div class="admin-grid">
        <!-- Borrow slots -->
        <div class="card">
          <div class="card-title">ช่วงยืม-คืน</div>
          <div id="borrow-slots-area">
            ${slotTable(borrowSlots, 'borrow')}
          </div>
        </div>

        <!-- Visit slots -->
        <div class="card">
          <div class="card-title">ช่วงเยี่ยมชม</div>
          <div id="visit-slots-area">
            ${slotTable(visitSlots, 'visit')}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Toggle active status immediately on checkbox change
    document.querySelectorAll('.slot-active-toggle').forEach(cb => {
      cb.addEventListener('change', async () => {
        const id = cb.dataset.id;
        const newActive = cb.checked;
        cb.disabled = true;
        try {
          await updateSlot(id, { is_active: newActive });
          // Update local state
          const slot = allSlots.find(s => String(s.id) === id);
          if (slot) slot.is_active = newActive;
          // Update label text next to checkbox
          const label = cb.nextElementSibling;
          if (label) {
            label.textContent = newActive ? 'เปิด' : 'ปิด';
            label.style.color = newActive ? 'var(--success)' : 'var(--text-muted)';
          }
        } catch (err) {
          showError('แก้ไขสถานะไม่สำเร็จ: ' + err.message);
          cb.checked = !newActive; // revert
        } finally {
          cb.disabled = false;
        }
      });
    });

    // Delete slot
    document.querySelectorAll('.slot-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirmModal(`ลบช่วงเวลา "${btn.dataset.label}"?`, async () => {
          btn.disabled = true;
          try {
            await deleteSlot(btn.dataset.id);
            await loadAndRender();
          } catch (err) {
            showError('ลบช่วงเวลาไม่สำเร็จ: ' + err.message);
            btn.disabled = false;
          }
        }, { title: 'ยืนยันการลบ', confirmLabel: 'ลบ', confirmClass: 'btn-danger' });
      });
    });

    // Add slot
    document.querySelectorAll('.slot-add-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const serviceType = btn.dataset.service;
        const dayEl  = document.querySelector(`.slot-new-day[data-service="${serviceType}"]`);
        const timeEl = document.querySelector(`.slot-new-time[data-service="${serviceType}"]`);
        const capEl  = document.querySelector(`.slot-new-cap[data-service="${serviceType}"]`);
        const errEl  = document.querySelector(`.slot-add-error[data-service="${serviceType}"]`);

        const day  = dayEl?.value;
        const time = timeEl?.value?.trim();
        const cap  = capEl?.value?.trim();

        errEl.textContent = '';

        if (!time) {
          errEl.textContent = 'กรุณาระบุเวลา';
          return;
        }

        btn.disabled = true;
        btn.textContent = 'กำลังบันทึก…';

        const data = {
          service_type: serviceType,
          day_of_week:  Number(day),
          time,
        };
        if (cap) data.capacity = Number(cap);

        try {
          await createSlot(data);
          await loadAndRender();
        } catch (err) {
          errEl.textContent = err.message;
          btn.disabled = false;
          btn.textContent = '+ เพิ่มช่วงเวลา';
        }
      });
    });
  }

  await loadAndRender();
}

init();

