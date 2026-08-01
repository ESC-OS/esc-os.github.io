import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getProjects, getSlots, getItems,
  createRequest, updateRequest, addRequestItem, removeRequestItem, adjustRequestItem,
  submitRequest,
} from '../../api/api';
import { showError } from '../../shared/ErrorToast';
import Spinner from '../../shared/Spinner';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatThaiDate(date) {
  return date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function upcomingSlotDatetimes(slot, weeks = 4) {
  const results = [];
  const now = new Date();
  const targetDay = slot.day_of_week === 7 ? 0 : slot.day_of_week;
  const [hh, mm] = slot.time.split(':').map(Number);
  for (let w = 0; w < weeks * 7 + 7; w++) {
    const d = new Date(now);
    d.setDate(now.getDate() + w);
    if (d.getDay() !== targetDay) continue;
    d.setHours(hh, mm, 0, 0);
    if (d <= now) continue;
    results.push(d);
    if (results.length >= weeks) break;
  }
  return results;
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ active }) {
  const steps = ['ข้อมูล', 'อุปกรณ์ & วันที่'];
  return (
    <div className="step-indicator">
      {steps.map((label, i) => {
        const n = i + 1;
        const cls = n < active ? 'step done' : n === active ? 'step active' : 'step';
        return (
          <div key={n} style={{ display: 'contents' }}>
            {i > 0 && <div className="step-sep">—</div>}
            <div className={cls}>
              <span className="step-num">{n}</span>
              <span className="step-label">{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

function Step1({ projects, onNext }) {
  const [name, setName]           = useState('');
  const [projectId, setProjectId] = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const selectedProj = projects.find(p => p.id === projectId);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    setError('');
    if (!trimmedName) { setError('กรุณาระบุชื่อคำขอ'); return; }
    if (!projectId)   { setError('กรุณาเลือกโครงการ'); return; }

    setLoading(true);
    try {
      const res = await createRequest({ name: trimmedName, project_id: projectId });
      const reqId = res?.data?.id;
      if (!reqId) throw new Error('ไม่ได้รับ ID คำขอจากเซิร์ฟเวอร์');
      onNext(reqId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Link to="/requests" className="back-btn">← คำขอยืม</Link>
      <StepIndicator active={1} />
      <div className="page-header">
        <h1 className="page-title">สร้างคำขอยืม</h1>
      </div>
      <div className="card" style={{ maxWidth: '600px' }}>
        <form className="form" onSubmit={handleSubmit}>
          {error && <div className="alert alert-error" id="step1-error" style={{ marginBottom: '.75rem' }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">ชื่อคำขอ <span className="form-required">*</span></label>
            <input
              className="form-input"
              type="text"
              required
              placeholder="เช่น คำขอยืมอุปกรณ์ถ่ายภาพ"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">โครงการ <span className="form-required">*</span></label>
            <select className="form-select" value={projectId} onChange={e => setProjectId(e.target.value)} required>
              <option value="">-- เลือกโครงการ --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedProj?.start_date && (
              <span className="form-hint">
                ช่วงโครงการ: {selectedProj.start_date} → {selectedProj.end_date}
              </span>
            )}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'กำลังสร้าง…' : 'ถัดไป: เลือกอุปกรณ์ →'}
            </button>
            <Link to="/requests" className="btn btn-secondary">ยกเลิก</Link>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

function Step2({ reqId, uniquePickupDates, timesByDay, navigate }) {
  const [allItems, setAllItems]     = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedItems, setSelectedItems] = useState(new Map()); // itemId → { item, quantity_requested }
  const [searchQuery, setSearchQuery] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [pickedTime, setPickedTime] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    getItems()
      .then(res => setAllItems((res?.data ?? []).filter(i => i.is_active !== 0 && (i.available_quantity ?? 0) > 0)))
      .catch(err => showError(err.message))
      .finally(() => setLoadingItems(false));
  }, []);

  const hasSlots = uniquePickupDates.length > 0;

  const filteredItems = searchQuery
    ? allItems.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()) || (i.category || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : allItems;

  const timesForPickup = pickupDate
    ? (timesByDay[new Date(pickupDate + 'T00:00:00').getDay()] ?? [])
    : [];

  function handleSearchChange(e) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(e.target.value.trim()), 300);
    e.persist?.();
  }

  async function handleAddItem(item) {
    if (selectedItems.has(item.id)) return;
    try {
      await addRequestItem(reqId, { item_id: item.id, quantity_requested: 1 });
      setSelectedItems(prev => new Map(prev).set(item.id, { item, quantity_requested: 1 }));
    } catch (err) {
      showError(err.message);
    }
  }

  async function handleRemoveItem(itemId) {
    try {
      await removeRequestItem(reqId, itemId);
      setSelectedItems(prev => { const m = new Map(prev); m.delete(itemId); return m; });
    } catch (err) {
      showError(err.message);
    }
  }

  async function handleQtyChange(itemId, newQty, maxQty) {
    const qty = Math.min(Math.max(newQty || 1, 1), maxQty);
    try {
      await adjustRequestItem(reqId, itemId, { quantity_requested: qty });
      setSelectedItems(prev => {
        const m = new Map(prev);
        const entry = m.get(itemId);
        if (entry) m.set(itemId, { ...entry, quantity_requested: qty });
        return m;
      });
    } catch (err) {
      showError(err.message);
    }
  }

  function handlePickupDateChange(e) {
    setPickupDate(e.target.value);
    setPickedTime('');
  }

  async function handleSubmit() {
    setError('');
    if (selectedItems.size === 0) { setError('กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ'); return; }
    if (!pickupDate) { setError('กรุณาเลือกวันที่รับอุปกรณ์'); return; }
    if (!pickedTime) { setError('กรุณาเลือกเวลารับอุปกรณ์'); return; }
    if (!returnDate) { setError('กรุณาระบุวันที่คืนอุปกรณ์'); return; }

    const pickup = `${pickupDate}T${pickedTime}`;
    const ret    = `${returnDate}T23:59`;

    if (new Date(ret) <= new Date(pickup)) { setError('วันคืนต้องอยู่หลังวันรับอุปกรณ์'); return; }

    const now          = new Date();
    const pickupDateObj = new Date(pickup);
    const retDateObj    = new Date(ret);
    const leadDays     = (pickupDateObj - now) / 864e5;
    const durationDays = (retDateObj - pickupDateObj) / 864e5;

    const warnings = [];
    if (leadDays < 3)     warnings.push('ควรแจ้งล่วงหน้าอย่างน้อย 3 วันทำการก่อนวันรับ');
    if (leadDays > 30)    { setError('ไม่สามารถจองล่วงหน้าเกิน 30 วัน'); return; }
    if (durationDays > 7) warnings.push('ระยะเวลายืมเกิน 7 วัน — กรุณายืนยันกับเจ้าหน้าที่');
    if (warnings.length)  setError(warnings.join('\n'));

    setSubmitting(true);
    try {
      await updateRequest(reqId, {
        requested_pickup_datetime: pickup,
        requested_return_datetime: ret,
      });
      await submitRequest(reqId);
      navigate(`/requests/${reqId}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (loadingItems) return <Spinner />;

  return (
    <>
      <Link to="/requests" className="back-btn">← คำขอยืม</Link>
      <StepIndicator active={2} />
      <div className="page-header">
        <h1 className="page-title">เลือกอุปกรณ์และวันที่</h1>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem', whiteSpace: 'pre-line' }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: search + item grid */}
        <div>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <input
              className="form-input"
              type="text"
              placeholder="ค้นหาอุปกรณ์…"
              autoComplete="off"
              onChange={handleSearchChange}
            />
          </div>
          <div className="items-grid">
            {filteredItems.length === 0 ? (
              <p className="empty-text">ไม่พบอุปกรณ์</p>
            ) : filteredItems.map(item => {
              const isAdded = selectedItems.has(item.id);
              return (
                <div key={item.id} className="item-card">
                  <div className="item-card-body">
                    {item.image_url
                      ? <img className="item-card-img" src={item.image_url} alt={item.name} />
                      : <div className="item-card-placeholder">📦</div>}
                    <div className="item-card-name">{item.name}</div>
                    <div className="item-card-meta" style={{ fontSize: '.8rem', color: (item.available_quantity ?? 0) <= 2 ? 'var(--error)' : 'var(--text-muted)' }}>
                      พร้อม: {item.available_quantity ?? 0}
                    </div>
                    <button
                      className={`btn btn-sm ${isAdded ? 'btn-secondary' : 'btn-primary'} btn-add-item`}
                      disabled={isAdded}
                      onClick={() => handleAddItem(item)}
                    >
                      {isAdded ? '✓ เพิ่มแล้ว' : '+ เพิ่ม'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: selected items + dates + submit */}
        <div className="card" style={{ position: 'sticky', top: '1rem' }}>
          <div className="card-title">รายการที่เลือก ({selectedItems.size})</div>

          {selectedItems.size === 0 ? (
            <p className="empty-text" style={{ fontSize: '.9rem' }}>ยังไม่มีอุปกรณ์</p>
          ) : (
            [...selectedItems.values()].map(({ item, quantity_requested }) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.6rem', paddingBottom: '.6rem', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 1, fontSize: '.9rem' }}>{item.name}</span>
                <input
                  type="number"
                  className="qty-input"
                  value={quantity_requested}
                  min={1}
                  max={item.available_quantity ?? 99}
                  style={{ width: '52px' }}
                  onChange={e => handleQtyChange(item.id, parseInt(e.target.value), item.available_quantity ?? 99)}
                />
                <button className="btn btn-sm btn-danger" onClick={() => handleRemoveItem(item.id)}>ลบ</button>
              </div>
            ))
          )}

          <div style={{ borderTop: '1px solid var(--border)', margin: '.85rem 0 .75rem', paddingTop: '.85rem' }}>
            <div className="form-group" style={{ marginBottom: '.75rem' }}>
              <label className="form-label" style={{ fontSize: '.85rem' }}>วันที่รับอุปกรณ์ <span className="form-required">*</span></label>
              {hasSlots ? (
                <select
                  className="form-select"
                  style={{ fontSize: '.85rem' }}
                  value={pickupDate}
                  onChange={handlePickupDateChange}
                >
                  <option value="">-- เลือกวันที่ --</option>
                  {uniquePickupDates.map(d => (
                    <option key={d.dateVal} value={d.dateVal}>{d.label}</option>
                  ))}
                </select>
              ) : (
                <p style={{ color: 'var(--error)', fontSize: '.85rem', margin: 0 }}>ไม่มีช่วงเวลาที่เปิดรับในขณะนี้</p>
              )}
            </div>

            {hasSlots && pickupDate && (
              <div className="form-group" style={{ marginBottom: '.75rem' }}>
                <label className="form-label" style={{ fontSize: '.85rem' }}>เวลารับ <span className="form-required">*</span></label>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {timesForPickup.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>ไม่มีช่วงเวลาในวันนี้</span>
                  ) : timesForPickup.map(t => (
                    <button
                      key={t}
                      type="button"
                      className={`btn btn-sm ${t === pickedTime ? 'btn-primary' : 'btn-secondary'} pickup-time-btn`}
                      onClick={() => setPickedTime(t)}
                    >
                      {t} น.
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '.85rem' }}>วันที่คืนอุปกรณ์ <span className="form-required">*</span></label>
              <input
                type="date"
                className="form-input"
                style={{ fontSize: '.85rem' }}
                value={returnDate}
                onChange={e => setReturnDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: '.75rem' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={submitting || !hasSlots}
              onClick={handleSubmit}
            >
              {submitting ? 'กำลังส่งคำขอ…' : 'ส่งคำขอ'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <Link to="/requests" className="btn btn-secondary btn-sm">← ยกเลิก / กลับ</Link>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function NewRequestPage() {
  const navigate = useNavigate();

  const [step, setStep]       = useState(1);
  const [reqId, setReqId]     = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Computed slot data
  const [uniquePickupDates, setUniquePickupDates] = useState([]);
  const [timesByDay, setTimesByDay] = useState({});

  useEffect(() => {
    Promise.all([
      getProjects().then(r => r?.data ?? []),
      getSlots('borrow').then(r => r?.data ?? []),
    ])
      .then(([projs, slots]) => {
        setProjects(projs);
        const activeSlots = slots.filter(s => s.is_active);

        const seenDateVals = new Set();
        const dates = [];
        const tbd = {};

        for (const slot of activeSlots) {
          if (!tbd[slot.day_of_week]) tbd[slot.day_of_week] = new Set();
          tbd[slot.day_of_week].add(slot.time);

          for (const d of upcomingSlotDatetimes(slot, 4)) {
            const dateVal = toDateStr(d);
            if (!seenDateVals.has(dateVal)) {
              seenDateVals.add(dateVal);
              dates.push({ d, dateVal, dayOfWeek: slot.day_of_week, label: formatThaiDate(d) });
            }
          }
        }
        dates.sort((a, b) => a.d - b.d);
        const tbdFinal = {};
        for (const key of Object.keys(tbd)) tbdFinal[key] = [...tbd[key]].sort();
        setUniquePickupDates(dates);
        setTimesByDay(tbdFinal);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error)   return <div className="alert alert-error">{error}</div>;

  if (step === 1) {
    return (
      <Step1
        projects={projects}
        onNext={id => { setReqId(id); setStep(2); }}
      />
    );
  }

  return (
    <Step2
      reqId={reqId}
      uniquePickupDates={uniquePickupDates}
      timesByDay={timesByDay}
      navigate={navigate}
    />
  );
}
