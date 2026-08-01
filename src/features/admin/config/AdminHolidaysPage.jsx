import { useState, useEffect, useCallback } from 'react';
import { getHolidays, createHoliday, deleteHoliday, createRecurringHoliday } from '../../../api/api';
import { formatDate } from '../../../shared/utils/format';
import { showError } from '../../../shared/ErrorToast';
import Spinner from '../../../shared/Spinner';
import ConfirmModal from '../../../shared/ConfirmModal';

const THAI_MONTHS = [
  '', 'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
];

const THIS_YEAR = new Date().getFullYear();
const YEAR_OFFSETS = [-2, -1, 0, 1, 2];

export default function AdminHolidaysPage() {
  const [currentYear, setCurrentYear] = useState(THIS_YEAR);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState('oneoff'); // 'oneoff' | 'recurring'
  const [addError, setAddError] = useState('');
  const [listError, setListError] = useState('');
  const [confirm, setConfirm] = useState({ open: false, message: '', onConfirm: null });

  // Oneoff form state
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  // Recurring form state
  const [newMonth, setNewMonth] = useState(1);
  const [newDay,   setNewDay]   = useState('');
  const [newRecName, setNewRecName] = useState('');

  const loadHolidays = useCallback(async (year) => {
    setLoading(true); setListError('');
    try {
      const res = await getHolidays(year);
      setHolidays(res?.data ?? []);
    } catch (err) {
      showError('โหลดวันหยุดไม่สำเร็จ: ' + err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadHolidays(currentYear); }, [currentYear, loadHolidays]);

  async function handleAddOneoff() {
    setAddError('');
    if (!newDate) { setAddError('กรุณาระบุวันที่'); return; }
    if (!newName.trim()) { setAddError('กรุณาระบุชื่อวันหยุด'); return; }
    setSaving(true);
    try {
      await createHoliday({ date: newDate, name: newName.trim() });
      setNewDate(''); setNewName('');
      await loadHolidays(currentYear);
    } catch (err) {
      setAddError(err.message);
    } finally { setSaving(false); }
  }

  async function handleAddRecurring() {
    setAddError('');
    const day = parseInt(newDay);
    if (!day || day < 1 || day > 31) { setAddError('กรุณาระบุวันที่ (1–31)'); return; }
    if (!newRecName.trim()) { setAddError('กรุณาระบุชื่อวันหยุด'); return; }
    setSaving(true);
    try {
      await createRecurringHoliday({ month: Number(newMonth), day, name: newRecName.trim() });
      setNewDay(''); setNewRecName('');
      await loadHolidays(currentYear);
    } catch (err) {
      setAddError(err.message);
    } finally { setSaving(false); }
  }

  function handleDelete(hd) {
    const isRecurring = Boolean(hd.is_recurring);
    const msg = isRecurring
      ? `ลบ "${hd.name}" ออกจากวันหยุดซ้ำทุกปี?\nจะมีผลกับทุกปีในอนาคต`
      : `ลบวันหยุด "${hd.name}"?`;
    setConfirm({
      open: true,
      message: msg,
      onConfirm: async () => {
        try {
          await deleteHoliday(hd.id);
          await loadHolidays(currentYear);
        } catch (err) {
          setListError(err.message);
        }
      },
    });
  }

  const sorted = [...holidays].sort((a, b) => (a.date > b.date ? 1 : -1));

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">วันหยุดราชการ</h1>
      </div>

      {/* Year selector */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-title">เลือกปี</div>
        <select
          className="form-select"
          style={{ minWidth: 200 }}
          value={currentYear}
          onChange={e => setCurrentYear(Number(e.target.value))}
        >
          {YEAR_OFFSETS.map(offset => {
            const y = THIS_YEAR + offset;
            return <option key={y} value={y}>พ.ศ. {y + 543} (ค.ศ. {y})</option>;
          })}
        </select>
      </div>

      {/* Add holiday form */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-title">เพิ่มวันหยุด</div>
        <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem' }}>
          <button
            className={`btn btn-sm${addMode === 'oneoff' ? ' btn-primary' : ' btn-secondary'}`}
            onClick={() => { setAddMode('oneoff'); setAddError(''); }}
          >เฉพาะครั้ง</button>
          <button
            className={`btn btn-sm${addMode === 'recurring' ? ' btn-primary' : ' btn-secondary'}`}
            onClick={() => { setAddMode('recurring'); setAddError(''); }}
          >ซ้ำทุกปี</button>
        </div>

        {addMode === 'oneoff' ? (
          <div className="form-row" style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 0 auto' }}>
              <label className="form-label">วันที่</label>
              <input type="date" className="form-input" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ minWidth: 160 }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label className="form-label">ชื่อวันหยุด</label>
              <input type="text" className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="เช่น วันสงกรานต์" autoComplete="off" />
            </div>
            <button className="btn btn-primary" disabled={saving} onClick={handleAddOneoff}>
              {saving ? 'กำลังบันทึก…' : '+ บันทึก'}
            </button>
          </div>
        ) : (
          <div className="form-row" style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 0 auto' }}>
              <label className="form-label">เดือน</label>
              <select className="form-select" style={{ minWidth: 150 }} value={newMonth} onChange={e => setNewMonth(e.target.value)}>
                {THAI_MONTHS.slice(1).map((name, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1} – {name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 0 auto' }}>
              <label className="form-label">วันที่</label>
              <input type="number" className="form-input" min={1} max={31} placeholder="1–31" value={newDay} onChange={e => setNewDay(e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label className="form-label">ชื่อวันหยุด</label>
              <input type="text" className="form-input" value={newRecName} onChange={e => setNewRecName(e.target.value)} placeholder="เช่น วันขึ้นปีใหม่" autoComplete="off" />
            </div>
            <button className="btn btn-primary" disabled={saving} onClick={handleAddRecurring}>
              {saving ? 'กำลังบันทึก…' : '+ บันทึก'}
            </button>
          </div>
        )}

        {addError && <div className="alert alert-error" style={{ marginTop: '.5rem' }}>{addError}</div>}
      </div>

      {/* Holiday list */}
      <div className="card">
        <div className="card-title">วันหยุดปี พ.ศ. {currentYear + 543} ({sorted.length} วัน)</div>
        {listError && <div className="alert alert-error" style={{ marginBottom: '.75rem' }}>{listError}</div>}
        {loading ? <Spinner /> : sorted.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>ไม่มีวันหยุดในปีนี้</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ชื่อวันหยุด</th>
                  <th>ประเภท</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(hd => (
                  <tr key={hd.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(hd.date)}</td>
                    <td>{hd.name}</td>
                    <td>
                      {hd.is_recurring
                        ? <span className="badge badge-confirmed" style={{ fontSize: '.72rem' }}>ซ้ำทุกปี</span>
                        : <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>เฉพาะครั้ง</span>}
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(hd)}>ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
