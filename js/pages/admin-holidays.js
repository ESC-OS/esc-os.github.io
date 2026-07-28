import { requireAuth } from '../auth.js';
import { getHolidays, createHoliday, deleteHoliday, getNotifications } from '../api.js';
import { h, formatDate, renderNavbar, showError } from '../ui.js';
import { initDatePickers } from '../datepicker.js';

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

  const thisYear = new Date().getFullYear();
  let currentYear = thisYear;
  let holidays = [];

  async function loadHolidays() {
    try {
      const res = await getHolidays(currentYear);
      holidays = res?.data ?? [];
    } catch (err) {
      holidays = [];
      showError('โหลดวันหยุดไม่สำเร็จ: ' + err.message);
    }
    render();
  }

  function render() {
    const sorted = [...holidays].sort((a, b) => (a.date > b.date ? 1 : -1));

    // Year select options: current year ± 2
    const yearOptions = [-2, -1, 0, 1, 2].map(offset => {
      const y = thisYear + offset;
      const selected = y === currentYear ? 'selected' : '';
      return `<option value="${y}" ${selected}>พ.ศ. ${y + 543} (ค.ศ. ${y})</option>`;
    }).join('');

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">วันหยุดราชการ</h1>
      </div>

      <!-- Year selector -->
      <div class="card" style="margin-bottom:1.25rem;">
        <div class="card-title">เลือกปี</div>
        <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;">
          <select class="form-select" id="year-select" style="min-width:200px;">
            ${yearOptions}
          </select>
        </div>
      </div>

      <!-- Add holiday form -->
      <div class="card" style="margin-bottom:1.25rem;">
        <div class="card-title">เพิ่มวันหยุด</div>
        <div class="form-row" style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end;">
          <div class="form-group" style="margin-bottom:0;flex:0 0 auto;">
            <label class="form-label">วันที่</label>
            <input type="date" class="form-input" id="new-date" style="min-width:160px;">
          </div>
          <div class="form-group" style="margin-bottom:0;flex:1 1 200px;">
            <label class="form-label">ชื่อวันหยุด</label>
            <input type="text" class="form-input" id="new-name"
              placeholder="เช่น วันสงกรานต์" autocomplete="off">
          </div>
          <button class="btn btn-primary" id="btn-add-holiday">+ บันทึก</button>
        </div>
        <div id="add-error" style="margin-top:.5rem;"></div>
      </div>

      <!-- Holiday list -->
      <div class="card">
        <div class="card-title">รายการวันหยุด ปี พ.ศ. ${currentYear + 543} (${sorted.length} วัน)</div>
        <div id="list-error"></div>
        ${sorted.length === 0
          ? '<p style="color:var(--text-muted);text-align:center;padding:1rem 0;">ไม่มีวันหยุดในปีนี้</p>'
          : `<div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>ชื่อวันหยุด</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${sorted.map(holiday => `
                    <tr>
                      <td>${h(formatDate(holiday.date))}</td>
                      <td>${h(holiday.name)}</td>
                      <td>
                        <button class="btn btn-danger btn-sm delete-holiday-btn"
                          data-id="${h(String(holiday.id))}"
                          data-name="${h(holiday.name)}">ลบ</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>`}
      </div>
    `;

    initDatePickers(app);
    bindEvents();
  }

  function bindEvents() {
    // Year select change → reload
    document.getElementById('year-select').addEventListener('change', e => {
      currentYear = Number(e.target.value);
      loadHolidays();
    });

    // Add holiday
    document.getElementById('btn-add-holiday').addEventListener('click', async () => {
      const errEl = document.getElementById('add-error');
      const date  = (document.getElementById('new-date').value ?? '').trim();
      const name  = (document.getElementById('new-name').value ?? '').trim();
      errEl.innerHTML = '';

      if (!date) {
        errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันที่</div>';
        return;
      }
      if (!name) {
        errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุชื่อวันหยุด</div>';
        return;
      }

      const btn = document.getElementById('btn-add-holiday');
      btn.disabled = true;
      btn.textContent = 'กำลังบันทึก…';

      try {
        await createHoliday({ date, name });
        await loadHolidays();
      } catch (err) {
        errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = '+ บันทึก';
      }
    });

    // Delete holiday
    document.querySelectorAll('.delete-holiday-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const holidayId   = btn.dataset.id;
        const holidayName = btn.dataset.name;
        if (!confirm(`ลบวันหยุด "${holidayName}"?`)) return;
        btn.disabled = true;
        try {
          await deleteHoliday(holidayId);
          await loadHolidays();
        } catch (err) {
          const listErr = document.getElementById('list-error');
          if (listErr) listErr.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false;
        }
      });
    });
  }

  await loadHolidays();
}

init();

