import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getCalendar } from '../../../api/api';
import { showError } from '../../../shared/ErrorToast';
import Spinner from '../../../shared/Spinner';

const TYPE_LABELS = {
  borrow_pickup: 'ยืม(รับ)',
  borrow_return: 'ยืม(คืน)',
  visit:         'เยี่ยมชม',
  deposit:       'ฝากของ',
  storage_area:  'พื้นที่',
};
const ALL_TYPES = Object.keys(TYPE_LABELS);

function eventTo(event) {
  switch (event.type) {
    case 'borrow_pickup':
    case 'borrow_return': return `/requests/${event.id}`;
    case 'visit':         return `/visits/${event.id}`;
    case 'deposit':       return `/deposits/${event.id}`;
    case 'storage_area':  return `/storage-areas/${event.id}`;
    default:              return '#';
  }
}

function getEventDate(event) {
  return event.date || event.calendar_date || null;
}

function pad(n) { return String(n).padStart(2, '0'); }

const TYPE_STYLES = {
  borrow_pickup: { background: '#dbeafe', color: '#1e40af' },
  borrow_return: { background: '#fce7f3', color: '#9d174d' },
  visit:         { background: '#d1fae5', color: '#065f46' },
  deposit:       { background: '#fef3c7', color: '#92400e' },
  storage_area:  { background: '#ede9fe', color: '#5b21b6' },
};

export default function AdminCalendarPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear]   = useState(today.getFullYear());
  const [activeTypes, setActiveTypes]   = useState(new Set(ALL_TYPES));
  const [events, setEvents]             = useState([]);
  const [loading, setLoading]           = useState(false);

  const monthLabel = new Date(currentYear, currentMonth, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  const loadMonth = useCallback(async (year, month) => {
    const lastDay = new Date(year, month + 1, 0);
    const from = `${year}-${pad(month + 1)}-01`;
    const to   = `${year}-${pad(month + 1)}-${pad(lastDay.getDate())}`;
    setLoading(true);
    try {
      const res = await getCalendar({ from, to });
      const raw = res?.data ?? res ?? [];
      setEvents(Array.isArray(raw) ? raw : []);
    } catch (err) {
      showError('โหลดปฏิทินไม่สำเร็จ: ' + err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMonth(currentYear, currentMonth); }, [currentYear, currentMonth, loadMonth]);

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  }
  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  }

  function toggleType(type) {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Build calendar grid
  const visible = events.filter(ev => activeTypes.has(ev.type));
  const lastDay  = new Date(currentYear, currentMonth + 1, 0);
  const firstDay = new Date(currentYear, currentMonth, 1);
  const totalDays = lastDay.getDate();
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const byDate = {};
  visible.forEach(ev => {
    const d = getEventDate(ev);
    if (d) {
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(ev);
    }
  });

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const cells = [];
  for (let i = 0; i < startDow; i++) {
    const prevDate = new Date(currentYear, currentMonth, -startDow + i + 1);
    cells.push({ key: `p${i}`, day: prevDate.getDate(), other: true, events: [] });
  }
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(day)}`;
    cells.push({ key: dateStr, day, other: false, isToday: dateStr === todayStr, events: byDate[dateStr] ?? [], dateStr });
  }
  const totalCells = startDow + totalDays;
  const remainder  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remainder; i++) {
    cells.push({ key: `t${i}`, day: i, other: true, events: [] });
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">ปฏิทิน</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={prevMonth}>←</button>
          <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: 160, textAlign: 'center' }}>{monthLabel}</span>
          <button className="btn btn-secondary btn-sm" onClick={nextMonth}>→</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
          {ALL_TYPES.map(type => (
            <label key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer', padding: '.25rem .6rem', borderRadius: 20, border: '1px solid var(--border)', fontSize: '.82rem', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={activeTypes.has(type)}
                onChange={() => toggleType(type)}
                style={{ accentColor: 'var(--primary)' }}
              />
              {TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {['จ','อ','พ','พฤ','ศ','ส','อา'].map(d => (
            <div key={d} style={{ background: 'var(--bg)', padding: '.4rem', textAlign: 'center', fontSize: '.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>{d}</div>
          ))}
          {cells.map(cell => (
            <div
              key={cell.key}
              style={{
                background: cell.other ? '#fafafa' : cell.isToday ? '#fff8f0' : 'var(--surface)',
                opacity: cell.other ? 0.7 : 1,
                minHeight: 80,
                padding: '.35rem',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '.1rem' }}>{cell.day}</span>
              {cell.events.map((ev, i) => (
                <Link
                  key={i}
                  to={eventTo(ev)}
                  style={{
                    ...(TYPE_STYLES[ev.type] ?? {}),
                    fontSize: '.68rem',
                    padding: '.1rem .3rem',
                    borderRadius: 3,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block',
                    textDecoration: 'none',
                  }}
                  title={ev.title ?? ''}
                >
                  {ev.title ?? ev.type}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>ไม่มีกิจกรรม</p>
      )}
    </>
  );
}
