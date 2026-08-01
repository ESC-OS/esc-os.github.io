import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getRequests, getAllReturns, getReturn, confirmReturn,
  getVisits, confirmVisit, rejectVisit, completeVisit, cancelVisit,
  getDeposits, approveDeposit, rejectDeposit,
  getStorageAreas, approveStorageArea, rejectStorageArea,
  getDonations, getDonation, approveDonation, rejectDonation, reviewDonationItem, completeDonation,
} from '../../../api/api';
import { formatDate, formatDateTime } from '../../../shared/utils/format';
import { showError } from '../../../shared/ErrorToast';
import Spinner from '../../../shared/Spinner';
import StatusBadge from '../../../shared/StatusBadge';
import Modal from '../../../shared/Modal';
import ConfirmModal from '../../../shared/ConfirmModal';

const REQUEST_STATUS_OPTS = [
  ['pending','รอดำเนินการ'],['processing','กำลังดำเนินการ'],['ready_for_pickup','พร้อมรับ'],
  ['in_lend','กำลังยืม'],['returned','คืนแล้ว'],['completed','เสร็จสิ้น'],
  ['rejected','ถูกปฏิเสธ'],['cancelled','ยกเลิกแล้ว'],['','ทุกสถานะ'],
];
const VISIT_STATUS_OPTS = [
  ['pending','รอยืนยัน'],['confirmed','ยืนยันแล้ว'],['completed','เสร็จสิ้น'],['cancelled','ยกเลิกแล้ว'],['rejected','ถูกปฏิเสธ'],['','ทุกสถานะ'],
];
const DEPOSIT_STATUS_OPTS = [
  ['pending','รอดำเนินการ'],['approved','อนุมัติแล้ว'],['rejected','ถูกปฏิเสธ'],['deposited','รับฝากแล้ว'],['completed','เสร็จสิ้น'],['','ทุกสถานะ'],
];
const STORAGE_STATUS_OPTS = [
  ['pending','รอดำเนินการ'],['approved','อนุมัติแล้ว'],['rejected','ถูกปฏิเสธ'],['in_use','กำลังใช้งาน'],['completed','เสร็จสิ้น'],['','ทุกสถานะ'],
];
const DONATION_STATUS_OPTS = [
  ['pending','รอดำเนินการ'],['approved','อนุมัติแล้ว'],['rejected','ถูกปฏิเสธ'],['donated','บริจาคแล้ว'],['completed','เสร็จสิ้น'],['','ทุกสถานะ'],
];

