import { useState, useEffect, useCallback, useRef } from 'react';
import { getSlots, createSlot, updateSlot, deleteSlot } from '../../../api/api';
import { showError } from '../../../shared/ErrorToast';
import Spinner from '../../../shared/Spinner';
import ConfirmModal from '../../../shared/ConfirmModal';

const DAYS = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const DAY_OPTS = DAYS.slice(1).map((name, i) => ({ value: i + 1, label: name }));

export default function AdminSlotsPage() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState({ open: false, message: '', onConfirm: null });

  const loadSlots = useCallback(async () => {
    try {
      const res = await getSlots();
      setSlots(res?.data ?? []);
    } catch (err) {
      showError('โหลดช่วงเวลาไม่สำเร็จ: ' + err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  async function handleToggleActive(slot) {
    const newActive = !slot.is_active;
    setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, is_active: newActive } : s));
    try {
      await updateSlot(slot.id, { is_active: newActive });
    } catch (err) {
      showError('แก้ไขสถานะไม่สำเร็จ: ' + err.message);
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, is_active: slot.is_active } : s));
    }
  }

  function handleDelete(slot) {
    const label = `${DAYS[slot.day_of_week] ?? slot.day_of_week} ${slot.time ?? ''}`;
    setConfirm({
      open: true,
      message: `ลบช่วงเวลา "${label}"?`,
      onConfirm: async () => {
        try { await deleteSlot(slot.id); await loadSlots(); }
        catch (err) { showError('ลบช่วงเวลาไม่สำเร็จ: ' + err.message); }
      },
    });
  }

  const borrowSlots = slots.filter(s => s.service_type === 'borrow');
  const visitSlots  = slots.filter(s => s.service_type === 'visit');

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">ช่วงเวลาปฏิบัติการ</h1>
      </div>

      <div className="admin-grid">
        <SlotSection
          title="ช่วงยืม-คืน"
          serviceType="borrow"
          slots={borrowSlots}
          onToggle={handleToggleActive}
          onDelete={handleDelete}
          onAdded={loadSlots}
        />
        <SlotSection
          title="ช่วงเยี่ยมชม"
          serviceType="visit"
          slots={visitSlots}
          onToggle={handleToggleActive}
          onDelete={handleDelete}
          onAdded={loadSlots}
        />
      </div>

      <ConfirmModal
        isOpen={confirm.open}
        onClose={() => setConfirm(c => ({ ...c, open: false }))}
        message={confirm.message}
        onConfirm={confirm.onConfirm}
        title="ยืนยันการลบ"
        confirmLabel="ลบ"
        confirmClass="btn-danger"
      />
    </>
  );
}

function SlotSection({ title, serviceType, slots, onToggle, onDelete, onAdded }) {
  const [newDay,  setNewDay]  = useState(1);
  const [newTime, setNewTime] = useState('');
  const [newCap,  setNewCap]  = useState('');
  const [addErr,  setAddErr]  = useState('');
  const [adding,  setAdding]  = useState(false);

  async function handleAdd() {
    setAddErr('');
    if (!newTime) { setAddErr('กรุณาระบุเวลา'); return; }
    setAdding(true);
    const data = { service_type: serviceType, day_of_week: Number(newDay), time: newTime };
    if (newCap) data.capacity = Number(newCap);
    try {
      await createSlot(data);
      setNewTime(''); setNewCap('');
      await onAdded();
    } catch (err) {
      setAddErr(err.message);
    } finally { setAdding(false); }
  }

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="table-wrap" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
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
            {slots.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีช่วงเวลา</td></tr>
            ) : slots.map(s => (
              <tr key={s.id}>
                <td>{DAYS[s.day_of_week] ?? s.day_of_week}</td>
                <td>{s.time ?? '-'}</td>
                <td>{s.capacity ?? '-'}</td>
                <td>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(s.is_active)}
                      onChange={() => onToggle(s)}
                      style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: '.85rem', color: s.is_active ? 'var(--success)' : 'var(--text-muted)' }}>
                      {s.is_active ? 'เปิด' : 'ปิด'}
                    </span>
                  </label>
                </td>
                <td>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => onDelete(s)}
                  >ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add slot inline */}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <select className="form-select" value={newDay} onChange={e => setNewDay(e.target.value)} style={{ minWidth: 100 }}>
          {DAY_OPTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <input
          type="time"
          className="form-input"
          value={newTime}
          onChange={e => setNewTime(e.target.value)}
          style={{ minWidth: 120 }}
        />
        <input
          type="number"
          className="form-input"
          min={1}
          placeholder="ความจุ"
          value={newCap}
          onChange={e => setNewCap(e.target.value)}
          style={{ minWidth: 90, maxWidth: 110 }}
        />
        <button className="btn btn-primary btn-sm" disabled={adding} onClick={handleAdd}>
          {adding ? 'กำลังบันทึก…' : '+ เพิ่มช่วงเวลา'}
        </button>
        {addErr && <span style={{ color: 'var(--error)', fontSize: '.85rem' }}>{addErr}</span>}
      </div>
    </div>
  );
}
