import { useState, useEffect, useCallback } from 'react';
import Modal from '../../shared/Modal';
import Spinner from '../../shared/Spinner';
import { showError } from '../../shared/ErrorToast';
import {
  getProjects, getSlots, getHolidays, getRequests, createVisit,
} from '../../api/api';

const DOW = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
function dowNum(v) {
  return typeof v === 'number' ? (v + 1) % 7 : (DOW[v] ?? -1);
}

function nextDates(slot, n = 8) {
  const target = dowNum(slot.day_of_week);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dates = [];
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1);
  while (dates.length < n) {
    if (cursor.getDay() === target) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    cursor.setDate(cursor.getDate() + 1);
    if (cursor - today > 60 * 864e5) break;
  }
  return dates;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function Calendar({ availMap, selDate, onSelectDate }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  const [calY, setCalY] = useState(today.getFullYear());
  const [calM, setCalM] = useState(today.getMonth());

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 60);
  const canPrev = calY > today.getFullYear() || calM > today.getMonth();
  const canNext = new Date(calY, calM + 1, 1) <= maxDate;

  function prevMonth() {
    if (!canPrev) return;
    if (calM === 0) { setCalM(11); setCalY(y => y - 1); }
    else setCalM(m => m - 1);
  }
  function nextMonth() {
    if (!canNext) return;
    if (calM === 11) { setCalM(0); setCalY(y => y + 1); }
    else setCalM(m => m + 1);
  }

  const firstDow = new Date(calY, calM, 1).getDay();
  const daysInMo = new Date(calY, calM + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMo; d++) {
    const date = `${calY}-${String(calM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const avail = availMap.has(date) && date >= todayStr;
    const selected = date === selDate;

    let bg = 'transparent', color = 'var(--text-muted)', cursor = 'default', border = 'none', fw = '400';
    if (selected) { bg = 'var(--primary)'; color = '#fff'; cursor = 'pointer'; fw = '700'; }
    else if (avail) { bg = 'var(--primary-50,#fdf2f2)'; color = 'var(--primary)'; cursor = 'pointer'; border = '1px solid var(--primary)'; fw = '600'; }

    cells.push(
      <div key={date} style={{ textAlign: 'center', padding: '2px' }}>
        <div
          onClick={avail ? () => onSelectDate(date) : undefined}
          style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '.83em', margin: 'auto',
            background: bg, color, cursor, border, fontWeight: fw,
          }}
        >
          {d}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.4rem' }}>
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canPrev}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: canPrev ? 'pointer' : 'default', color: canPrev ? 'var(--text)' : 'var(--border-strong,#ccc)' }}
        >‹</button>
        <span style={{ fontWeight: 700, fontSize: '.88em' }}>{MONTHS[calM]} {calY + 543}</span>
        <button
          type="button"
          onClick={nextMonth}
          disabled={!canNext}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: canNext ? 'pointer' : 'default', color: canNext ? 'var(--text)' : 'var(--border-strong,#ccc)' }}
        >›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, marginBottom: '.25rem' }}>
        {DAYS.map((d, i) => (
          <div key={d} style={{ fontSize: '.7em', fontWeight: 700, textAlign: 'center', padding: '.25rem 0', color: i === 0 ? 'var(--error)' : 'var(--text-muted)' }}>{d}</div>
        ))}
        {cells}
      </div>
    </div>
  );
}

export default function VisitModal({ isOpen, onClose, projectId, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [availMap, setAvailMap] = useState(new Map());
  const [reqs, setReqs] = useState([]);

  const [selProject, setSelProject] = useState(projectId || '');
  const [selDate, setSelDate] = useState(null);
  const [selTime, setSelTime] = useState(null);
  const [numPeople, setNumPeople] = useState(1);
  const [selReq, setSelReq] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    setSelDate(null);
    setSelTime(null);
    try {
      const year = new Date().getFullYear();
      const [pr, sr, rr, hr, hr2] = await Promise.all([
        getProjects(),
        getSlots('visit'),
        getRequests('in_lend').catch(() => null),
        getHolidays(year).catch(() => ({ data: [] })),
        getHolidays(year + 1).catch(() => ({ data: [] })),
      ]);
      const projectList = pr?.data ?? [];
      const slots = sr?.data ?? [];
      const reqList = rr?.requests ?? rr?.data ?? [];
      const holidays = [...(hr?.data ?? []), ...(hr2?.data ?? [])].map(h => h.date);

      const holidaySet = new Set(holidays);
      const map = new Map();
      for (const s of slots.filter(s => s.is_active && s.service_type === 'visit')) {
        for (const date of nextDates(s, 8)) {
          if (holidaySet.has(date)) continue;
          if (!map.has(date)) map.set(date, []);
          if (!map.get(date).includes(s.time)) map.get(date).push(s.time);
        }
      }
      map.forEach(times => times.sort());

      setProjects(projectList);
      setAvailMap(map);
      setReqs(reqList);
      setSelProject(projectId || '');
    } catch (err) {
      showError('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
      onClose();
    } finally {
      setLoading(false);
    }
  }, [isOpen, projectId, onClose]);

  useEffect(() => { load(); }, [load]);

  function handleSelectDate(date) {
    setSelDate(date);
    setSelTime(null);
  }

  async function handleSubmit() {
    setError('');
    if (!selProject) { setError('กรุณาเลือกโครงการ'); return; }
    if (!selDate) { setError('กรุณาเลือกวันเยี่ยมชม'); return; }
    if (!selTime) { setError('กรุณาเลือกเวลา'); return; }
    if (!numPeople || numPeople < 1 || numPeople > 5) { setError('จำนวนคนต้องอยู่ระหว่าง 1 ถึง 5'); return; }
    setSubmitting(true);
    try {
      await createVisit({
        project_id: selProject,
        visit_date: selDate,
        visit_time: selTime,
        num_people: numPeople,
        borrow_request_id: selReq || undefined,
      });
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const times = selDate ? (availMap.get(selDate) ?? []) : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="จองเยี่ยมชม">
      {loading ? (
        <Spinner />
      ) : (
        <div className="form" style={{ padding: 0 }}>
          {error && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{error}</div>}

          <div className="form-group">
            <label className="form-label">โครงการ <span className="form-required">*</span></label>
            <select className="form-select" value={selProject} onChange={e => setSelProject(e.target.value)}>
              <option value="">-- เลือกโครงการ --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">วันเยี่ยมชม <span className="form-required">*</span></label>
            {availMap.size === 0 ? (
              <p style={{ color: 'var(--error)', fontSize: '.85rem', margin: 0 }}>ไม่มีช่วงเวลาที่เปิดให้จอง</p>
            ) : (
              <>
                <Calendar availMap={availMap} selDate={selDate} onSelectDate={handleSelectDate} />
                {selDate && (
                  <div style={{ marginTop: '.5rem' }}>
                    <label className="form-label" style={{ fontSize: '.82em', color: 'var(--text-muted)' }}>
                      เวลา <span className="form-required">*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.25rem' }}>
                      {times.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSelTime(t)}
                          style={{
                            padding: '.3rem .9rem', borderRadius: 20, fontSize: '.88em', cursor: 'pointer',
                            border: `1px solid ${t === selTime ? 'var(--primary)' : 'var(--border)'}`,
                            background: t === selTime ? 'var(--primary)' : '#fff',
                            color: t === selTime ? '#fff' : 'var(--text)',
                          }}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">จำนวนคน <span className="form-required">*</span></label>
            <input
              className="form-input"
              type="number"
              min={1} max={5}
              value={numPeople}
              onChange={e => setNumPeople(parseInt(e.target.value, 10) || 1)}
            />
            <span className="form-hint">ไม่เกิน 5 คนต่อการจอง</span>
          </div>

          <div className="form-group">
            <label className="form-label">คำขอยืมที่เกี่ยวข้อง (ไม่บังคับ)</label>
            <select className="form-select" value={selReq} onChange={e => setSelReq(e.target.value)}>
              <option value="">-- ไม่เชื่อมโยง --</option>
              {reqs.map(r => (
                <option key={r.id} value={r.id}>#{r.id} — {r.project_name || r.project_id || ''}</option>
              ))}
            </select>
          </div>

          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'กำลังส่ง…' : 'ส่งคำขอ'}
            </button>
            <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>ยกเลิก</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