export default function AdminQueuePage() {
  const [activeTab, setActiveTab] = useState('requests');
  const [counts, setCounts] = useState({ requests: 0, returns: 0, visits: 0, deposits: 0, storage: 0, donations: 0 });

  useEffect(() => {
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
      setCounts({
        requests:  rq.status  === 'fulfilled' ? (rq.value?.data?.length  ?? 0) : 0,
        returns:   rt.status  === 'fulfilled' ? (rt.value?.data?.length  ?? 0) : 0,
        visits:    (vsPend.status === 'fulfilled' ? (vsPend.value?.data?.length ?? 0) : 0)
                 + (vsConf.status === 'fulfilled' ? (vsConf.value?.data?.length ?? 0) : 0),
        deposits:  dp.status  === 'fulfilled' ? (dp.value?.data?.length  ?? 0) : 0,
        storage:   sa.status  === 'fulfilled' ? (sa.value?.data?.length  ?? 0) : 0,
        donations: dn.status  === 'fulfilled' ? (dn.value?.data?.length  ?? 0) : 0,
      });
    }
    loadCounts();
  }, []);

  function updateCount(tab, delta) {
    setCounts(prev => ({ ...prev, [tab]: Math.max(0, prev[tab] + delta) }));
  }

  const tabs = [
    ['requests','คำขอยืม'],['returns','การคืน'],['visits','นัดชม'],
    ['deposits','ฝากชั่วคราว'],['storage','พื้นที่จัดเก็บ'],['donations','บริจาค'],
  ];

  return (
    <>
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <h1 className="page-title">จัดการคำขอ</h1>
      </div>
      <div className="queue-tabs">
        {tabs.map(([tab, label]) => {
          const n = counts[tab];
          return (
            <button
              key={tab}
              className={`queue-tab-btn${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {label}
              <span className={`queue-tab-count${n === 0 ? ' zero' : ''}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div id="tab-content">
        {activeTab === 'requests'  && <RequestsTab updateCount={delta => updateCount('requests', delta)} />}
        {activeTab === 'returns'   && <ReturnsTab  updateCount={delta => updateCount('returns', delta)} />}
        {activeTab === 'visits'    && <VisitsTab   updateCount={delta => updateCount('visits', delta)} />}
        {activeTab === 'deposits'  && <DepositsTab updateCount={delta => updateCount('deposits', delta)} />}
        {activeTab === 'storage'   && <StorageTab  updateCount={delta => updateCount('storage', delta)} />}
        {activeTab === 'donations' && <DonationsTab updateCount={delta => updateCount('donations', delta)} />}
      </div>
    </>
  );
}

// ── Requests Tab ─────────────────────────────────────────────────────────────
function RequestsTab() {
  const [reqStatus, setReqStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reqCounts, setReqCounts] = useState({ pending: 0, processing: 0 });

  const load = useCallback(async (status) => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (status) params.status = status;
      const res = await getRequests(params);
      setRows(res?.data ?? []);
    } catch (err) {
      showError(err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    async function init() {
      const [p, r] = await Promise.allSettled([
        getRequests({ limit: 100, status: 'pending' }),
        getRequests({ limit: 100, status: 'processing' }),
      ]);
      setReqCounts({
        pending:    p.status === 'fulfilled' ? (p.value?.data?.length ?? 0) : 0,
        processing: r.status === 'fulfilled' ? (r.value?.data?.length ?? 0) : 0,
      });
      if (reqStatus === 'pending' && p.status === 'fulfilled') setRows(p.value?.data ?? []);
      else if (reqStatus === 'processing' && r.status === 'fulfilled') setRows(r.value?.data ?? []);
      else await load(reqStatus);
    }
    init();
  }, []); // eslint-disable-line

  function handlePill(status) {
    setReqStatus(status);
    load(status);
  }

  return (
    <>
      <div className="req-pills">
        {REQUEST_STATUS_OPTS.map(([v, l]) => {
          const count = reqCounts[v];
          return (
            <button key={v} className={`req-pill${v === reqStatus ? ' active' : ''}`} onClick={() => handlePill(v)}>
              {l}
              {count > 0 && <span className={`req-pill-count${v === reqStatus ? ' active' : ''}`}>{count}</span>}
            </button>
          );
        })}
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <p className="empty-text">ไม่มีคำขอ</p> : (
        <div className="svc-list">
          {rows.map(r => (
            <Link key={r.id} to={`/requests/${r.id}`} className="svc-row">
              <span className="svc-row-id">#{r.id}</span>
              <span className="svc-row-name">{r.name || '-'}</span>
              <span className="svc-row-meta">{r.user_name || ''}</span>
              <span>
                <StatusBadge status={r.status} />
                {r.is_overdue && <span className="badge badge-overdue">เกินกำหนด</span>}
              </span>
              <span className="svc-row-meta">{formatDate(r.requested_pickup_datetime)}</span>
              <span className="svc-row-arrow">›</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// ── Returns Tab ───────────────────────────────────────────────────────────────
function ReturnsTab({ updateCount }) {
  const navigate = useNavigate();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null); // null = list, returnId = detail

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllReturns('pending');
      setReturns(res?.data ?? []);
    } catch (err) { showError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  if (detail) return <ReturnDetail returnId={detail} onBack={() => { setDetail(null); loadList(); }} onConfirmed={() => { updateCount(-1); setDetail(null); loadList(); }} />;
  if (loading) return <Spinner />;

  return returns.length === 0 ? <p className="empty-text">ไม่มีรายการคืนที่รอยืนยัน</p> : (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>ชื่อคำขอ</th><th>วันที่ส่งคืน</th><th>สภาพ</th><th>สถานะ</th></tr></thead>
        <tbody>
          {returns.map(r => (
            <tr key={r.id} className="clickable-row" style={{ cursor: 'pointer' }} onClick={() => {
              const reqId = r.borrow_request_id ?? r.request_id;
              if (reqId) navigate(`/requests/${reqId}`);
              else setDetail(r.id);
            }}>
              <td>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{r.request_name ?? '-'}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.requester_name ?? ''}</div>
              </td>
              <td style={{ whiteSpace: 'nowrap', fontSize: '.82rem' }}>{formatDateTime(r.submitted_at ?? r.created_at)}</td>
              <td>{(r.all_items_ok === 1 || r.all_items_ok === true) ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>ปกติ</span> : <span style={{ color: 'var(--error)', fontWeight: 600 }}>มีปัญหา</span>}</td>
              <td><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReturnDetail({ returnId, onBack, onConfirmed }) {
  const [ret, setRet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returnQtys, setReturnQtys] = useState({});
  const [repairQtys, setRepairQtys] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    getReturn(returnId)
      .then(res => {
        const r = res?.data ?? res;
        setRet(r);
        const rq = {}, rep = {};
        (r.items ?? []).forEach(it => {
          rq[it.item_id] = it.quantity_returned ?? it.quantity_approved;
          rep[it.item_id] = it.quantity_to_repair ?? 0;
        });
        setReturnQtys(rq); setRepairQtys(rep);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [returnId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const items = ret.items ?? [];
    const payload = [];
    let valid = true;
    for (const it of items) {
      const qty_returned = parseInt(returnQtys[it.item_id] ?? it.quantity_approved);
      const qty_to_repair = parseInt(repairQtys[it.item_id] ?? 0);
      if (qty_returned < 0 || qty_returned > it.quantity_approved) {
        setFormError(`จำนวนที่รับคืนต้องอยู่ระหว่าง 0–${it.quantity_approved}`); valid = false; break;
      }
      if (qty_to_repair < 0 || qty_to_repair > qty_returned) {
        setFormError('จำนวนส่งซ่อมต้องไม่เกินจำนวนที่รับคืน'); valid = false; break;
      }
      payload.push({ item_id: it.item_id, quantity_returned: qty_returned, ...(qty_to_repair > 0 ? { quantity_to_repair: qty_to_repair } : {}) });
    }
    if (!valid) return;
    setSaving(true);
    try {
      await confirmReturn(returnId, { items: payload });
      onConfirmed();
    } catch (err) {
      setFormError(err.message);
    } finally { setSaving(false); }
  }

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;

  const conditions = ret.conditions ?? [];
  const items = ret.items ?? [];
  const hasProblems = conditions.length > 0 || ret.all_items_ok === 0 || ret.all_items_ok === false;

  return (
    <>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }} onClick={onBack}>← รายการคืน</button>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>ยืนยันการคืน</h2>
        <StatusBadge status={ret.status} />
      </div>
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-title">ข้อมูลการคืน</div>
        <div className="info-row"><span className="info-label">ชื่อคำขอ:</span> {ret.request_name ?? '-'}</div>
        <div className="info-row"><span className="info-label">ผู้ส่งคืน:</span> {ret.requester_name ?? '-'}</div>
        <div className="info-row"><span className="info-label">วันที่ส่งคืน:</span> {formatDateTime(ret.submitted_at ?? ret.created_at)}</div>
        {ret.note && <div className="info-row"><span className="info-label">หมายเหตุ:</span> {ret.note}</div>}
        <div className="info-row">
          <span className="info-label">สภาพอุปกรณ์:</span>
          {hasProblems ? <span style={{ color: 'var(--error)', fontWeight: 600 }}>มีปัญหา / ชำรุด</span> : <span style={{ color: 'var(--success)', fontWeight: 600 }}>ปกติทุกชิ้น</span>}
        </div>
        {(ret.borrow_request_id ?? ret.request_id) && (
          <div style={{ marginTop: '.75rem' }}>
            <Link to={`/requests/${ret.borrow_request_id ?? ret.request_id}`} className="btn btn-sm btn-secondary" target="_blank">ดูคำขอยืมต้นฉบับ ↗</Link>
          </div>
        )}
      </div>
      {conditions.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--error)' }}>
          <div className="card-title" style={{ color: 'var(--error)' }}>รายงานปัญหา</div>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {conditions.map((c, i) => (
              <li key={i} style={{ marginBottom: '.4rem' }}>
                <strong>{c.item_name ?? c.item_id ?? '-'}</strong>
                {c.condition_type === 'missing' && ' — '}{c.condition_type === 'missing' && <span style={{ color: 'var(--error)' }}>สูญหาย</span>}
                {c.condition_type === 'broken' && ' — '}{c.condition_type === 'broken' && <span style={{ color: 'var(--warning,#d97706)' }}>ชำรุด</span>}
                {c.note ? `: ${c.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ret.status === 'pending' ? (
        <div className="card">
          <div className="card-title">ยืนยันการรับคืน</div>
          <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>ระบุจำนวนที่รับคืนจริงและจำนวนที่ต้องส่งซ่อม (ถ้ามี)</p>
          {formError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="table-wrap" style={{ marginBottom: '1rem' }}>
              <table className="data-table">
                <thead><tr><th>ชื่ออุปกรณ์</th><th>อนุมัติไป</th><th>รับคืนได้ <span className="form-required">*</span></th><th>ส่งซ่อม</th></tr></thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.item_id}>
                      <td>{it.item_name ?? it.item_id ?? '-'}{it.item_unit && <span style={{ color: 'var(--text-muted)', fontSize: '.82em' }}> ({it.item_unit})</span>}</td>
                      <td>{it.quantity_approved}</td>
                      <td>
                        <input type="number" className="form-input" min={0} max={it.quantity_approved}
                          value={returnQtys[it.item_id] ?? it.quantity_approved}
                          onChange={e => setReturnQtys(prev => ({ ...prev, [it.item_id]: e.target.value }))}
                          style={{ width: 80 }} />
                      </td>
                      <td>
                        <input type="number" className="form-input" min={0}
                          value={repairQtys[it.item_id] ?? 0}
                          onChange={e => setRepairQtys(prev => ({ ...prev, [it.item_id]: e.target.value }))}
                          style={{ width: 80 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'ยืนยันการรับคืน'}</button>
              <button type="button" className="btn btn-secondary" onClick={onBack}>ยกเลิก</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card"><p style={{ color: 'var(--text-muted)' }}>รายการนี้ได้รับการยืนยันแล้ว</p></div>
      )}
    </>
  );
}

// ── Visits Tab ────────────────────────────────────────────────────────────────
function VisitsTab({ updateCount }) {
  const [visitStatus, setVisitStatus] = useState('pending');
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visitCounts, setVisitCounts] = useState({ pending: 0, confirmed: 0 });
  const [noteModal, setNoteModal] = useState({ open: false, id: null, action: null, title: '', confirmLabel: '', confirmClass: '' });
  const [confirm, setConfirm] = useState({ open: false, message: '', onConfirm: null, confirmLabel: 'ยืนยัน', confirmClass: 'btn-primary' });

  const loadList = useCallback(async (status) => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (status) params.status = status;
      const res = await getVisits(params);
      setVisits(res?.data ?? []);
    } catch (err) { showError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    async function init() {
      const [p, c] = await Promise.allSettled([
        getVisits({ limit: 100, status: 'pending' }),
        getVisits({ limit: 100, status: 'confirmed' }),
      ]);
      setVisitCounts({ pending: p.status === 'fulfilled' ? (p.value?.data?.length ?? 0) : 0, confirmed: c.status === 'fulfilled' ? (c.value?.data?.length ?? 0) : 0 });
      await loadList('pending');
    }
    init();
  }, []); // eslint-disable-line

  async function handleNoteSubmit(note) {
    const { id, action } = noteModal;
    if (action === 'confirm') await confirmVisit(id, note ? { admin_note: note } : {});
    else if (action === 'reject') await rejectVisit(id, note ? { admin_note: note } : {});
    await loadList(visitStatus);
  }

  function handleComplete(id) {
    setConfirm({ open: true, message: 'ยืนยันว่านัดชมเสร็จสิ้น?', confirmLabel: 'เสร็จสิ้น', confirmClass: 'btn-primary', onConfirm: async () => {
      try { await completeVisit(id); await loadList(visitStatus); } catch (err) { showError(err.message); }
    }});
  }

  function handleCancel(id) {
    setConfirm({ open: true, message: 'ยกเลิกนัดชมนี้?', title: 'ยืนยันการยกเลิก', confirmLabel: 'ยกเลิก', confirmClass: 'btn-danger', onConfirm: async () => {
      try { await cancelVisit(id, {}); await loadList(visitStatus); } catch (err) { showError(err.message); }
    }});
  }

  return (
    <>
      <div className="req-pills">
        {VISIT_STATUS_OPTS.map(([v, l]) => {
          const count = visitCounts[v];
          return (
            <button key={v} className={`req-pill${v === visitStatus ? ' active' : ''}`} onClick={() => { setVisitStatus(v); loadList(v); }}>
              {l}{count > 0 && <span className={`req-pill-count${v === visitStatus ? ' active' : ''}`}>{count}</span>}
            </button>
          );
        })}
      </div>
      {loading ? <Spinner /> : visits.length === 0 ? <p className="empty-text">ไม่มีนัดชม</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>โครงการ / ผู้ขอ</th><th>วันที่</th><th>เวลา</th><th>คน</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {visits.map(v => (
                <tr key={v.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{v.project_name || '-'}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{v.user_name || ''}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(v.visit_date)}</td>
                  <td>{v.visit_time ? v.visit_time.slice(0, 5) : '-'}</td>
                  <td style={{ textAlign: 'center' }}>{v.num_people ?? 1}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                      {v.status === 'pending' && <>
                        <button className="btn btn-sm btn-success" onClick={() => setNoteModal({ open: true, id: v.id, action: 'confirm', title: 'ยืนยันนัดชม', confirmLabel: 'ยืนยัน', confirmClass: 'btn-success' })}>ยืนยัน</button>
                        <button className="btn btn-sm btn-danger"  onClick={() => setNoteModal({ open: true, id: v.id, action: 'reject',  title: 'ปฏิเสธนัดชม',  confirmLabel: 'ปฏิเสธ',  confirmClass: 'btn-danger'  })}>ปฏิเสธ</button>
                      </>}
                      {v.status === 'confirmed' && <>
                        <button className="btn btn-sm btn-primary" onClick={() => handleComplete(v.id)}>เสร็จสิ้น</button>
                        <button className="btn btn-sm btn-danger"  onClick={() => handleCancel(v.id)}>ยกเลิก</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NoteModal
        isOpen={noteModal.open}
        title={noteModal.title}
        confirmLabel={noteModal.confirmLabel}
        confirmClass={noteModal.confirmClass}
        onClose={() => setNoteModal(m => ({ ...m, open: false }))}
        onConfirm={handleNoteSubmit}
      />
      <ConfirmModal isOpen={confirm.open} onClose={() => setConfirm(c => ({ ...c, open: false }))} message={confirm.message} onConfirm={confirm.onConfirm} title={confirm.title} confirmLabel={confirm.confirmLabel} confirmClass={confirm.confirmClass} />
    </>
  );
}

// ── Deposits Tab ──────────────────────────────────────────────────────────────
function DepositsTab({ updateCount }) {
  const [depositStatus, setDepositStatus] = useState('pending');
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noteModal, setNoteModal] = useState({ open: false, id: null, action: null, title: '', confirmLabel: '', confirmClass: '' });

  const loadList = useCallback(async (status) => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (status) params.status = status;
      const res = await getDeposits(params);
      setDeposits(res?.data ?? []);
    } catch (err) { showError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList('pending'); }, [loadList]);

  async function handleNoteSubmit(note) {
    const { id, action } = noteModal;
    if (action === 'approve') await approveDeposit(id, note ? { admin_note: note } : {});
    else if (action === 'reject') await rejectDeposit(id, note ? { admin_note: note } : {});
    updateCount(-1);
    await loadList(depositStatus);
  }

  return (
    <>
      <div className="req-pills">
        {DEPOSIT_STATUS_OPTS.map(([v, l]) => (
          <button key={v} className={`req-pill${v === depositStatus ? ' active' : ''}`} onClick={() => { setDepositStatus(v); loadList(v); }}>{l}</button>
        ))}
      </div>
      {loading ? <Spinner /> : deposits.length === 0 ? <p className="empty-text">ไม่มีรายการฝากของ</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>โครงการ / ผู้ขอ</th><th>วันฝาก</th><th>วันรับคืน</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {deposits.map(d => (
                <tr key={d.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>#{d.id} {d.project_name || '-'}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{d.user_name ?? d.requester_name ?? ''}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(d.deposit_date)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(d.withdraw_date)}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                      {d.status === 'pending' && <>
                        <button className="btn btn-sm btn-success" onClick={() => setNoteModal({ open: true, id: d.id, action: 'approve', title: 'อนุมัติการฝากของ', confirmLabel: 'อนุมัติ', confirmClass: 'btn-success' })}>อนุมัติ</button>
                        <button className="btn btn-sm btn-danger"  onClick={() => setNoteModal({ open: true, id: d.id, action: 'reject',  title: 'ปฏิเสธการฝากของ',  confirmLabel: 'ปฏิเสธ',  confirmClass: 'btn-danger'  })}>ปฏิเสธ</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NoteModal isOpen={noteModal.open} title={noteModal.title} confirmLabel={noteModal.confirmLabel} confirmClass={noteModal.confirmClass} onClose={() => setNoteModal(m => ({ ...m, open: false }))} onConfirm={handleNoteSubmit} />
    </>
  );
}

// ── Storage Tab ───────────────────────────────────────────────────────────────
function StorageTab({ updateCount }) {
  const [storageStatus, setStorageStatus] = useState('pending');
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noteModal, setNoteModal] = useState({ open: false, id: null, action: null, title: '', confirmLabel: '', confirmClass: '' });

  const loadList = useCallback(async (status) => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (status) params.status = status;
      const res = await getStorageAreas(params);
      setAreas(res?.data ?? []);
    } catch (err) { showError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList('pending'); }, [loadList]);

  async function handleNoteSubmit(note) {
    const { id, action } = noteModal;
    if (action === 'approve') await approveStorageArea(id, note ? { admin_note: note } : {});
    else if (action === 'reject') await rejectStorageArea(id, note ? { admin_note: note } : {});
    updateCount(-1);
    await loadList(storageStatus);
  }

  return (
    <>
      <div className="req-pills">
        {STORAGE_STATUS_OPTS.map(([v, l]) => (
          <button key={v} className={`req-pill${v === storageStatus ? ' active' : ''}`} onClick={() => { setStorageStatus(v); loadList(v); }}>{l}</button>
        ))}
      </div>
      {loading ? <Spinner /> : areas.length === 0 ? <p className="empty-text">ไม่มีรายการพื้นที่จัดเก็บ</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>โครงการ / ผู้ขอ</th><th>วันเริ่ม</th><th>วันสิ้นสุด</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {areas.map(a => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>#{a.id} {a.project_name || '-'}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{a.user_name ?? a.requester_name ?? ''}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.start_date)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.end_date)}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                      {a.status === 'pending' && <>
                        <button className="btn btn-sm btn-success" onClick={() => setNoteModal({ open: true, id: a.id, action: 'approve', title: 'อนุมัติพื้นที่จัดเก็บ', confirmLabel: 'อนุมัติ', confirmClass: 'btn-success' })}>อนุมัติ</button>
                        <button className="btn btn-sm btn-danger"  onClick={() => setNoteModal({ open: true, id: a.id, action: 'reject',  title: 'ปฏิเสธพื้นที่จัดเก็บ',  confirmLabel: 'ปฏิเสธ',  confirmClass: 'btn-danger'  })}>ปฏิเสธ</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NoteModal isOpen={noteModal.open} title={noteModal.title} confirmLabel={noteModal.confirmLabel} confirmClass={noteModal.confirmClass} onClose={() => setNoteModal(m => ({ ...m, open: false }))} onConfirm={handleNoteSubmit} />
    </>
  );
}

// ── Donations Tab ─────────────────────────────────────────────────────────────
function DonationsTab({ updateCount }) {
  const [donationStatus, setDonationStatus] = useState('pending');
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, message: '', onConfirm: null });

  const loadList = useCallback(async (status) => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (status) params.status = status;
      const res = await getDonations(params);
      setDonations(res?.data ?? []);
    } catch (err) { showError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList('pending'); }, [loadList]);

  function handleComplete(id) {
    setConfirm({ open: true, message: 'ยืนยันรับบริจาคนี้?', confirmLabel: 'ยืนยันรับบริจาค', onConfirm: async () => {
      try { await completeDonation(id); await loadList(donationStatus); } catch (err) { showError(err.message); }
    }});
  }

  if (detail) return <DonationDetail donationId={detail} onBack={() => { setDetail(null); loadList(donationStatus); }} onDecided={() => { updateCount(-1); setDetail(null); loadList(donationStatus); }} />;

  return (
    <>
      <div className="req-pills">
        {DONATION_STATUS_OPTS.map(([v, l]) => (
          <button key={v} className={`req-pill${v === donationStatus ? ' active' : ''}`} onClick={() => { setDonationStatus(v); loadList(v); }}>{l}</button>
        ))}
      </div>
      {loading ? <Spinner /> : donations.length === 0 ? <p className="empty-text">ไม่มีรายการบริจาค</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>โครงการ / ผู้ขอ</th><th>วันบริจาค</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {donations.map(d => (
                <tr key={d.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>#{d.id} {d.project_name || '-'}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{d.user_name ?? d.requester_name ?? ''}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(d.donation_date)}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                      {d.status === 'pending' && <button className="btn btn-sm btn-secondary" onClick={() => setDetail(d.id)}>ตรวจสอบรายการ</button>}
                      {d.status === 'donated'  && <button className="btn btn-sm btn-primary"  onClick={() => handleComplete(d.id)}>ยืนยันรับบริจาค</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmModal isOpen={confirm.open} onClose={() => setConfirm(c => ({ ...c, open: false }))} message={confirm.message} onConfirm={confirm.onConfirm} confirmLabel={confirm.confirmLabel} />
    </>
  );
}

function DonationDetail({ donationId, onBack, onDecided }) {
  const [don, setDon] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [itemsError, setItemsError] = useState('');
  const [noteModal, setNoteModal] = useState({ open: false, action: null });
  const [saving, setSaving] = useState({});
  const [donItemQty, setDonItemQty] = useState({});

  useEffect(() => {
    getDonation(donationId)
      .then(res => { const d = res?.data ?? res; setDon(d); setItems(d.items ?? []); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [donationId]);

  async function handleItemAction(itemId, status, qty) {
    setSaving(prev => ({ ...prev, [itemId]: true }));
    setItemsError('');
    try {
      await reviewDonationItem(donationId, itemId, { item_status: status, ...(status === 'approved' ? { quantity_approved: qty } : {}) });
      setItems(prev => prev.map(it => String(it.id) === String(itemId) ? { ...it, item_status: status, ...(status === 'approved' ? { quantity_approved: qty } : {}) } : it));
    } catch (err) {
      setItemsError(err.message);
    } finally {
      setSaving(prev => ({ ...prev, [itemId]: false }));
    }
  }

  async function handleDecision(note) {
    const { action } = noteModal;
    if (action === 'approve') await approveDonation(donationId, note ? { admin_note: note } : {});
    else if (action === 'reject') await rejectDonation(donationId, note ? { admin_note: note } : {});
    onDecided();
  }

  const allReviewed = items.length > 0 && items.every(it => it.item_status && it.item_status !== 'pending');

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }} onClick={onBack}>← รายการบริจาค</button>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>ตรวจสอบการบริจาค</h2>
        <StatusBadge status={don.status} />
      </div>
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-title">ข้อมูลการบริจาค</div>
        <div className="info-row"><span className="info-label">โครงการ:</span> {don.project_name ?? '-'}</div>
        <div className="info-row"><span className="info-label">ผู้บริจาค:</span> {don.user_name ?? don.requester_name ?? '-'}</div>
        {don.donation_date && <div className="info-row"><span className="info-label">วันบริจาค:</span> {formatDate(don.donation_date)}</div>}
      </div>
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-title">รายการสิ่งของ</div>
        <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>ตรวจสอบแต่ละรายการก่อนอนุมัติหรือปฏิเสธทั้งหมด</p>
        {itemsError && <div className="alert alert-error" style={{ marginBottom: '.75rem' }}>{itemsError}</div>}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>รายการ</th><th>จำนวนที่บริจาค</th><th>จำนวนที่อนุมัติ</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
              {items.map(it => {
                const statusEl = it.item_status === 'approved'
                  ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>อนุมัติ</span>
                  : it.item_status === 'rejected'
                  ? <span style={{ color: 'var(--error)', fontWeight: 600 }}>ปฏิเสธ</span>
                  : <span style={{ color: 'var(--text-muted)' }}>รอตรวจสอบ</span>;
                return (
                  <tr key={it.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{it.item_name ?? it.proposed_name ?? '-'}</div>
                      {it.proposed_description && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{it.proposed_description}</div>}
                    </td>
                    <td style={{ textAlign: 'center' }}>{it.quantity_donated ?? '-'}</td>
                    <td style={{ textAlign: 'center' }}>{it.quantity_approved != null ? it.quantity_approved : '-'}</td>
                    <td>{statusEl}</td>
                    <td>
                      {it.item_status === 'pending' && (
                        <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type="number" className="form-input" min={1}
                            value={donItemQty[it.id] ?? (it.quantity_donated ?? 1)}
                            onChange={e => setDonItemQty(prev => ({ ...prev, [it.id]: parseInt(e.target.value) || 1 }))}
                            style={{ width: 70 }} />
                          <button className="btn btn-sm btn-success" disabled={saving[it.id]} onClick={() => {
                            handleItemAction(it.id, 'approved', donItemQty[it.id] ?? (it.quantity_donated ?? 1));
                          }}>อนุมัติ</button>
                          <button className="btn btn-sm btn-danger" disabled={saving[it.id]} onClick={() => handleItemAction(it.id, 'rejected')}>ปฏิเสธ</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {don.status === 'pending' && (
        <div className="card">
          <div className="card-title">ตัดสินใจ</div>
          {!allReviewed && <p style={{ fontSize: '.82rem', color: 'var(--warning,#d97706)', marginBottom: '.75rem' }}>ต้องตรวจสอบทุกรายการก่อนอนุมัติ</p>}
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-success" disabled={!allReviewed} onClick={() => setNoteModal({ open: true, action: 'approve' })}>อนุมัติทั้งหมด</button>
            <button className="btn btn-danger" onClick={() => setNoteModal({ open: true, action: 'reject' })}>ปฏิเสธทั้งหมด</button>
          </div>
        </div>
      )}
      <NoteModal
        isOpen={noteModal.open}
        title={noteModal.action === 'approve' ? 'อนุมัติการบริจาค' : 'ปฏิเสธการบริจาค'}
        confirmLabel={noteModal.action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'}
        confirmClass={noteModal.action === 'approve' ? 'btn-success' : 'btn-danger'}
        onClose={() => setNoteModal(m => ({ ...m, open: false }))}
        onConfirm={handleDecision}
      />
    </>
  );
}

// ── Shared NoteModal ──────────────────────────────────────────────────────────
function NoteModal({ isOpen, onClose, title, confirmLabel, confirmClass, onConfirm }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!isOpen) { setNote(''); setSaving(false); setError(''); } }, [isOpen]);

  async function handleOk() {
    setSaving(true); setError('');
    try {
      await onConfirm(note.trim());
      onClose();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="form-group">
        <label className="form-label">หมายเหตุ <span style={{ color: 'var(--text-muted)', fontSize: '.85em' }}>(ไม่บังคับ)</span></label>
        <textarea className="form-textarea" value={note} onChange={e => setNote(e.target.value)} style={{ minHeight: 60 }} placeholder="หมายเหตุ" />
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: '.75rem' }}>{error}</div>}
      <div className="modal-actions" style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className={`btn ${confirmClass}`} disabled={saving} onClick={handleOk}>{saving ? 'กำลังบันทึก…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}
