import { requireAuth } from '../auth.js';
import {
  getHolidays, createHoliday, deleteHoliday,
  createRecurringHoliday,
  getNotifications,
} from '../api.js';
import { h, formatDate, renderNavbar, showError, showConfirmModal } from '../ui.js';
import { initDatePickers } from '../datepicker.js';

const THAI_MONTHS = [
  '', 'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
];

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  const thisYear  = new Date().getFullYear();
  let currentYear = thisYear;
  let holidays    = [];
  let addMode     = 'oneoff'; // 'oneoff' | 'recurring'

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

    const yearOptions = [-2, -1, 0, 1, 2].map(offset => {
      const y = thisYear + offset;
      return `<option value="${y}"${y === currentYear ? ' selected' : ''}>พ.ศ. ${y + 543} (ค.ศ. ${y})</option>`;
    }).join('');

    const monthOptions = THAI_MONTHS.slice(1).map((name, i) =>
      `<option value="${i + 1}">${i + 1} – ${name}</option>`
    ).join('');

    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">วันหยุดราชการ</h1>
      </div>

      <!-- Year selector -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">เลือกปี</div>
        <select class="form-select" id="year-select" style="min-width:200px">
          ${yearOptions}
        </select>
      </div>

      <!-- Add holiday form with mode toggle -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">เพิ่มวันหยุด</div>
        <div style="display:flex;gap:.4rem;margin-bottom:1rem">
          <button class="btn btn-sm${addMode === 'oneoff' ? ' btn-primary' : ' btn-secondary'}" id="mode-oneoff">เฉพาะครั้ง</button>
          <button class="btn btn-sm${addMode === 'recurring' ? ' btn-primary' : ' btn-secondary'}" id="mode-recurring">ซ้ำทุกปี</button>
        </div>

        ${addMode === 'oneoff' ? `
        <div class="form-row" style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end">
          <div class="form-group" style="margin-bottom:0;flex:0 0 auto">
            <label class="form-label">วันที่</label>
            <input type="date" class="form-input" id="new-date" style="min-width:160px">
          </div>
          <div class="form-group" style="margin-bottom:0;flex:1 1 200px">
            <label class="form-label">ชื่อวันหยุด</label>
            <input type="text" class="form-input" id="new-name" placeholder="เช่น วันสงกรานต์" autocomplete="off">
          </div>
          <button class="btn btn-primary" id="btn-add-holiday">+ บันทึก</button>
        </div>` : `
        <div class="form-row" style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end">
          <div class="form-group" style="margin-bottom:0;flex:0 0 auto">
            <label class="form-label">เดือน</label>
            <select class="form-select" id="new-month" style="min-width:150px">
              ${monthOptions}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;flex:0 0 auto">
            <label class="form-label">วันที่</label>
            <input type="number" class="form-input" id="new-day" min="1" max="31" placeholder="1–31" style="width:90px">
          </div>
          <div class="form-group" style="margin-bottom:0;flex:1 1 200px">
            <label class="form-label">ชื่อวันหยุด</label>
            <input type="text" class="form-input" id="new-rec-name" placeholder="เช่น วันขึ้นปีใหม่" autocomplete="off">
          </div>
          <button class="btn btn-primary" id="btn-add-recurring">+ บันทึก</button>
        </div>`}
        <div id="add-error" style="margin-top:.5rem"></div>
      </div>

      <!-- Holiday list for selected year -->
      <div class="card">
        <div class="card-title">วันหยุดปี พ.ศ. ${currentYear + 543} (${sorted.length} วัน)</div>
        <div id="list-error"></div>
        ${sorted.length === 0
          ? '<p style="color:var(--text-muted);text-align:center;padding:1rem 0">ไม่มีวันหยุดในปีนี้</p>'
          : `<div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr><th>วันที่</th><th>ชื่อวันหยุด</th><th>ประเภท</th><th></th></tr>
                </thead>
                <tbody>
                  ${sorted.map(hd => `
                    <tr>
                      <td style="white-space:nowrap">${h(formatDate(hd.date))}</td>
                      <td>${h(hd.name)}</td>
                      <td>
                        ${hd.is_recurring
                          ? '<span class="badge badge-confirmed" style="font-size:.72rem">ซ้ำทุกปี</span>'
                          : '<span style="font-size:.75rem;color:var(--text-muted)">เฉพาะครั้ง</span>'}
                      </td>
                      <td>
                        <button class="btn btn-danger btn-sm delete-holiday-btn"
                          data-id="${h(String(hd.id))}"
                          data-name="${h(hd.name)}"
                          data-recurring="${hd.is_recurring ? '1' : '0'}">ลบ</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>`}
      </div>`;

    initDatePickers(app);
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('year-select').addEventListener('change', e => {
      currentYear = Number(e.target.value);
      loadHolidays();
    });

    document.getElementById('mode-oneoff').addEventListener('click', () => {
      addMode = 'oneoff'; render();
    });
    document.getElementById('mode-recurring').addEventListener('click', () => {
      addMode = 'recurring'; render();
    });

    // Add one-off
    document.getElementById('btn-add-holiday')?.addEventListener('click', async () => {
      const errEl = document.getElementById('add-error');
      const date  = (document.getElementById('new-date').value ?? '').trim();
      const name  = (document.getElementById('new-name').value ?? '').trim();
      errEl.innerHTML = '';
      if (!date) { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันที่</div>'; return; }
      if (!name) { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุชื่อวันหยุด</div>'; return; }
      const btn = document.getElementById('btn-add-holiday');
      btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
      try {
        await createHoliday({ date, name });
        await loadHolidays();
      } catch (err) {
        errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false; btn.textContent = '+ บันทึก';
      }
    });

    // Add recurring
    document.getElementById('btn-add-recurring')?.addEventListener('click', async () => {
      const errEl = document.getElementById('add-error');
      const month = parseInt(document.getElementById('new-month').value, 10);
      const day   = parseInt(document.getElementById('new-day').value, 10);
      const name  = (document.getElementById('new-rec-name').value ?? '').trim();
      errEl.innerHTML = '';
      if (!day || day < 1 || day > 31) { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุวันที่ (1–31)</div>'; return; }
      if (!name) { errEl.innerHTML = '<div class="alert alert-error">กรุณาระบุชื่อวันหยุด</div>'; return; }
      const btn = document.getElementById('btn-add-recurring');
      btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
      try {
        await createRecurringHoliday({ month, day, name });
        await loadHolidays();
      } catch (err) {
        errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        btn.disabled = false; btn.textContent = '+ บันทึก';
      }
    });

    // Delete (one-off or recurring)
    document.querySelectorAll('.delete-holiday-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const isRecurring = btn.dataset.recurring === '1';
        const msg = isRecurring
          ? `ลบ "${btn.dataset.name}" ออกจากวันหยุดซ้ำทุกปี?\nจะมีผลกับทุกปีในอนาคต`
          : `ลบวันหยุด "${btn.dataset.name}"?`;
        showConfirmModal(msg, async () => {
          btn.disabled = true;
          try {
            await deleteHoliday(btn.dataset.id);
            await loadHolidays();
          } catch (err) {
            const el = document.getElementById('list-error');
            if (el) el.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
            btn.disabled = false;
          }
        }, { title: 'ยืนยันการลบ', confirmLabel: 'ลบ', confirmClass: 'btn-danger' });
      });
    });
  }

  await loadHolidays();
}

init();
