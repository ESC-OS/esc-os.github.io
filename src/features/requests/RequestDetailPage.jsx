import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getRequest, getRequestReturns, getReturn,
  addRequestItem, removeRequestItem, adjustRequestItem,
  submitRequest, cancelRequest, unsubmitRequest, processRequest, markReady, confirmPickup,
  getConditions, submitConditions, submitReturn, confirmReturn, uploadPhoto,
  updateRequest, getSlots, getHolidays,
} from '../../api/api';
import { formatDateTime, formatCountdown } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import Modal from '../../shared/Modal';
import ConfirmModal from '../../shared/ConfirmModal';
import { fetchPhotoUrl } from '../../api/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function thaiDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  const DAYS   = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()+543}`;
}

// ── Calendar component (used for inline calendars) ────────────────────────────

const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                   'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const DOW_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function CalendarPicker({ availDates, selected, onSelect, label }) {
  const availSet = new Set(availDates);
  const todayStr = toDateStr(new Date());

  const initDate = selected || (availDates.length ? availDates[0] : null);
  const initD = initDate ? new Date(initDate + 'T00:00:00') : new Date();
  const [cy, setCy] = useState(initD.getFullYear());
  const [cm, setCm] = useState(initD.getMonth());

  const firstDow  = new Date(cy, cm, 1).getDay();
  const daysInMo  = new Date(cy, cm + 1, 0).getDate();

  const fa = availDates.length ? new Date(availDates[0] + 'T00:00:00') : null;
  const la = availDates.length ? new Date(availDates[availDates.length-1] + 'T00:00:00') : null;
  const canPrev = fa && (cy * 12 + cm) > (fa.getFullYear() * 12 + fa.getMonth());
  const canNext = la && (cy * 12 + cm) < (la.getFullYear() * 12 + la.getMonth());

  function prevMonth() { if (!canPrev) return; if (cm === 0) { setCm(11); setCy(y => y-1); } else setCm(m => m-1); }
  function nextMonth() { if (!canNext) return; if (cm === 11) { setCm(0); setCy(y => y+1); } else setCm(m => m+1); }

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMo; d++) {
    const ds = `${cy}-${String(cm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push(ds);
  }

  return (
    <div>
      {label && <label className="form-label">{label}</label>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.65rem' }}>
        <button type="button" onClick={prevMonth} disabled={!canPrev}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', width: '28px', height: '28px', cursor: canPrev ? 'pointer' : 'default', color: canPrev ? 'var(--text)' : 'var(--border-strong)' }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: '.88em' }}>{MONTHS_TH[cm]} {cy + 543}</span>
        <button type="button" onClick={nextMonth} disabled={!canNext}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', width: '28px', height: '28px', cursor: canNext ? 'pointer' : 'default', color: canNext ? 'var(--text)' : 'var(--border-strong)' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '1px' }}>
        {DOW_TH.map((d, i) => (
          <div key={d} style={{ fontSize: '.7em', fontWeight: 700, textAlign: 'center', padding: '.3rem 0', color: i===0 ? 'var(--error)' : 'var(--text-muted)' }}>{d}</div>
        ))}
        {cells.map((ds, i) => {
          if (!ds) return <div key={`e${i}`} />;
          const ok    = availSet.has(ds);
          const isSel = ds === selected;
          const isTdy = ds === todayStr;
          const d = parseInt(ds.split('-')[2]);
          let style = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', fontSize: '.85em', margin: '1px auto', borderRadius: '50%' };
          if (isSel) { style = { ...style, background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }; }
          else if (ok) { style = { ...style, color: isTdy ? 'var(--primary)' : 'var(--text)', cursor: 'pointer', boxShadow: isTdy ? 'inset 0 0 0 1.5px var(--primary)' : 'none', fontWeight: isTdy ? 700 : 400 }; }
          else { style = { ...style, color: 'var(--border-strong)' }; }
          return (
            <div key={ds} style={style} onClick={() => ok && onSelect(ds)}>
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Time Buttons ──────────────────────────────────────────────────────────────

function TimePicker({ times, selected, onSelect }) {
  const onStyle  = { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontWeight: 700, boxShadow: '0 2px 6px rgba(123,23,40,.25)' };
  const offStyle = { background: '#fff', color: 'var(--text)', borderColor: 'var(--border-strong)' };

  if (!times || times.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '.88em' }}>ไม่มีเวลาให้เลือกในวันนี้</span>;
  }

  return (
    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.3rem' }}>
      {times.map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onSelect(t)}
          style={{ padding: '.45rem 1.4rem', borderRadius: '999px', border: '1.5px solid', fontSize: '.95em', cursor: 'pointer', transition: 'all .15s', ...(t === selected ? onStyle : offStyle) }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ── DropdownCalendar: trigger button + absolute calendar panel ────────────────

function DropdownCalendar({ label, value, availDates, onSelect, timesByDay, selectedTime, onSelectTime }) {
  const [open, setOpen]     = useState(false);
  const wrapRef             = useRef(null);
  const timesForDay = value ? (timesByDay[new Date(value + 'T00:00:00').getDay()] ?? []) : [];

  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div>
      <div className="form-group">
        <label className="form-label">{label} <span className="form-required">*</span></label>
        <div ref={wrapRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            style={{
              width: '100%', textAlign: 'left', padding: '.55rem .75rem', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '.9em', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', color: value ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            <span>{value ? thaiDate(value) : 'เลือกวัน...'}</span>
            <span style={{ fontSize: '.7em', color: 'var(--text-muted)' }}>▼</span>
          </button>
          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
              boxShadow: 'var(--shadow-md)', padding: '1rem', minWidth: '280px',
            }}>
              <CalendarPicker
                availDates={availDates}
                selected={value}
                onSelect={ds => { onSelect(ds); setOpen(false); }}
              />
            </div>
          )}
        </div>
      </div>
      {value && (
        <div className="form-group">
          <label className="form-label">เวลา <span className="form-required">*</span></label>
          <TimePicker times={timesForDay} selected={selectedTime} onSelect={onSelectTime} />
        </div>
      )}
    </div>
  );
}

// ── AuthPhoto: loads photo with auth header ───────────────────────────────────

function AuthPhoto({ photoKey, alt, style }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!photoKey) return;
    fetchPhotoUrl(photoKey).then(url => { if (url) setSrc(url); });
  }, [photoKey]);
  if (!src) return null;
  return <img src={src} alt={alt || ''} style={style} />;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RequestDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [request, setRequest]     = useState(null);
  const [returns, setReturns]     = useState([]);
  const [conditions, setConditions] = useState([]);
  const [returnDetail, setReturnDetail] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [actionError, setActionError] = useState('');

  // Slot data (for draft and processing views)
  const [uniquePickupDates, setUniquePickupDates] = useState([]);
  const [uniqueReturnDates, setUniqueReturnDates] = useState([]);
  const [timesByDay, setTimesByDay] = useState({});

  // Draft submit state
  const [pickedDate, setPickedDate]     = useState('');
  const [pickedTime, setPickedTime]     = useState('');
  const [pickedReturn, setPickedReturn] = useState('');
  const [pickedReturnTime, setPickedReturnTime] = useState('');
  const [submitMsg, setSubmitMsg]       = useState('');

  // Edit quantity mode (draft)
  const [editQtyMode, setEditQtyMode]   = useState(false);
  const [editQtyValues, setEditQtyValues] = useState({});
  const [savingQty, setSavingQty]       = useState(false);

  // Condition report state
  const [condIssues, setCondIssues]     = useState([]);
  const [condAddSel, setCondAddSel]     = useState('');
  const [condMsg, setCondMsg]           = useState('');
  const [savingCond, setSavingCond]     = useState(false);

  // Return form state
  const [returnPhoto, setReturnPhoto]   = useState(null);
  const [returnAllOk, setReturnAllOk]   = useState(true);
  const [returnNote, setReturnNote]     = useState('');
  const [returnMsg, setReturnMsg]       = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // Confirm return (admin)
  const [confirmReturnItems, setConfirmReturnItems] = useState([]);
  const [confirmReturnError, setConfirmReturnError] = useState('');
  const [confirmingReturn, setConfirmingReturn]     = useState(false);

  // Modals
  const [unsubmitModal, setUnsubmitModal]   = useState(false);
  const [cancelModal, setCancelModal]       = useState(false);
  const [pickupModal, setPickupModal]       = useState(false);
  const [readyModal, setReadyModal]         = useState(false);
  const [processNote, setProcessNote]       = useState('');

  // Ready modal state
  const [readyDate, setReadyDate]   = useState('');
  const [readyTime, setReadyTime]   = useState('');
  const [readyError, setReadyError] = useState('');
  const [savingReady, setSavingReady] = useState(false);

  // Pickup photo modal
  const [pickupPhoto, setPickupPhoto] = useState(null);
  const [pickupMsg, setPickupMsg]     = useState('');
  const [uploadingPickup, setUploadingPickup] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reqRes, retRes, condRes] = await Promise.all([
        getRequest(id),
        getRequestReturns(id).catch(() => ({ data: [] })),
        getConditions(id).catch(() => ({ data: [] })),
      ]);
      const req  = reqRes?.data;
      const rets = retRes?.data ?? [];
      const conds = condRes?.data ?? [];

      setRequest(req);
      setReturns(rets);
      setConditions(conds);

      let retDet = null;
      if (req?.status === 'returned' && user?.role === 'admin') {
        const pending = rets.find(r => r.status === 'pending');
        if (pending) retDet = await getReturn(pending.id).then(r => r?.data ?? r).catch(() => null);
      }
      setReturnDetail(retDet);

      // Build confirm return items table
      if (req?.status === 'returned' && user?.role === 'admin') {
        const pending = rets.find(r => r.status === 'pending');
        if (pending) {
          const items = (retDet?.items ?? (req.items ?? []).filter(it => (it.quantity_approved ?? 0) > 0));
          setConfirmReturnItems(items.map(it => ({
            item_id:            it.item_id ?? it.id,
            item_name:          it.item_name ?? it.name ?? '-',
            item_unit:          it.item_unit ?? it.unit ?? '',
            quantity_approved:  it.quantity_approved ?? 0,
            quantity_returned:  it.quantity_returned  ?? it.quantity_approved ?? 0,
            quantity_to_repair: it.quantity_to_repair ?? 0,
          })));
        }
      }

      // Restore draft date/time picks from saved values
      if (req) {
        setPickedDate(req.requested_pickup_datetime?.slice(0, 10) ?? '');
        setPickedTime(req.requested_pickup_datetime?.slice(11, 16) ?? '');
        setPickedReturn(req.requested_return_datetime?.slice(0, 10) ?? '');
        setPickedReturnTime(req.requested_return_datetime?.slice(11, 16) ?? '');
      }

      // Initialize condition report issues from existing conditions
      if (conds.length > 0 && req) {
        const approvedItems = (req.items ?? []).filter(it => (it.quantity_approved ?? 0) > 0);
        const issueFromCond = conds
          .filter(c => c.condition_type && c.condition_type !== 'ok')
          .map(c => {
            const it = approvedItems.find(i => i.id === c.borrow_request_item_id);
            return it ? {
              reqItemId:      c.borrow_request_item_id,
              item_name:      it.item_name,
              quantity_approved: it.quantity_approved,
              unit:           it.unit || 'ชิ้น',
              condition_type: c.condition_type,
              note:           c.note || '',
            } : null;
          })
          .filter(Boolean);
        setCondIssues(issueFromCond);
      } else {
        setCondIssues([]);
      }

      // Load slot data when needed
      const status  = req?.status;
      const isOwner = !user || user.role !== 'admin';
      const isAdminUser = user?.role === 'admin';
      if ((status === 'draft' && isOwner) || (status === 'processing' && isAdminUser)) {
        await loadSlots(status, isOwner, isAdminUser);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSlots(status, isOwner, isAdminUser) {
    const DAY_NUM = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 };
    try {
      const slotsRes = await getSlots('borrow').catch(() => ({ data: [] }));
      const active = (slotsRes?.data ?? []).filter(s => s.is_active);
      const allowedDays = new Set(active.map(s => DAY_NUM[s.day_of_week]).filter(n => n != null));
      const tbd = {};
      active.forEach(s => {
        const dn = DAY_NUM[s.day_of_week];
        if (dn == null) return;
        if (!tbd[dn]) tbd[dn] = [];
        const t = s.time.slice(0,5);
        if (!tbd[dn].includes(t)) tbd[dn].push(t);
      });
      Object.keys(tbd).forEach(k => tbd[k].sort());
      setTimesByDay(tbd);

      const start = new Date(); start.setDate(start.getDate() + 1);
      const end   = new Date(); end.setDate(end.getDate() + 60);
      const pickup = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (allowedDays.has(d.getDay())) pickup.push(toDateStr(new Date(d)));
      }

      let ret = [];
      if (status === 'draft' && isOwner) {
        const retEnd = new Date(); retEnd.setDate(retEnd.getDate() + 90);
        for (let d = new Date(start); d <= retEnd; d.setDate(d.getDate() + 1)) {
          if (allowedDays.has(d.getDay())) ret.push(toDateStr(new Date(d)));
        }
      }

      // Filter holidays
      const startYear = start.getFullYear();
      const endYear   = new Date(Date.now() + 90 * 864e5).getFullYear();
      const hdYears   = startYear === endYear ? [startYear] : [startYear, endYear];
      const hdResults = await Promise.all(hdYears.map(y => getHolidays(y).catch(() => ({ data: [] }))));
      const holidaySet = new Set(hdResults.flatMap(r => (r?.data ?? []).map(hd => hd.date)));

      setUniquePickupDates(pickup.filter(ds => !holidaySet.has(ds)));
      setUniqueReturnDates(ret.filter(ds => !holidaySet.has(ds)));
    } catch {}
  }

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <Spinner />;
  if (error)   return <div className="alert alert-error">{error}</div>;
  if (!request) return <div className="alert alert-error">ไม่พบคำขอ</div>;

  const status  = request.status;
  const items   = request.items ?? [];
  const isAdmin = user?.role === 'admin';
  const isOwner = !isAdmin; // non-admins can only fetch their own
  const approvedItems = items.filter(it => (it.quantity_approved ?? 0) > 0);
  const showApproved  = ['processing','ready_for_pickup','in_lend','returned','completed'].includes(status);
  const inLend        = status === 'in_lend';
  const condDone      = !!request.condition_reported_at;

  const noSlots = uniquePickupDates.length === 0;

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleUnsubmit() {
    try { await unsubmitRequest(id); await loadData(); }
    catch (err) { setActionError(err.message); }
  }

  async function handleCancel() {
    try { await cancelRequest(id); await loadData(); }
    catch (err) { setActionError(err.message); }
  }

  async function handleProcess() {
    try {
      await processRequest(id, { admin_note: processNote || undefined });
      await loadData();
    } catch (err) { setActionError(err.message); }
  }

  async function handleRemoveItem(itemId) {
    try { await removeRequestItem(id, itemId); await loadData(); }
    catch (err) { setActionError(err.message); }
  }

  async function handleSaveQty() {
    setSavingQty(true);
    try {
      const changed = Object.entries(editQtyValues).filter(([itemId, qty]) => {
        const orig = items.find(it => (it.item_id || it.id) === itemId);
        return orig && parseInt(qty) !== parseInt(orig.quantity_requested) && parseInt(qty) >= 1;
      });
      if (changed.length === 0) { setEditQtyMode(false); setSavingQty(false); return; }
      for (const [itemId, qty] of changed) {
        await removeRequestItem(id, itemId);
        await addRequestItem(id, { item_id: itemId, quantity_requested: parseInt(qty) });
      }
      setEditQtyMode(false);
      setEditQtyValues({});
      await loadData();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSavingQty(false);
    }
  }

  async function handleAdjustQty(itemId, qty) {
    try {
      await adjustRequestItem(id, itemId, { quantity_approved: qty });
    } catch (err) { setActionError(err.message); }
  }

  async function handleSubmitDraft() {
    setSubmitMsg('');
    if (!pickedDate)       { setSubmitMsg('กรุณาเลือกวันรับอุปกรณ์');   return; }
    if (!pickedTime)       { setSubmitMsg('กรุณาเลือกเวลารับอุปกรณ์');  return; }
    if (!pickedReturn)     { setSubmitMsg('กรุณาเลือกวันคืนอุปกรณ์');   return; }
    if (!pickedReturnTime) { setSubmitMsg('กรุณาเลือกเวลาคืนอุปกรณ์'); return; }

    try {
      await updateRequest(id, {
        requested_pickup_datetime: `${pickedDate}T${pickedTime}`,
        requested_return_datetime:  `${pickedReturn}T${pickedReturnTime}`,
      });
      await submitRequest(id);
      await loadData();
    } catch (err) {
      setSubmitMsg(err.message);
    }
  }

  async function handleMarkReady() {
    setReadyError('');
    if (!readyDate) { setReadyError('กรุณาเลือกวันรับ'); return; }
    if (!readyTime) { setReadyError('กรุณาเลือกเวลารับ'); return; }
    setSavingReady(true);
    try {
      await markReady(id, { confirmed_pickup_datetime: `${readyDate}T${readyTime}` });
      setReadyModal(false);
      await loadData();
    } catch (err) {
      setReadyError(err.message);
    } finally {
      setSavingReady(false);
    }
  }

  async function handleConfirmPickup() {
    if (!pickupPhoto) { setPickupMsg('กรุณาเลือกรูปถ่าย'); return; }
    setUploadingPickup(true);
    setPickupMsg('');
    try {
      const r2Key = await uploadPhoto(pickupPhoto);
      await confirmPickup(id, { photo_r2_key: r2Key });
      setPickupModal(false);
      setPickupPhoto(null);
      await loadData();
    } catch (err) {
      setPickupMsg(err.message);
    } finally {
      setUploadingPickup(false);
    }
  }

  async function handleSubmitReturn() {
    if (!returnPhoto) { setReturnMsg('กรุณาเลือกรูปถ่าย'); return; }
    setSubmittingReturn(true);
    setReturnMsg('');
    try {
      const r2Key = await uploadPhoto(returnPhoto);
      await submitReturn(id, { photo_r2_key: r2Key, all_items_ok: returnAllOk ? 1 : 0, note: returnNote || undefined });
      await loadData();
    } catch (err) {
      setReturnMsg(err.message);
    } finally {
      setSubmittingReturn(false);
    }
  }

  async function handleSaveConditions() {
    setSavingCond(true);
    setCondMsg('');
    try {
      const condItems = condIssues.map(issue => ({
        borrow_request_item_id: issue.reqItemId,
        condition_type: issue.condition_type,
        ...(issue.note ? { note: issue.note } : {}),
      }));
      await submitConditions(id, { conditions: condItems });
      await loadData();
    } catch (err) {
      setCondMsg(err.message);
    } finally {
      setSavingCond(false);
    }
  }

  async function handleConfirmReturn(e) {
    e.preventDefault();
    setConfirmReturnError('');
    const pending = returns.find(r => r.status === 'pending');
    if (!pending) return;

    let valid = true;
    const payload = [];
    for (const it of confirmReturnItems) {
      const qty_returned  = it.quantity_returned ?? it.quantity_approved;
      const qty_to_repair = it.quantity_to_repair ?? 0;
      if (qty_returned < 0 || qty_returned > it.quantity_approved) {
        setConfirmReturnError(`จำนวนที่รับคืนต้องอยู่ระหว่าง 0–${it.quantity_approved}`); valid = false; break;
      }
      if (qty_to_repair > qty_returned) {
        setConfirmReturnError('จำนวนส่งซ่อมต้องไม่เกินจำนวนที่รับคืน'); valid = false; break;
      }
      payload.push({
        item_id:           it.item_id,
        quantity_returned: qty_returned,
        ...(qty_to_repair > 0 ? { quantity_to_repair: qty_to_repair } : {}),
      });
    }
    if (!valid) return;

    setConfirmingReturn(true);
    try {
      await confirmReturn(pending.id, { items: payload });
      await loadData();
    } catch (err) {
      setConfirmReturnError(err.message);
    } finally {
      setConfirmingReturn(false);
    }
  }

  function addCondIssue() {
    if (!condAddSel) return;
    const it = approvedItems.find(i => String(i.id) === String(condAddSel));
    if (!it || condIssues.some(c => String(c.reqItemId) === String(condAddSel))) return;
    setCondIssues(prev => [...prev, {
      reqItemId:      it.id,
      item_name:      it.item_name,
      quantity_approved: it.quantity_approved,
      unit:           it.unit || 'ชิ้น',
      condition_type: 'missing',
      note:           '',
    }]);
    setCondAddSel('');
  }

  function removeCondIssue(reqItemId) {
    setCondIssues(prev => prev.filter(c => String(c.reqItemId) !== String(reqItemId)));
  }

  function updateCondIssue(reqItemId, field, value) {
    setCondIssues(prev => prev.map(c => String(c.reqItemId) === String(reqItemId) ? { ...c, [field]: value } : c));
  }

  const availableForCond = approvedItems.filter(it => !condIssues.some(c => String(c.reqItemId) === String(it.id)));
  const condProblems = conditions.filter(c => c.condition_type);

  // ── Items Table ─────────────────────────────────────────────────────────────

  const canEditDraft = isOwner && status === 'draft';
  const canRemoveDraft = isOwner && status === 'draft';
  const canAdminEdit = isAdmin && status === 'processing';

  // Track per-item confirm state for admin processing
  const [adjConfirmed, setAdjConfirmed] = useState({});
  const adjValues = useRef({});

  const allAdjConfirmed = items.length > 0 && items.every(it => adjConfirmed[it.item_id || it.id]);

  return (
    <>
      <Link to="/requests" className="back-btn">← คำขอยืม</Link>

      {/* Header */}
      <div className="req-header">
        <div className="req-title-row">
          <span className="req-id">#{id}</span>
          <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{request.name || '-'}</span>
          <StatusBadge status={status} />
          {request.is_overdue && <span className="badge badge-overdue">เกินกำหนด</span>}
        </div>
      </div>

      {actionError && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{actionError}
          <button style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setActionError('')}>✕</button>
        </div>
      )}

      {/* Info card */}
      <div className="card">
        <div className="card-title">ข้อมูลคำขอ</div>
        <div className="req-info-grid">
          <div className="info-row"><span className="info-label">โครงการ</span><span>{request.project_name || request.project_id || '-'}</span></div>
          <div className="info-row"><span className="info-label">ผู้ขอ</span><span>{request.user_name || request.requester_name || request.owner_name || (request.user && request.user.name) || '-'}</span></div>
          <div className="info-row"><span className="info-label">วันรับอุปกรณ์</span><span>{formatDateTime(request.requested_pickup_datetime)}</span></div>
          <div className="info-row"><span className="info-label">วันคืนอุปกรณ์</span><span>{formatDateTime(request.requested_return_datetime)}</span></div>
          {request.confirmed_pickup_datetime && (
            <div className="info-row"><span className="info-label">วันรับที่ยืนยัน</span><span>{formatDateTime(request.confirmed_pickup_datetime)}</span></div>
          )}
          {request.pickup_timeout_at && status === 'ready_for_pickup' && (
            <div className="info-row"><span className="info-label">หมดเวลารับ</span><span className="countdown">{formatCountdown(request.pickup_timeout_at)}</span></div>
          )}
          {request.submitted_at && (
            <div className="info-row"><span className="info-label">ส่งเมื่อ</span><span>{formatDateTime(request.submitted_at)}</span></div>
          )}
        </div>
        {request.admin_note && (
          <div className="alert alert-info" style={{ marginTop: '.75rem' }}>หมายเหตุจากเจ้าหน้าที่: {request.admin_note}</div>
        )}
      </div>

      {/* Action buttons */}
      <div className="actions-bar" style={{ marginBottom: '1rem' }}>
        {isOwner && status === 'draft' && (
          <button className="btn btn-danger" onClick={() => setCancelModal(true)}>ยกเลิกคำขอ</button>
        )}
        {isOwner && status === 'pending' && <>
          <button className="btn btn-secondary" onClick={() => setUnsubmitModal(true)}>ยกเลิกการส่ง (กลับเป็นร่าง)</button>
          <button className="btn btn-danger" onClick={() => setCancelModal(true)}>ยกเลิกคำขอ</button>
        </>}
        {isAdmin && status === 'processing' && <>
          <button className="btn btn-success" disabled={!allAdjConfirmed} onClick={() => setReadyModal(true)}>พร้อมรับ</button>
          <button className="btn btn-danger" onClick={() => setCancelModal(true)}>ยกเลิก</button>
        </>}
        {(isOwner || isAdmin) && status === 'ready_for_pickup' && (
          <button className="btn btn-success" onClick={() => { setPickupPhoto(null); setPickupMsg(''); setPickupModal(true); }}>รับอุปกรณ์</button>
        )}
      </div>

      {/* Items card */}
      <div className="card">
        <div className="card-title">
          รายการอุปกรณ์{items.length > 0 && <span style={{ fontSize: '.85em', color: 'var(--text-muted)' }}> ({items.length})</span>}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="req-items-table">
            <thead>
              <tr>
                <th style={{ width: '7rem' }}>รหัส</th>
                <th>ชื่ออุปกรณ์</th>
                {canAdminEdit && <th style={{ width: '6rem' }}>ตำแหน่ง</th>}
                <th style={{ textAlign: 'center', width: '6rem' }}>จำนวนขอ</th>
                {showApproved && <th style={{ textAlign: 'center', width: '6rem' }}>จำนวนอนุมัติ</th>}
                <th style={{ width: '5rem' }}>หน่วย</th>
                {canAdminEdit && <th style={{ width: '10rem' }}>ปรับจำนวน</th>}
                {canRemoveDraft && <th style={{ width: '3rem' }} />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>ยังไม่มีอุปกรณ์</td></tr>
              ) : items.map(it => {
                const itId = it.item_id || it.id;
                const confirmed = adjConfirmed[itId];
                return (
                  <tr key={itId} style={confirmed !== undefined ? { background: confirmed ? 'var(--success-bg)' : 'var(--error-bg)', transition: 'background .25s' } : {}}>
                    <td style={{ fontSize: '.82em', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{it.item_id || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        {it.photo_r2_key
                          ? <AuthPhoto photoKey={it.photo_r2_key} style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0, border: '1px solid var(--border)' }} />
                          : <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: 'var(--surface-hover,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9em', flexShrink: 0, border: '1px solid var(--border)' }}>📦</div>}
                        <span>{it.item_name || it.name || '-'}</span>
                      </div>
                    </td>
                    {canAdminEdit && (
                      <td style={{ fontFamily: 'monospace', fontSize: '.85em', color: it.item_stock_location ? 'var(--text)' : 'var(--text-muted)' }}>
                        {it.item_stock_location || '-'}
                      </td>
                    )}
                    <td style={{ textAlign: 'center' }}>
                      {canEditDraft && editQtyMode ? (
                        <input
                          type="number"
                          className="qty-input"
                          value={editQtyValues[itId] ?? it.quantity_requested ?? 1}
                          min={1}
                          style={{ width: '52px', textAlign: 'center', fontSize: '.88em' }}
                          onChange={e => setEditQtyValues(prev => ({ ...prev, [itId]: e.target.value }))}
                        />
                      ) : (
                        it.quantity_requested ?? '-'
                      )}
                    </td>
                    {showApproved && <td style={{ textAlign: 'center' }}>{it.quantity_approved != null ? it.quantity_approved : '-'}</td>}
                    <td style={{ color: (it.item_unit || it.unit) ? 'inherit' : 'var(--text-muted)' }}>{it.item_unit || it.unit || '-'}</td>
                    {canAdminEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                          <input
                            type="number"
                            className="qty-input adj-qty"
                            style={{ width: '70px' }}
                            defaultValue={it.quantity_approved ?? it.quantity_requested}
                            min={0}
                            max={it.quantity_requested}
                            onChange={e => { adjValues.current[itId] = parseInt(e.target.value); }}
                          />
                          <button
                            className="adj-tick do-adj"
                            title="บันทึก"
                            style={{
                              background: confirmed !== undefined ? (confirmed ? 'var(--success)' : 'var(--error)') : '',
                              borderColor: confirmed !== undefined ? (confirmed ? 'var(--success)' : 'var(--error)') : '',
                              color: confirmed !== undefined ? '#fff' : '',
                            }}
                            onClick={async () => {
                              if (confirmed) {
                                setAdjConfirmed(prev => { const n = { ...prev }; delete n[itId]; return n; });
                                return;
                              }
                              const qty = adjValues.current[itId] ?? it.quantity_approved ?? it.quantity_requested;
                              await handleAdjustQty(itId, qty);
                              setAdjConfirmed(prev => ({ ...prev, [itId]: qty > 0 }));
                            }}
                          >✓</button>
                        </div>
                      </td>
                    )}
                    {canRemoveDraft && (
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => handleRemoveItem(itId)}>✕</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Browse + edit qty buttons (draft owner) */}
        {isOwner && status === 'draft' && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to={`/items/browse?request_id=${encodeURIComponent(id)}`} className="btn btn-secondary">+ เพิ่มอุปกรณ์</Link>
            {items.length > 0 && !editQtyMode && (
              <button className="btn btn-secondary" onClick={() => {
                const init = {};
                items.forEach(it => { init[it.item_id || it.id] = it.quantity_requested ?? 1; });
                setEditQtyValues(init);
                setEditQtyMode(true);
              }}>แก้ไขจำนวน</button>
            )}
            {editQtyMode && <>
              <button className="btn btn-primary" disabled={savingQty} onClick={handleSaveQty}>{savingQty ? 'กำลังบันทึก…' : 'บันทึก'}</button>
              <button className="btn btn-secondary" onClick={() => { setEditQtyMode(false); setEditQtyValues({}); }}>ยกเลิก</button>
            </>}
          </div>
        )}

        {/* Process section (pending + admin) */}
        {isAdmin && status === 'pending' && (
          <div className="process-section" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">หมายเหตุ <span style={{ color: 'var(--text-muted)', fontSize: '.85em' }}>(ไม่บังคับ)</span></label>
              <textarea
                className="form-textarea"
                style={{ minHeight: '60px' }}
                placeholder="หมายเหตุถึงผู้ขอ"
                value={processNote}
                onChange={e => setProcessNote(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" style={{ marginTop: '.75rem' }} onClick={handleProcess}>เริ่มดำเนินการ</button>
          </div>
        )}
      </div>

      {/* Submit section (draft owner) */}
      {isOwner && status === 'draft' && (
        <div className="card">
          <div className="card-title">ส่งคำขอยืม</div>

          {items.length === 0 && (
            <div style={{ background: 'var(--info-bg)', border: '1px solid #bcd4f5', borderRadius: '8px', padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.88em', color: 'var(--info)' }}>
              เพิ่มอุปกรณ์อย่างน้อย 1 รายการก่อนส่งคำขอ
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '1rem' }}>
            {noSlots ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '.88em', margin: '.25rem 0 0' }}>ไม่มีวันที่เปิดให้บริการ</p>
            ) : (
              <>
                <DropdownCalendar
                  label="วันรับอุปกรณ์"
                  value={pickedDate}
                  availDates={uniquePickupDates}
                  onSelect={d => { setPickedDate(d); setPickedTime(''); }}
                  timesByDay={timesByDay}
                  selectedTime={pickedTime}
                  onSelectTime={setPickedTime}
                />
                <DropdownCalendar
                  label="วันคืนอุปกรณ์"
                  value={pickedReturn}
                  availDates={uniqueReturnDates}
                  onSelect={d => { setPickedReturn(d); setPickedReturnTime(''); }}
                  timesByDay={timesByDay}
                  selectedTime={pickedReturnTime}
                  onSelectTime={setPickedReturnTime}
                />
              </>
            )}
          </div>

          {submitMsg && <div className="alert alert-error" style={{ marginTop: '.75rem' }}>{submitMsg}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button
              className="btn btn-success"
              style={{ padding: '.55rem 1.75rem' }}
              disabled={items.length === 0 || noSlots}
              onClick={handleSubmitDraft}
            >
              ส่งคำขอ
            </button>
          </div>
        </div>
      )}

      {/* Condition report (in_lend + owner) */}
      {isOwner && inLend && approvedItems.length > 0 && (
        <div className="card">
          <div className="card-title">รายงานสภาพอุปกรณ์</div>
          <p className="form-hint" style={{ marginBottom: '.75rem' }}>
            เพิ่มเฉพาะรายการที่มีปัญหา และระบุจำนวนที่มีปัญหาในหมายเหตุ
            เจ้าหน้าที่จะยืนยันจำนวนจริงเมื่อรับคืน
          </p>
          {condMsg && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{condMsg}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '.75rem' }}>
            {condIssues.map(issue => (
              <div key={issue.reqItemId} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', padding: '.5rem .75rem', background: 'var(--bg-muted,#f5f5f5)', borderRadius: '.375rem', border: '1px solid var(--border)' }}>
                <span style={{ flex: 1, fontSize: '.9em' }}>
                  {issue.item_name}
                  <span style={{ color: 'var(--text-muted)', fontSize: '.85em' }}> ({issue.quantity_approved} {issue.unit})</span>
                </span>
                <select
                  className="form-select cond-type"
                  style={{ width: '9rem', fontSize: '.85em' }}
                  value={issue.condition_type}
                  onChange={e => updateCondIssue(issue.reqItemId, 'condition_type', e.target.value)}
                >
                  <option value="missing">สูญหาย</option>
                  <option value="broken">ชำรุด</option>
                </select>
                <input
                  type="text"
                  className="form-input cond-note"
                  placeholder={`เช่น 2 จาก ${issue.quantity_approved} ${issue.unit}`}
                  style={{ width: '13rem', fontSize: '.85em' }}
                  value={issue.note}
                  onChange={e => updateCondIssue(issue.reqItemId, 'note', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeCondIssue(issue.reqItemId)}
                  style={{ padding: '.2rem .5rem', fontSize: '.9em', color: 'var(--danger,#dc2626)', background: 'none', border: '1px solid var(--border)', borderRadius: '.25rem', cursor: 'pointer' }}
                >✕</button>
              </div>
            ))}
          </div>

          {availableForCond.length > 0 && (
            <div className="form-group" style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.75rem' }}>
              <select className="form-select" style={{ flex: 1 }} value={condAddSel} onChange={e => setCondAddSel(e.target.value)}>
                <option value="">— เลือกรายการที่มีปัญหา —</option>
                {availableForCond.map(it => (
                  <option key={it.id} value={it.id}>{it.item_name} ({it.quantity_approved} {it.unit || 'ชิ้น'})</option>
                ))}
              </select>
              <button className="btn btn-secondary" type="button" onClick={addCondIssue}>+ เพิ่ม</button>
            </div>
          )}

          <p className="form-hint" style={{ marginBottom: '.75rem' }}>หากทุกรายการปกติ ไม่ต้องเพิ่มรายการใด กดบันทึกได้เลย</p>
          <button className="btn btn-secondary" onClick={handleSaveConditions} disabled={savingCond}>
            {savingCond ? 'กำลังบันทึก…' : 'บันทึกรายงานสภาพ'}
          </button>
        </div>
      )}

      {/* Return form (in_lend + owner) */}
      {isOwner && inLend && (
        <div className="card">
          <div className="card-title">คืนอุปกรณ์</div>
          {!condDone && (
            <div className="alert alert-warning" style={{ marginBottom: '.75rem' }}>กรุณาบันทึกรายงานสภาพอุปกรณ์ก่อนดำเนินการคืน</div>
          )}
          <div className="return-form">
            <div className="form-group">
              <label className="form-label">รูปถ่ายการคืน <span className="form-required">*</span></label>
              <input
                type="file"
                accept="image/*"
                disabled={!condDone}
                onChange={e => setReturnPhoto(e.target.files?.[0] || null)}
              />
            </div>
            <div className="form-group" style={{ marginTop: '.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: condDone ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={returnAllOk} disabled={!condDone} onChange={e => setReturnAllOk(e.target.checked)} />
                <span>อุปกรณ์ทุกชิ้นครบและสภาพดี</span>
              </label>
            </div>
            <div className="form-group" style={{ marginTop: '.5rem' }}>
              <label className="form-label">หมายเหตุ (ถ้ามี)</label>
              <textarea
                className="form-input"
                rows={2}
                style={{ resize: 'vertical' }}
                placeholder="เช่น มีรอยขีดข่วนเล็กน้อย"
                disabled={!condDone}
                value={returnNote}
                onChange={e => setReturnNote(e.target.value)}
              />
            </div>
            {returnMsg && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{returnMsg}</div>}
            <button className="btn btn-primary" disabled={!condDone || submittingReturn} onClick={handleSubmitReturn}>
              {submittingReturn ? 'กำลังอัปโหลด…' : 'คืนอุปกรณ์'}
            </button>
          </div>
        </div>
      )}

      {/* Admin confirm return (returned + admin) */}
      {isAdmin && status === 'returned' && returns.find(r => r.status === 'pending') && (
        <div className="card">
          <div className="card-title">ยืนยันการรับคืน</div>
          {(() => {
            const pending = returns.find(r => r.status === 'pending');
            return (
              <>
                {pending?.photo_r2_key && (
                  <AuthPhoto photoKey={pending.photo_r2_key} alt="รูปการคืน" style={{ maxWidth: '300px', width: '100%', borderRadius: '8px', marginBottom: '1rem', display: 'block' }} />
                )}
                <div className="info-row">
                  <span className="info-label">สภาพที่แจ้ง:</span>
                  {pending?.all_items_ok === 1 || pending?.all_items_ok === true
                    ? <span style={{ color: 'var(--success)' }}>ปกติทุกชิ้น</span>
                    : <span style={{ color: 'var(--error)', fontWeight: 600 }}>มีปัญหา</span>}
                </div>
                {pending?.note && <div className="info-row"><span className="info-label">หมายเหตุ:</span> {pending.note}</div>}

                {condProblems.length > 0 && (
                  <div className="alert alert-warning" style={{ margin: '.75rem 0' }}>
                    <strong>รายงานปัญหาจากผู้ยืม:</strong>
                    <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.2rem' }}>
                      {condProblems.map((c, i) => (
                        <li key={i}>
                          {c.item_name ?? '-'}
                          {c.condition_type === 'missing'
                            ? <> — <span style={{ color: 'var(--error)' }}>สูญหาย</span></>
                            : <> — <span style={{ color: 'var(--warning,#d97706)' }}>ชำรุด</span></>}
                          {c.note ? `: ${c.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="form-hint" style={{ marginBottom: '1rem' }}>ระบุจำนวนที่รับคืนจริงและจำนวนที่ต้องส่งซ่อม — จำนวนที่หายไปจะถูกหักจากสต็อก</p>
                {confirmReturnError && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{confirmReturnError}</div>}

                <form onSubmit={handleConfirmReturn}>
                  <div className="table-wrap" style={{ marginBottom: '1rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ชื่ออุปกรณ์</th>
                          <th>อนุมัติ</th>
                          <th>รับคืนได้ <span className="form-required">*</span></th>
                          <th>ส่งซ่อม</th>
                        </tr>
                      </thead>
                      <tbody>
                        {confirmReturnItems.map((it, i) => (
                          <tr key={it.item_id}>
                            <td>{it.item_name}{it.item_unit && <span style={{ color: 'var(--text-muted)', fontSize: '.82em' }}> ({it.item_unit})</span>}</td>
                            <td>{it.quantity_approved}</td>
                            <td>
                              <input
                                type="number"
                                className="form-input"
                                min={0}
                                max={it.quantity_approved}
                                style={{ width: '80px' }}
                                value={it.quantity_returned ?? it.quantity_approved}
                                onChange={e => setConfirmReturnItems(prev => prev.map((p, j) => j === i ? { ...p, quantity_returned: parseInt(e.target.value) || 0 } : p))}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="form-input"
                                min={0}
                                style={{ width: '80px' }}
                                value={it.quantity_to_repair ?? 0}
                                onChange={e => setConfirmReturnItems(prev => prev.map((p, j) => j === i ? { ...p, quantity_to_repair: parseInt(e.target.value) || 0 } : p))}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={confirmingReturn}>
                    {confirmingReturn ? 'กำลังยืนยัน…' : 'ยืนยันการรับคืน'}
                  </button>
                </form>
              </>
            );
          })()}
        </div>
      )}

      {/* Returns history */}
      {returns.length > 0 && (
        <div className="card">
          <div className="card-title">ประวัติการคืน</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {returns.map(r => (
              <div key={r.id} className="return-card">
                <div>ส่งเมื่อ {formatDateTime(r.submitted_at)}</div>
                <div>สถานะ: <strong>{r.status === 'confirmed' ? '✓ ยืนยันแล้ว' : 'รอยืนยัน'}</strong></div>
                {r.admin_note && <div className="alert alert-info" style={{ marginTop: '.4rem' }}>หมายเหตุเจ้าหน้าที่: {r.admin_note}</div>}
                {r.photo_r2_key && (
                  <div style={{ marginTop: '.5rem' }}>
                    <AuthPhoto photoKey={r.photo_r2_key} alt="รูปการคืน" style={{ maxWidth: '260px', width: '100%', borderRadius: '6px', display: 'block' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}

      {/* Unsubmit */}
      <ConfirmModal
        isOpen={unsubmitModal}
        onClose={() => setUnsubmitModal(false)}
        title="ยกเลิกการส่ง"
        message="คำขอจะกลับไปเป็นร่างและสามารถแก้ไขแล้วส่งใหม่ได้อีกครั้ง"
        onConfirm={handleUnsubmit}
        confirmLabel="กลับเป็นร่าง"
        confirmClass="btn-primary"
      />

      {/* Cancel */}
      <ConfirmModal
        isOpen={cancelModal}
        onClose={() => setCancelModal(false)}
        title="ยืนยันการยกเลิกคำขอ"
        message="คุณต้องการยกเลิกคำขอนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้"
        onConfirm={handleCancel}
        confirmLabel="ยืนยันยกเลิก"
        confirmClass="btn-danger"
      />

      {/* Pickup photo modal */}
      <Modal isOpen={pickupModal} onClose={() => setPickupModal(false)} title="ยืนยันการรับอุปกรณ์">
        <p>กรุณาถ่ายรูปเพื่อยืนยันการรับอุปกรณ์</p>
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label className="form-label">รูปถ่ายการรับ <span className="form-required">*</span></label>
          <input type="file" accept="image/*" onChange={e => setPickupPhoto(e.target.files?.[0] || null)} />
        </div>
        {pickupMsg && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{pickupMsg}</div>}
        <div className="modal-actions" style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => setPickupModal(false)}>ยกเลิก</button>
          <button className="btn btn-success" disabled={uploadingPickup} onClick={handleConfirmPickup}>
            {uploadingPickup ? 'กำลังอัปโหลด…' : 'ยืนยันการรับ'}
          </button>
        </div>
      </Modal>

      {/* Mark ready modal (admin) */}
      <Modal isOpen={readyModal} onClose={() => setReadyModal(false)} title="ยืนยันวันรับอุปกรณ์">
        <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
          ยืนยันหรือแก้ไขวันและเวลานัดรับ — ผู้ขอจะได้รับการแจ้งเตือน
        </p>
        <div className="form-group" style={{ marginBottom: '.75rem' }}>
          <CalendarPicker
            availDates={uniquePickupDates}
            selected={readyDate}
            onSelect={d => { setReadyDate(d); setReadyTime(''); }}
            label="วันรับ *"
          />
        </div>
        {readyDate && (
          <div style={{ marginBottom: '.75rem' }}>
            <label className="form-label">เวลารับ <span className="form-required">*</span></label>
            <TimePicker
              times={timesByDay[new Date(readyDate + 'T00:00:00').getDay()] ?? []}
              selected={readyTime}
              onSelect={setReadyTime}
            />
          </div>
        )}
        {readyError && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{readyError}</div>}
        <div className="modal-actions" style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => setReadyModal(false)}>ยกเลิก</button>
          <button className="btn btn-success" disabled={savingReady} onClick={handleMarkReady}>
            {savingReady ? 'กำลังบันทึก…' : 'ยืนยันพร้อมรับ'}
          </button>
        </div>
      </Modal>
    </>
  );
}
