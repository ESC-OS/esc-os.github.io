import { requireAuth } from '../auth.js';
import {
  getRequests, getNotifications,
  getAllReturns, getReturn, confirmReturn,
  getVisits, confirmVisit, rejectVisit, completeVisit, cancelVisit,
  getDeposits, getDeposit, approveDeposit, rejectDeposit,
  getStorageAreas, approveStorageArea, rejectStorageArea,
  getDonations, getDonation, approveDonation, rejectDonation, reviewDonationItem, completeDonation,
} from '../api.js';
import { h, statusBadge, formatDate, formatDateTime, renderNavbar, openModal, loadAuthPhotos, showConfirmModal, showError } from '../ui.js';

const REQUEST_STATUS_OPTS = [
  ['pending',          'รอดำเนินการ'],
  ['processing',       'กำลังดำเนินการ'],
  ['ready_for_pickup', 'พร้อมรับ'],
  ['in_lend',          'กำลังยืม'],
  ['returned',         'คืนแล้ว'],
  ['completed',        'เสร็จสิ้น'],
  ['rejected',         'ถูกปฏิเสธ'],
  ['cancelled',        'ยกเลิกแล้ว'],
  ['',                 'ทุกสถานะ'],
];

const VISIT_STATUS_OPTS = [
  ['pending',   'รอยืนยัน'],
  ['confirmed', 'ยืนยันแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['cancelled', 'ยกเลิกแล้ว'],
  ['rejected',  'ถูกปฏิเสธ'],
  ['',          'ทุกสถานะ'],
];

const DEPOSIT_STATUS_OPTS = [
  ['pending',   'รอดำเนินการ'],
  ['approved',  'อนุมัติแล้ว'],
  ['rejected',  'ถูกปฏิเสธ'],
  ['deposited', 'รับฝากแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['',          'ทุกสถานะ'],
];

const STORAGE_STATUS_OPTS = [
  ['pending',   'รอดำเนินการ'],
  ['approved',  'อนุมัติแล้ว'],
  ['rejected',  'ถูกปฏิเสธ'],
  ['in_use',    'กำลังใช้งาน'],
  ['completed', 'เสร็จสิ้น'],
  ['',          'ทุกสถานะ'],
];

const DONATION_STATUS_OPTS = [
  ['pending',   'รอดำเนินการ'],
  ['approved',  'อนุมัติแล้ว'],
  ['rejected',  'ถูกปฏิเสธ'],
  ['donated',   'บริจาคแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['',          'ทุกสถานะ'],
];

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  const app = document.getElementById('app');
  const unread = await getNotifications(1, 1).then(r => r?.pagination?.unread ?? 0).catch(() => 0);
  renderNavbar(user, unread);

  let activeTab     = 'requests';
  let reqStatus     = 'pending';
  let visitStatus   = 'pending';
  let depositStatus = 'pending';
  let storageStatus = 'pending';
  let donationStatus = 'pending';
  let counts = { requests: 0, returns: 0, visits: 0, deposits: 0, storage: 0, donations: 0 };

  // ── Count badges ───────────────────────────────────────────────────────────
  async function loadCounts() {
    const [rq, rt, vsPend, vsConf, dp, sa, dn] = await Promise.allSettled([
      getRequests({ limit: 100, status: 'pending' }),
      getAllReturns('pending'),
      getVisits({ limit: 100, status: 'pending' }),
      getVisits({ limit: 100, status: 'confirmed' }),
      getDeposits({ limit: 100, status: 'pending' }),
      getStorageAreas({ limit: 100, status: 'pending' }),
      getDonations({ limit: 100, status: 'pending' }),
    ]);
    counts.requests  = rq.status     === 'fulfilled' ? (rq.value?.data?.length     ?? 0) : 0;
    counts.returns   = rt.status     === 'fulfilled' ? (rt.value?.data?.length     ?? 0) : 0;
    counts.visits    = (vsPend.status === 'fulfilled' ? (vsPend.value?.data?.length ?? 0) : 0)
                     + (vsConf.status === 'fulfilled' ? (vsConf.value?.data?.length ?? 0) : 0);
    counts.deposits  = dp.status     === 'fulfilled' ? (dp.value?.data?.length     ?? 0) : 0;
    counts.storage   = sa.status     === 'fulfilled' ? (sa.value?.data?.length     ?? 0) : 0;
    counts.donations = dn.status     === 'fulfilled' ? (dn.value?.data?.length     ?? 0) : 0;
  }

  function updateBadge(tab, n) {
    const btn = document.querySelector(`.queue-tab-btn[data-tab="${tab}"]`);
    if (!btn) return;
    const span = btn.querySelector('.queue-tab-count');
    if (!span) return;
    span.textContent = n;
    span.className = `queue-tab-count${n === 0 ? ' zero' : ''}`;
  }

  // ── Shell ──────────────────────────────────────────────────────────────────
  function renderShell() {
    app.innerHTML = `
      <div class="page-header" style="margin-bottom:1.25rem">
        <h1 class="page-title">จัดการคำขอ</h1>
      </div>
      <div class="queue-tabs">
        ${tabBtn('requests',  'คำขอยืม',      counts.requests)}
        ${tabBtn('returns',   'การคืน',         counts.returns)}
        ${tabBtn('visits',    'นัดชม',          counts.visits)}
        ${tabBtn('deposits',  'ฝากชั่วคราว',   counts.deposits)}
        ${tabBtn('storage',   'พื้นที่จัดเก็บ', counts.storage)}
        ${tabBtn('donations', 'บริจาค',         counts.donations)}
      </div>
      <div id="tab-content"></div>`;

    document.querySelectorAll('.queue-tab-btn').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );
  }

  function tabBtn(tab, label, count) {
    return `<button class="queue-tab-btn${tab === activeTab ? ' active' : ''}" data-tab="${tab}">
      ${h(label)}<span class="queue-tab-count${count === 0 ? ' zero' : ''}">${count}</span>
    </button>`;
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.queue-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );
    renderTab();
  }

  function tabContent() { return document.getElementById('tab-content'); }

  async function renderTab() {
    const el = tabContent();
    if (!el) return;
    el.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    if      (activeTab === 'requests')  await renderRequests();
    else if (activeTab === 'returns')   await renderReturnList();
    else if (activeTab === 'visits')    await renderVisits();
    else if (activeTab === 'deposits')  await renderDeposits();
    else if (activeTab === 'storage')   await renderStorageAreas();
    else if (activeTab === 'donations') await renderDonations();
  }

  // ── Tab: คำขอยืม ──────────────────────────────────────────────────────────
  async function renderRequests() {
    const el = tabContent();
    if (!el) return;

    const [pendingRes, processingRes] = await Promise.allSettled([
      getRequests({ limit: 100, status: 'pending' }),
      getRequests({ limit: 100, status: 'processing' }),
    ]);
    const reqCounts = {
      pending:    pendingRes.status    === 'fulfilled' ? (pendingRes.value?.data?.length    ?? 0) : 0,
      processing: processingRes.status === 'fulfilled' ? (processingRes.value?.data?.length ?? 0) : 0,
    };

    function pillHtml(value, label) {
      const isActive = value === reqStatus;
      const count    = reqCounts[value];
      const bubble   = count > 0
        ? `<span class="req-pill-count${isActive ? ' active' : ''}">${count}</span>`
        : '';
      return `<button class="req-pill${isActive ? ' active' : ''}" data-status="${h(value)}">${h(label)}${bubble}</button>`;
    }

    el.innerHTML = `
      <div class="req-pills">
        ${REQUEST_STATUS_OPTS.map(([v, l]) => pillHtml(v, l)).join('')}
      </div>
      <div id="req-list"></div>`;

    el.querySelectorAll('.req-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        reqStatus = pill.dataset.status;
        el.querySelectorAll('.req-pill').forEach(p => {
          const isActive = p.dataset.status === reqStatus;
          p.classList.toggle('active', isActive);
          const bubble = p.querySelector('.req-pill-count');
          if (bubble) bubble.classList.toggle('active', isActive);
        });
        loadRequestList();
      });
    });

    if (reqStatus === 'pending' && pendingRes.status === 'fulfilled') {
      renderRequestRows(pendingRes.value?.data ?? []);
    } else if (reqStatus === 'processing' && processingRes.status === 'fulfilled') {
      renderRequestRows(processingRes.value?.data ?? []);
    } else {
      await loadRequestList();
    }
  }

  function renderRequestRows(rows) {
    const list = document.getElementById('req-list');
    if (!list) return;
    if (rows.length === 0) { list.innerHTML = '<p class="empty-text">ไม่มีคำขอ</p>'; return; }
    list.innerHTML = `<div class="svc-list">
      ${rows.map(r => `
        <a href="request-detail.html?id=${h(r.id)}" class="svc-row">
          <span class="svc-row-id">#${h(r.id)}</span>
          <span class="svc-row-name">${h(r.name || '-')}</span>
          <span class="svc-row-meta">${h(r.user_name || '')}</span>
          <span>
            ${statusBadge(r.status)}
            ${r.is_overdue ? '<span class="badge badge-overdue">เกินกำหนด</span>' : ''}
          </span>
          <span class="svc-row-meta">${formatDate(r.requested_pickup_datetime)}</span>
          <span class="svc-row-arrow">›</span>
        </a>`).join('')}
    </div>`;
  }

  async function loadRequestList() {
    const list = document.getElementById('req-list');
    if (!list) return;
    list.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const params = { limit: 100 };
      if (reqStatus) params.status = reqStatus;
      const res = await getRequests(params);
      renderRequestRows(res?.data ?? []);
    } catch (err) {
      list.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  // ── Tab: การคืน ───────────────────────────────────────────────────────────
  async function renderReturnList() {
    const el = tabContent();
    if (!el) return;
    el.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const res     = await getAllReturns('pending');
      const returns = res?.data ?? [];

      if (returns.length === 0) {
        el.innerHTML = '<p class="empty-text">ไม่มีรายการคืนที่รอยืนยัน</p>';
        return;
      }

      el.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ชื่อคำขอ</th>
                <th>วันที่ส่งคืน</th>
                <th>สภาพ</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              ${returns.map(r => `
                <tr class="clickable-row"
                  data-id="${h(String(r.id))}"
                  data-request-id="${h(String(r.borrow_request_id ?? r.request_id ?? ''))}"
                  style="cursor:pointer">
                  <td>
                    <div style="font-weight:600;font-size:.88rem">${h(r.request_name ?? '-')}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${h(r.requester_name ?? '')}</div>
                  </td>
                  <td style="white-space:nowrap;font-size:.82rem">${formatDateTime(r.submitted_at ?? r.created_at)}</td>
                  <td>
                    ${r.all_items_ok === 1 || r.all_items_ok === true
                      ? '<span style="color:var(--success);font-weight:600">ปกติ</span>'
                      : '<span style="color:var(--error);font-weight:600">มีปัญหา</span>'}
                  </td>
                  <td>${statusBadge(r.status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      el.querySelectorAll('.clickable-row').forEach(row =>
        row.addEventListener('click', () => {
          const reqId = row.dataset.requestId;
          if (reqId) window.location.href = `request-detail.html?id=${encodeURIComponent(reqId)}`;
          else renderReturnDetail(row.dataset.id);
        })
      );
    } catch (err) {
      el.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  async function renderReturnDetail(returnId) {
    const el = tabContent();
    if (!el) return;
    el.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    let ret;
    try {
      const res = await getReturn(returnId);
      ret = res?.data ?? res;
    } catch (err) {
      el.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      return;
    }

    const conditions  = ret.conditions ?? [];
    const items       = ret.items       ?? [];
    const hasProblems = conditions.length > 0 || ret.all_items_ok === 0 || ret.all_items_ok === false;

    el.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="btn-back" style="margin-bottom:1rem">← รายการคืน</button>

      <div class="page-header" style="margin-bottom:1rem">
        <h2 style="font-size:1.05rem;font-weight:700;margin:0">ยืนยันการคืน</h2>
        ${statusBadge(ret.status)}
      </div>

      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">ข้อมูลการคืน</div>
        ${ret.photo_r2_key
          ? `<img data-photo-key="${h(ret.photo_r2_key)}" alt="รูปการคืน"
               style="max-width:320px;width:100%;border-radius:8px;margin-bottom:1rem;display:block">`
          : ''}
        <div class="info-row"><span class="info-label">ชื่อคำขอ:</span> ${h(ret.request_name ?? '-')}</div>
        <div class="info-row"><span class="info-label">ผู้ส่งคืน:</span> ${h(ret.requester_name ?? '-')}</div>
        <div class="info-row"><span class="info-label">วันที่ส่งคืน:</span> ${formatDateTime(ret.submitted_at ?? ret.created_at)}</div>
        ${ret.note ? `<div class="info-row"><span class="info-label">หมายเหตุ:</span> ${h(ret.note)}</div>` : ''}
        <div class="info-row">
          <span class="info-label">สภาพอุปกรณ์:</span>
          ${hasProblems
            ? '<span style="color:var(--error);font-weight:600">มีปัญหา / ชำรุด</span>'
            : '<span style="color:var(--success);font-weight:600">ปกติทุกชิ้น</span>'}
        </div>
        ${(ret.borrow_request_id ?? ret.request_id) ? `
        <div style="margin-top:.75rem">
          <a href="request-detail.html?id=${h(String(ret.borrow_request_id ?? ret.request_id))}"
             class="btn btn-sm btn-secondary" target="_blank">ดูคำขอยืมต้นฉบับ ↗</a>
        </div>` : ''}
      </div>

      ${conditions.length > 0 ? `
        <div class="card" style="margin-bottom:1.25rem;border-left:3px solid var(--error)">
          <div class="card-title" style="color:var(--error)">รายงานปัญหา</div>
          <ul style="margin:0;padding-left:1.2rem">
            ${conditions.map(c => `
              <li style="margin-bottom:.4rem">
                <strong>${h(c.item_name ?? c.item_id ?? '-')}</strong>
                ${c.condition_type === 'missing' ? ' — <span style="color:var(--error)">สูญหาย</span>'
                  : c.condition_type === 'broken' ? ' — <span style="color:var(--warning,#d97706)">ชำรุด</span>'
                  : ''}
                ${c.note ? `: ${h(c.note)}` : ''}
              </li>`).join('')}
          </ul>
        </div>` : ''}

      ${ret.status === 'pending' ? `
        <div class="card">
          <div class="card-title">ยืนยันการรับคืน</div>
          <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem">
            ระบุจำนวนที่รับคืนจริงและจำนวนที่ต้องส่งซ่อม (ถ้ามี)
          </p>
          <div id="return-error"></div>
          <form id="confirm-form">
            <div class="table-wrap" style="margin-bottom:1rem">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>ชื่ออุปกรณ์</th>
                    <th>อนุมัติไป</th>
                    <th>รับคืนได้ <span class="form-required">*</span></th>
                    <th>ส่งซ่อม</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((it, idx) => `
                    <tr>
                      <td>
                        ${h(it.item_name ?? it.item_id ?? '-')}
                        ${it.item_unit ? `<span style="color:var(--text-muted);font-size:.82em"> (${h(it.item_unit)})</span>` : ''}
                      </td>
                      <td>${it.quantity_approved}</td>
                      <td>
                        <input type="number" class="form-input qty-returned" min="0"
                          max="${it.quantity_approved}"
                          value="${it.quantity_returned ?? it.quantity_approved}"
                          data-idx="${idx}" data-item-id="${h(String(it.item_id))}"
                          data-max="${it.quantity_approved}" style="width:80px">
                      </td>
                      <td>
                        <input type="number" class="form-input qty-repair" min="0"
                          value="${it.quantity_to_repair ?? 0}"
                          data-idx="${idx}" style="width:80px">
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="return-submit-btn">ยืนยันการรับคืน</button>
              <button type="button" class="btn btn-secondary" id="btn-cancel">ยกเลิก</button>
            </div>
          </form>
        </div>` : `
        <div class="card">
          <p style="color:var(--text-muted)">รายการนี้ได้รับการยืนยันแล้ว</p>
        </div>`}`;

    loadAuthPhotos(el);

    document.getElementById('btn-back').addEventListener('click', renderReturnList);
    document.getElementById('btn-cancel')?.addEventListener('click', renderReturnList);

    const form = document.getElementById('confirm-form');
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const errEl          = document.getElementById('return-error');
        errEl.innerHTML      = '';
        const returnedInputs = form.querySelectorAll('.qty-returned');
        const repairInputs   = form.querySelectorAll('.qty-repair');
        const payload        = [];
        let valid            = true;

        returnedInputs.forEach((inp, i) => {
          const qty_returned  = parseInt(inp.value, 10) || 0;
          const qty_to_repair = parseInt(repairInputs[i].value, 10) || 0;
          const max           = parseInt(inp.dataset.max, 10);
          if (qty_returned < 0 || qty_returned > max) {
            errEl.innerHTML = `<div class="alert alert-error">จำนวนที่รับคืนต้องอยู่ระหว่าง 0–${max}</div>`;
            valid = false; return;
          }
          if (qty_to_repair < 0 || qty_to_repair > qty_returned) {
            errEl.innerHTML = '<div class="alert alert-error">จำนวนส่งซ่อมต้องไม่เกินจำนวนที่รับคืน</div>';
            valid = false; return;
          }
          payload.push({
            item_id:           inp.dataset.itemId,
            quantity_returned: qty_returned,
            ...(qty_to_repair > 0 ? { quantity_to_repair: qty_to_repair } : {}),
          });
        });
        if (!valid) return;

        const btn = document.getElementById('return-submit-btn');
        btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
        try {
          await confirmReturn(returnId, { items: payload });
          counts.returns = Math.max(0, counts.returns - 1);
          updateBadge('returns', counts.returns);
          await renderReturnList();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false; btn.textContent = 'ยืนยันการรับคืน';
        }
      });
    }
  }

  // ── Shared: status pill strip ──────────────────────────────────────────────
  function statusPills(opts, current) {
    return opts.map(([v, l]) =>
      `<button class="req-pill${v === current ? ' active' : ''}" data-status="${h(v)}">${h(l)}</button>`
    ).join('');
  }

  function bindPills(container, onPick) {
    container.querySelectorAll('.req-pill').forEach(pill =>
      pill.addEventListener('click', () => {
        container.querySelectorAll('.req-pill').forEach(p =>
          p.classList.toggle('active', p.dataset.status === pill.dataset.status)
        );
        onPick(pill.dataset.status);
      })
    );
  }

  // ── Tab: นัดชม ────────────────────────────────────────────────────────────
  async function renderVisits() {
    const el = tabContent();
    if (!el) return;

    const [pendingRes, confirmedRes] = await Promise.allSettled([
      getVisits({ limit: 100, status: 'pending' }),
      getVisits({ limit: 100, status: 'confirmed' }),
    ]);
    const visitCounts = {
      pending:   pendingRes.status   === 'fulfilled' ? (pendingRes.value?.data?.length   ?? 0) : 0,
      confirmed: confirmedRes.status === 'fulfilled' ? (confirmedRes.value?.data?.length ?? 0) : 0,
    };

    function visitPillHtml(value, label) {
      const isActive = value === visitStatus;
      const count    = visitCounts[value];
      const bubble   = count > 0
        ? `<span class="req-pill-count${isActive ? ' active' : ''}">${count}</span>`
        : '';
      return `<button class="req-pill${isActive ? ' active' : ''}" data-status="${h(value)}">${h(label)}${bubble}</button>`;
    }

    el.innerHTML = `
      <div class="req-pills">${VISIT_STATUS_OPTS.map(([v, l]) => visitPillHtml(v, l)).join('')}</div>
      <div id="visit-error"></div>
      <div id="visit-list"></div>`;

    bindPills(el, v => { visitStatus = v; loadVisitList(); });
    await loadVisitList();
  }

  async function loadVisitList() {
    const list = document.getElementById('visit-list');
    if (!list) return;
    list.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const params = { limit: 100 };
      if (visitStatus) params.status = visitStatus;
      const res    = await getVisits(params);
      const visits = res?.data ?? [];

      if (visits.length === 0) { list.innerHTML = '<p class="empty-text">ไม่มีนัดชม</p>'; return; }

      list.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>โครงการ / ผู้ขอ</th>
                <th>วันที่</th>
                <th>เวลา</th>
                <th>คน</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${visits.map(v => `
                <tr>
                  <td>
                    <div style="font-weight:600;font-size:.88rem">${h(v.project_name || '-')}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${h(v.user_name || '')}</div>
                  </td>
                  <td style="white-space:nowrap">${formatDate(v.visit_date)}</td>
                  <td>${h(v.visit_time ? v.visit_time.slice(0, 5) : '-')}</td>
                  <td style="text-align:center">${h(String(v.num_people ?? 1))}</td>
                  <td>${statusBadge(v.status)}</td>
                  <td>
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap">
                      ${v.status === 'pending' ? `
                        <button class="btn btn-sm btn-success do-confirm" data-id="${h(String(v.id))}">ยืนยัน</button>
                        <button class="btn btn-sm btn-danger  do-reject"  data-id="${h(String(v.id))}">ปฏิเสธ</button>
                      ` : ''}
                      ${v.status === 'confirmed' ? `
                        <button class="btn btn-sm btn-primary do-complete" data-id="${h(String(v.id))}">เสร็จสิ้น</button>
                        <button class="btn btn-sm btn-danger  do-cancel"   data-id="${h(String(v.id))}">ยกเลิก</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      bindVisitActions();
    } catch (err) {
      list.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  function bindVisitActions() {
    document.querySelectorAll('.do-confirm').forEach(btn => {
      btn.addEventListener('click', () => {
        const id    = btn.dataset.id;
        const close = openModal('ยืนยันนัดชม', `
          <div class="form-group">
            <label class="form-label">หมายเหตุ <span style="color:var(--text-muted);font-size:.85em">(ไม่บังคับ)</span></label>
            <textarea class="form-textarea" id="visit-note" style="min-height:60px" placeholder="หมายเหตุถึงผู้ขอ"></textarea>
          </div>
          <div id="modal-err"></div>
          <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
            <button class="btn btn-secondary" id="modal-cancel">ยกเลิก</button>
            <button class="btn btn-success"   id="modal-ok">ยืนยัน</button>
          </div>`);
        document.getElementById('modal-cancel').onclick = close;
        document.getElementById('modal-ok').onclick = async () => {
          const note = document.getElementById('visit-note').value.trim();
          const b    = document.getElementById('modal-ok');
          b.disabled = true; b.textContent = 'กำลังบันทึก…';
          try {
            await confirmVisit(id, note ? { admin_note: note } : {});
            close();
            await loadVisitList();
          } catch (err) {
            document.getElementById('modal-err').innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
            b.disabled = false; b.textContent = 'ยืนยัน';
          }
        };
      });
    });

    document.querySelectorAll('.do-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const id    = btn.dataset.id;
        const close = openModal('ปฏิเสธนัดชม', `
          <div class="form-group">
            <label class="form-label">เหตุผล <span style="color:var(--text-muted);font-size:.85em">(ไม่บังคับ)</span></label>
            <textarea class="form-textarea" id="visit-note" style="min-height:60px" placeholder="เหตุผลที่ปฏิเสธ"></textarea>
          </div>
          <div id="modal-err"></div>
          <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
            <button class="btn btn-secondary" id="modal-cancel">ยกเลิก</button>
            <button class="btn btn-danger"    id="modal-ok">ปฏิเสธ</button>
          </div>`);
        document.getElementById('modal-cancel').onclick = close;
        document.getElementById('modal-ok').onclick = async () => {
          const note = document.getElementById('visit-note').value.trim();
          const b    = document.getElementById('modal-ok');
          b.disabled = true; b.textContent = 'กำลังบันทึก…';
          try {
            await rejectVisit(id, note ? { admin_note: note } : {});
            close();
            await loadVisitList();
          } catch (err) {
            document.getElementById('modal-err').innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
            b.disabled = false; b.textContent = 'ปฏิเสธ';
          }
        };
      });
    });

    document.querySelectorAll('.do-complete').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirmModal('ยืนยันว่านัดชมเสร็จสิ้น?', async () => {
          btn.disabled = true;
          try {
            await completeVisit(btn.dataset.id);
            await loadVisitList();
          } catch (err) {
            const errEl = document.getElementById('visit-error');
            if (errEl) errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
            btn.disabled = false;
          }
        }, { confirmLabel: 'เสร็จสิ้น' });
      });
    });

    document.querySelectorAll('.do-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirmModal('ยกเลิกนัดชมนี้?', async () => {
          btn.disabled = true;
          try {
            await cancelVisit(btn.dataset.id, {});
            await loadVisitList();
          } catch (err) {
            const errEl = document.getElementById('visit-error');
            if (errEl) errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
            btn.disabled = false;
          }
        }, { title: 'ยืนยันการยกเลิก', confirmLabel: 'ยกเลิก', confirmClass: 'btn-danger' });
      });
    });
  }

  // ── Tab: ฝากชั่วคราว ──────────────────────────────────────────────────────
  async function renderDeposits() {
    const el = tabContent();
    if (!el) return;

    const [pendingRes] = await Promise.allSettled([
      getDeposits({ limit: 100, status: 'pending' }),
    ]);
    const depCounts = {
      pending: pendingRes.status === 'fulfilled' ? (pendingRes.value?.data?.length ?? 0) : 0,
    };

    function depPillHtml(value, label) {
      const isActive = value === depositStatus;
      const count    = depCounts[value];
      const bubble   = count > 0
        ? `<span class="req-pill-count${isActive ? ' active' : ''}">${count}</span>`
        : '';
      return `<button class="req-pill${isActive ? ' active' : ''}" data-status="${h(value)}">${h(label)}${bubble}</button>`;
    }

    el.innerHTML = `
      <div class="req-pills">${DEPOSIT_STATUS_OPTS.map(([v, l]) => depPillHtml(v, l)).join('')}</div>
      <div id="deposit-list"></div>`;
    bindPills(el, v => { depositStatus = v; loadDepositList(); });
    await loadDepositList();
  }

  async function loadDepositList() {
    const list = document.getElementById('deposit-list');
    if (!list) return;
    list.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const params = { limit: 100 };
      if (depositStatus) params.status = depositStatus;
      const res      = await getDeposits(params);
      const deposits = res?.data ?? [];

      if (deposits.length === 0) { list.innerHTML = '<p class="empty-text">ไม่มีรายการฝากของ</p>'; return; }

      list.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>โครงการ / ผู้ขอ</th>
                <th>วันฝาก</th>
                <th>วันรับคืน</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${deposits.map(d => `
                <tr>
                  <td>
                    <div style="font-weight:600;font-size:.88rem">#${h(d.id)} ${h(d.project_name || '-')}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${h(d.user_name ?? d.requester_name ?? '')}</div>
                  </td>
                  <td style="white-space:nowrap">${formatDate(d.deposit_date)}</td>
                  <td style="white-space:nowrap">${formatDate(d.withdraw_date)}</td>
                  <td>${statusBadge(d.status)}</td>
                  <td>
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap">
                      ${d.status === 'pending' ? `
                        <button class="btn btn-sm btn-success dep-approve" data-id="${h(String(d.id))}">อนุมัติ</button>
                        <button class="btn btn-sm btn-danger  dep-reject"  data-id="${h(String(d.id))}">ปฏิเสธ</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      list.querySelectorAll('.dep-approve').forEach(btn => {
        btn.addEventListener('click', () => showNoteModal('อนุมัติการฝากของ', 'อนุมัติ', 'btn-success', async note => {
          await approveDeposit(btn.dataset.id, note ? { admin_note: note } : {});
          counts.deposits = Math.max(0, counts.deposits - 1);
          updateBadge('deposits', counts.deposits);
          await loadDepositList();
        }));
      });

      list.querySelectorAll('.dep-reject').forEach(btn => {
        btn.addEventListener('click', () => showNoteModal('ปฏิเสธการฝากของ', 'ปฏิเสธ', 'btn-danger', async note => {
          await rejectDeposit(btn.dataset.id, note ? { admin_note: note } : {});
          counts.deposits = Math.max(0, counts.deposits - 1);
          updateBadge('deposits', counts.deposits);
          await loadDepositList();
        }));
      });
    } catch (err) {
      list.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  // ── Tab: พื้นที่จัดเก็บ ───────────────────────────────────────────────────
  async function renderStorageAreas() {
    const el = tabContent();
    if (!el) return;

    const [pendingRes] = await Promise.allSettled([
      getStorageAreas({ limit: 100, status: 'pending' }),
    ]);
    const saCounts = {
      pending: pendingRes.status === 'fulfilled' ? (pendingRes.value?.data?.length ?? 0) : 0,
    };

    function saPillHtml(value, label) {
      const isActive = value === storageStatus;
      const count    = saCounts[value];
      const bubble   = count > 0
        ? `<span class="req-pill-count${isActive ? ' active' : ''}">${count}</span>`
        : '';
      return `<button class="req-pill${isActive ? ' active' : ''}" data-status="${h(value)}">${h(label)}${bubble}</button>`;
    }

    el.innerHTML = `
      <div class="req-pills">${STORAGE_STATUS_OPTS.map(([v, l]) => saPillHtml(v, l)).join('')}</div>
      <div id="storage-list"></div>`;
    bindPills(el, v => { storageStatus = v; loadStorageList(); });
    await loadStorageList();
  }

  async function loadStorageList() {
    const list = document.getElementById('storage-list');
    if (!list) return;
    list.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const params = { limit: 100 };
      if (storageStatus) params.status = storageStatus;
      const res   = await getStorageAreas(params);
      const areas = res?.data ?? [];

      if (areas.length === 0) { list.innerHTML = '<p class="empty-text">ไม่มีรายการพื้นที่จัดเก็บ</p>'; return; }

      list.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>โครงการ / ผู้ขอ</th>
                <th>วันเริ่ม</th>
                <th>วันสิ้นสุด</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${areas.map(a => `
                <tr>
                  <td>
                    <div style="font-weight:600;font-size:.88rem">#${h(a.id)} ${h(a.project_name || '-')}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${h(a.user_name ?? a.requester_name ?? '')}</div>
                  </td>
                  <td style="white-space:nowrap">${formatDate(a.start_date)}</td>
                  <td style="white-space:nowrap">${formatDate(a.end_date)}</td>
                  <td>${statusBadge(a.status)}</td>
                  <td>
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap">
                      ${a.status === 'pending' ? `
                        <button class="btn btn-sm btn-success sa-approve" data-id="${h(String(a.id))}">อนุมัติ</button>
                        <button class="btn btn-sm btn-danger  sa-reject"  data-id="${h(String(a.id))}">ปฏิเสธ</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      list.querySelectorAll('.sa-approve').forEach(btn => {
        btn.addEventListener('click', () => showNoteModal('อนุมัติพื้นที่จัดเก็บ', 'อนุมัติ', 'btn-success', async note => {
          await approveStorageArea(btn.dataset.id, note ? { admin_note: note } : {});
          counts.storage = Math.max(0, counts.storage - 1);
          updateBadge('storage', counts.storage);
          await loadStorageList();
        }));
      });

      list.querySelectorAll('.sa-reject').forEach(btn => {
        btn.addEventListener('click', () => showNoteModal('ปฏิเสธพื้นที่จัดเก็บ', 'ปฏิเสธ', 'btn-danger', async note => {
          await rejectStorageArea(btn.dataset.id, note ? { admin_note: note } : {});
          counts.storage = Math.max(0, counts.storage - 1);
          updateBadge('storage', counts.storage);
          await loadStorageList();
        }));
      });
    } catch (err) {
      list.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  // ── Tab: บริจาค ───────────────────────────────────────────────────────────
  async function renderDonations() {
    const el = tabContent();
    if (!el) return;

    const [pendingRes, donatedRes] = await Promise.allSettled([
      getDonations({ limit: 100, status: 'pending' }),
      getDonations({ limit: 100, status: 'donated' }),
    ]);
    const dnCounts = {
      pending: pendingRes.status === 'fulfilled' ? (pendingRes.value?.data?.length ?? 0) : 0,
      donated: donatedRes.status === 'fulfilled' ? (donatedRes.value?.data?.length ?? 0) : 0,
    };

    function dnPillHtml(value, label) {
      const isActive = value === donationStatus;
      const count    = dnCounts[value];
      const bubble   = count > 0
        ? `<span class="req-pill-count${isActive ? ' active' : ''}">${count}</span>`
        : '';
      return `<button class="req-pill${isActive ? ' active' : ''}" data-status="${h(value)}">${h(label)}${bubble}</button>`;
    }

    el.innerHTML = `
      <div class="req-pills">${DONATION_STATUS_OPTS.map(([v, l]) => dnPillHtml(v, l)).join('')}</div>
      <div id="donation-list"></div>`;
    bindPills(el, v => { donationStatus = v; loadDonationList(); });
    await loadDonationList();
  }

  async function loadDonationList() {
    const list = document.getElementById('donation-list');
    if (!list) return;
    list.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    try {
      const params = { limit: 100 };
      if (donationStatus) params.status = donationStatus;
      const res       = await getDonations(params);
      const donations = res?.data ?? [];

      if (donations.length === 0) { list.innerHTML = '<p class="empty-text">ไม่มีรายการบริจาค</p>'; return; }

      list.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>โครงการ / ผู้ขอ</th>
                <th>วันบริจาค</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${donations.map(d => `
                <tr>
                  <td>
                    <div style="font-weight:600;font-size:.88rem">#${h(d.id)} ${h(d.project_name || '-')}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${h(d.user_name ?? d.requester_name ?? '')}</div>
                  </td>
                  <td style="white-space:nowrap">${formatDate(d.donation_date)}</td>
                  <td>${statusBadge(d.status)}</td>
                  <td>
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap">
                      ${d.status === 'pending' ? `
                        <button class="btn btn-sm btn-secondary dn-review" data-id="${h(String(d.id))}">ตรวจสอบรายการ</button>
                      ` : ''}
                      ${d.status === 'donated' ? `
                        <button class="btn btn-sm btn-primary dn-complete" data-id="${h(String(d.id))}">ยืนยันรับบริจาค</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      list.querySelectorAll('.dn-review').forEach(btn => {
        btn.addEventListener('click', () => renderDonationDetail(btn.dataset.id));
      });

      list.querySelectorAll('.dn-complete').forEach(btn => {
        btn.addEventListener('click', () => {
          showConfirmModal('ยืนยันรับบริจาคนี้?', async () => {
            btn.disabled = true;
            try {
              await completeDonation(btn.dataset.id);
              await loadDonationList();
            } catch (err) {
              showError(err.message);
              btn.disabled = false;
            }
          }, { confirmLabel: 'ยืนยันรับบริจาค' });
        });
      });
    } catch (err) {
      list.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
    }
  }

  async function renderDonationDetail(donationId) {
    const el = tabContent();
    if (!el) return;
    el.innerHTML = '<div class="spinner">กำลังโหลด…</div>';
    let don;
    try {
      const res = await getDonation(donationId);
      don = res?.data ?? res;
    } catch (err) {
      el.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`; return;
    }

    const items       = don.items ?? [];
    const allReviewed = items.every(it => it.item_status && it.item_status !== 'pending');

    el.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="dn-back" style="margin-bottom:1rem">← รายการบริจาค</button>
      <div class="page-header" style="margin-bottom:1rem">
        <h2 style="font-size:1.05rem;font-weight:700;margin:0">ตรวจสอบการบริจาค</h2>
        ${statusBadge(don.status)}
      </div>
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">ข้อมูลการบริจาค</div>
        <div class="info-row"><span class="info-label">โครงการ:</span> ${h(don.project_name ?? '-')}</div>
        <div class="info-row"><span class="info-label">ผู้บริจาค:</span> ${h(don.user_name ?? don.requester_name ?? '-')}</div>
        ${don.donation_date ? `<div class="info-row"><span class="info-label">วันบริจาค:</span> ${formatDate(don.donation_date)}</div>` : ''}
      </div>

      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">รายการสิ่งของ</div>
        <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem">
          ตรวจสอบแต่ละรายการก่อนอนุมัติหรือปฏิเสธทั้งหมด
        </p>
        <div id="dn-items-err"></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>รายการ</th>
                <th>จำนวนที่บริจาค</th>
                <th>จำนวนที่อนุมัติ</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody id="dn-item-rows">
              ${items.map(it => donationItemRow(it)).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${don.status === 'pending' ? `
        <div class="card">
          <div class="card-title">ตัดสินใจ</div>
          ${allReviewed ? '' : `<p style="font-size:.82rem;color:var(--warning,#d97706);margin-bottom:.75rem">ต้องตรวจสอบทุกรายการก่อนอนุมัติ</p>`}
          <div id="dn-decision-err"></div>
          <div style="display:flex;gap:.75rem;flex-wrap:wrap">
            <button class="btn btn-success" id="dn-approve-btn" ${allReviewed ? '' : 'disabled'}>อนุมัติทั้งหมด</button>
            <button class="btn btn-danger"  id="dn-reject-btn">ปฏิเสธทั้งหมด</button>
          </div>
        </div>` : ''}`;

    document.getElementById('dn-back').addEventListener('click', renderDonations);

    bindDonationItemActions(donationId, items, don.status, allReviewed);
  }

  function donationItemRow(it) {
    const statusLabel = it.item_status === 'approved' ? '<span style="color:var(--success);font-weight:600">อนุมัติ</span>'
      : it.item_status === 'rejected' ? '<span style="color:var(--error);font-weight:600">ปฏิเสธ</span>'
      : '<span style="color:var(--text-muted)">รอตรวจสอบ</span>';
    return `<tr data-item-id="${h(String(it.id))}">
      <td>
        <div style="font-weight:600;font-size:.88rem">${h(it.item_name ?? it.proposed_name ?? '-')}</div>
        ${it.proposed_description ? `<div style="font-size:.75rem;color:var(--text-muted)">${h(it.proposed_description)}</div>` : ''}
      </td>
      <td style="text-align:center">${h(String(it.quantity_donated ?? '-'))}</td>
      <td style="text-align:center">${it.quantity_approved != null ? h(String(it.quantity_approved)) : '-'}</td>
      <td>${statusLabel}</td>
      <td>
        ${it.item_status === 'pending' ? `
          <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap">
            <input type="number" class="form-input item-qty-approved" min="1"
              value="${it.quantity_donated ?? 1}" style="width:70px"
              data-item-id="${h(String(it.id))}">
            <button class="btn btn-sm btn-success item-approve" data-item-id="${h(String(it.id))}">อนุมัติ</button>
            <button class="btn btn-sm btn-danger  item-reject"  data-item-id="${h(String(it.id))}">ปฏิเสธ</button>
          </div>` : ''}
      </td>
    </tr>`;
  }

  function bindDonationItemActions(donationId, items, donStatus, allReviewedInitial) {
    let allReviewed = allReviewedInitial;

    document.querySelectorAll('.item-approve').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId  = btn.dataset.itemId;
        const qtyInp  = document.querySelector(`.item-qty-approved[data-item-id="${itemId}"]`);
        const qty     = parseInt(qtyInp?.value, 10) || 1;
        const errEl   = document.getElementById('dn-items-err');
        btn.disabled  = true;
        try {
          await reviewDonationItem(donationId, itemId, { item_status: 'approved', quantity_approved: qty });
          const it  = items.find(i => String(i.id) === itemId);
          if (it) { it.item_status = 'approved'; it.quantity_approved = qty; }
          const row = document.querySelector(`#dn-item-rows tr[data-item-id="${itemId}"]`);
          if (row) row.outerHTML = donationItemRow({ ...it, id: itemId });
          checkAllReviewed();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false;
        }
      });
    });

    document.querySelectorAll('.item-reject').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.itemId;
        const errEl  = document.getElementById('dn-items-err');
        btn.disabled = true;
        try {
          await reviewDonationItem(donationId, itemId, { item_status: 'rejected' });
          const it  = items.find(i => String(i.id) === itemId);
          if (it) { it.item_status = 'rejected'; }
          const row = document.querySelector(`#dn-item-rows tr[data-item-id="${itemId}"]`);
          if (row) row.outerHTML = donationItemRow({ ...it, id: itemId });
          checkAllReviewed();
        } catch (err) {
          errEl.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
          btn.disabled = false;
        }
      });
    });

    function checkAllReviewed() {
      allReviewed = items.every(it => it.item_status && it.item_status !== 'pending');
      const approveBtn = document.getElementById('dn-approve-btn');
      if (approveBtn) approveBtn.disabled = !allReviewed;
    }

    if (donStatus === 'pending') {
      document.getElementById('dn-approve-btn')?.addEventListener('click', () => {
        showNoteModal('อนุมัติการบริจาค', 'อนุมัติ', 'btn-success', async note => {
          await approveDonation(donationId, note ? { admin_note: note } : {});
          counts.donations = Math.max(0, counts.donations - 1);
          updateBadge('donations', counts.donations);
          await renderDonations();
        });
      });

      document.getElementById('dn-reject-btn')?.addEventListener('click', () => {
        showNoteModal('ปฏิเสธการบริจาค', 'ปฏิเสธ', 'btn-danger', async note => {
          await rejectDonation(donationId, note ? { admin_note: note } : {});
          counts.donations = Math.max(0, counts.donations - 1);
          updateBadge('donations', counts.donations);
          await renderDonations();
        });
      });
    }
  }

  // ── Shared: note modal helper ──────────────────────────────────────────────
  function showNoteModal(title, confirmLabel, confirmClass, onConfirm) {
    const close = openModal(title, `
      <div class="form-group">
        <label class="form-label">หมายเหตุ <span style="color:var(--text-muted);font-size:.85em">(ไม่บังคับ)</span></label>
        <textarea class="form-textarea" id="note-input" style="min-height:60px" placeholder="หมายเหตุ"></textarea>
      </div>
      <div id="note-modal-err"></div>
      <div class="modal-actions" style="display:flex;gap:.75rem;margin-top:1rem;justify-content:flex-end">
        <button class="btn btn-secondary" id="note-cancel">ยกเลิก</button>
        <button class="btn ${confirmClass}" id="note-ok">${h(confirmLabel)}</button>
      </div>`);
    document.getElementById('note-cancel').onclick = close;
    document.getElementById('note-ok').onclick = async () => {
      const note = document.getElementById('note-input').value.trim();
      const b    = document.getElementById('note-ok');
      b.disabled = true; b.textContent = 'กำลังบันทึก…';
      try {
        await onConfirm(note);
        close();
      } catch (err) {
        document.getElementById('note-modal-err').innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
        b.disabled = false; b.textContent = confirmLabel;
      }
    };
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  await loadCounts();
  renderShell();
  await renderTab();
}

init();
