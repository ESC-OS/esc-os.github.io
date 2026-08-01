import { useState, useRef, useEffect } from 'react';

const DOW_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const CAL_SVG = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export default function DatePicker({ value, onChange, placeholder = 'เลือกวันที่', disabled, excludedDates }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => value ? parseInt(value.split('-')[0]) : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.split('-')[1]) - 1 : new Date().getMonth());
  const wrapRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function open() {
    if (disabled) return;
    if (value) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y); setViewMonth(m - 1);
    }
    setIsOpen(true);
  }

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }

  function pick(iso) { onChange(iso); setIsOpen(false); }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const firstDay = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startDow = firstDay.getDay();
  const monthLabel = firstDay.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push(iso);
  }

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div ref={wrapRef} className={`dp-wrap${isOpen ? ' dp-open' : ''}`}>
      <div className="dp-trigger" tabIndex={disabled ? -1 : 0} role="button" onClick={open}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
          else if (e.key === 'Escape') setIsOpen(false);
          else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && isOpen) {
            e.preventDefault();
            e.key === 'ArrowRight' ? nextMonth() : prevMonth();
          }
        }}>
        <span className={displayValue ? 'dp-value' : 'dp-value dp-ph'}>{displayValue || placeholder}</span>
        <span className="dp-icon">{CAL_SVG}</span>
      </div>
      {isOpen && (
        <div className="dp-panel">
          <div className="dp-header">
            <button className="dp-nav" onClick={e => { e.stopPropagation(); prevMonth(); }} aria-label="เดือนก่อน">‹</button>
            <span className="dp-month-label">{monthLabel}</span>
            <button className="dp-nav" onClick={e => { e.stopPropagation(); nextMonth(); }} aria-label="เดือนถัดไป">›</button>
          </div>
          <div className="dp-dow">{DOW_TH.map(d => <span key={d}>{d}</span>)}</div>
          <div className="dp-grid">
            {cells.map((iso, i) => {
              if (!iso) return <button key={i} className="dp-day" disabled />;
              const isToday = iso === todayIso;
              const isSel = iso === value;
              const isExcluded = excludedDates?.has(iso);
              const cls = ['dp-day', isToday ? 'dp-today' : '', isSel ? 'dp-sel' : ''].filter(Boolean).join(' ');
              return (
                <button
                  key={iso}
                  className={cls}
                  disabled={isExcluded}
                  onMouseDown={e => { e.preventDefault(); pick(iso); }}
                >
                  {parseInt(iso.split('-')[2])}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
