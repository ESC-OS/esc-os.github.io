import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getRequests, getProjects, getNotifications, getVisits,
  getDeposits, getStorageAreas, getDonations, getHolidays,
} from '../../api/api';
import { formatDate } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';

// ── Calendar constants ────────────────────────────────────────────────────────
const CAL_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DOT_COLORS = { red: 'var(--error)', amber: 'var(--warning)', blue: 'var(--info)', green: 'var(--success)' };

// ── Helpers ──────────────────────────────────────────────────────────────────
function withinDays(iso, days) {
  if (!iso) return false;
  const d = new Date(iso).getTime(), now = Date.now();
  return d >= now && d <= now + days * 86_400_000;
}

function tlDateLabel(dateObj) {
  if (!dateObj) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tmr   = new Date(today); tmr.setDate(today.getDate() + 1);
  const day   = new Date(dateObj); day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return 'วันนี้';
  if (day.getTime() === tmr.getTime())   return 'พรุ่งนี้';
  return dateObj.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
}

function buildEventMap(requests, visits, deposits, storages, donations) {
  const map = {};
  function add(dateStr, ev) {
    if (!dateStr) return;
    const key = String(dateStr).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    (map[key] ??= []).push(ev);
  }
  requests.filter(r => r.status === 'ready_for_pickup').forEach(r =>
    add(r.requested_pickup_datetime, { label: 'รับอุปกรณ์', color: 'red',   to: '/requests/' + r.id, name: r.name || '#' + r.id }));
  requests.filter(r => r.status === 'in_lend').forEach(r =>
    add(r.requested_return_datetime, { label: 'กำหนดคืน', color: r.is_overdue ? 'red' : 'amber', to: '/requests/' + r.id, name: r.name || '#' + r.id }));
  visits.filter(v => v.status === 'confirmed').forEach(v =>
    add(v.visit_date,    { label: 'เยี่ยมชม',  color: 'blue',  to: '/visits/' + v.id,         name: v.project_name || '#' + v.id }));
  deposits.filter(d => d.status === 'approved').forEach(d =>
    add(d.deposit_date,  { label: 'นำฝาก',     color: 'green', to: '/deposits/' + d.id,        name: d.project_name || '#' + d.id }));
  deposits.filter(d => d.status === 'deposited').forEach(d =>
    add(d.withdraw_date, { label: 'รับคืน',    color: 'amber', to: '/deposits/' + d.id,        name: d.project_name || '#' + d.id }));
  storages.filter(s => s.status === 'in_use').forEach(s =>
    add(s.end_date,      { label: 'คืนพื้นที่', color: 'amber', to: '/storage-areas/' + s.id,  name: s.project_name || '#' + s.id }));
  donations.filter(d => d.status === 'approved').forEach(d =>
    add(d.donation_date, { label: 'มอบของ',    color: 'green', to: '/donations/' + d.id,       name: d.project_name || '#' + d.id }));
  return map;
}

function calCells(eventMap, year, month, holidayMap) {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays    = new Date(year, month, 0).getDate();
  const prevM = month === 0 ? 11 : month - 1, prevY = month === 0 ? year - 1 : year;
  const nextM = month === 11 ? 0 : month + 1, nextY = month === 11 ? year + 1 : year;

  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevDays - i;
    cells.push({ day: d, key: `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, key: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, other: false });
  }
  const total = Math.ceil(cells.length / 7) * 7;
  for (let nd = 1; cells.length < total; nd++) {
    cells.push({ day: nd, key: `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`, other: true });
  }
  return cells.map(cell => ({
    ...cell,
    isToday: cell.key === todayKey,
    isHoliday: !cell.other && !!holidayMap[cell.key],
    events: eventMap[cell.key] || [],
  }));
}

// ── Calendar sub-component ───────────────────────────────────────────────────
function DashCalendar({ eventMap, holidayMap }) {
  const now = new Date();
  const [calYear, setCalYear]   = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selDate, setSelDate]   = useState(null);

  function prevMonth() {
    setSelDate(null);
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    setSelDate(null);
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }
  function toggleDate(key) {
    setSelDate(prev => prev === key ? null : key);
  }

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const cells = calCells(eventMap, calYear, calMonth, holidayMap);

  const selEvents  = selDate ? (eventMap[selDate] || []) : [];
  const selHoliday = selDate ? holidayMap[selDate] : null;
  const selFmt     = selDate
    ? new Date(selDate + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })
    : '';

  return (
    <div className="dash-cal">
      <div className="dash-cal-nav">
        <button className="dash-cal-nav-btn" onClick={prevMonth}>‹</button>
        <span className="dash-cal-month">{monthLabel}</span>
        <button className="dash-cal-nav-btn" onClick={nextMonth}>›</button>
      </div>
      <div className="dash-cal-grid">
        {CAL_DOW.map(d => <div key={d} className="dash-cal-dow">{d}</div>)}
        {cells.map(cell => {
          const eventColors = [...new Set(cell.events.map(e => e.color))];
          const dotColors = cell.isHoliday
            ? ['red', ...eventColors.filter(c => c !== 'red')].slice(0, 3)
            : eventColors.slice(0, 3);
          const cls = [
            'dash-cal-day',
            cell.other   ? 'other-month' : '',
            cell.isToday ? 'today'       : '',
            selDate === cell.key ? 'selected' : '',
          ].filter(Boolean).join(' ');
          return (
            <div key={cell.key} className={cls} data-date={cell.key} onClick={() => toggleDate(cell.key)}>
              <span className="dash-cal-day-num">{cell.day}</span>
              {dotColors.length > 0 && (
                <div className="dash-cal-dots">
                  {dotColors.map(c => (
                    <span key={c} className={`dash-cal-dot dash-cal-dot-${c}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selDate && (
        <div className="dash-cal-events">
          <div className="dash-cal-events-title">{selFmt}</div>
          {selHoliday && (
            <div style={{ color: 'var(--error,#dc2626)', fontSize: '.83em', fontWeight: 600, padding: '.15rem 0 .35rem' }}>
              วันหยุดราชการ — {selHoliday}
            </div>
          )}
          {!selEvents.length && !selHoliday && (
            <div className="dash-cal-events-title">ไม่มีกำหนดการ</div>
          )}
          {selEvents.map((ev, i) => (
            <Link key={i} to={ev.to} className="dash-cal-event">
              <span className="dash-cal-event-dot" style={{ background: DOT_COLORS[ev.color] ?? 'var(--text-muted)' }} />
              <span className="dash-cal-event-label">{ev.label}</span>
              <span>{ev.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Icon SVGs ────────────────────────────────────────────────────────────────
const ICON_CLIPBOARD = (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="1"/>
    <path d="M9 12h6M9 16h4"/>
  </svg>
);

const ICON_CALENDAR = (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);

const ICON_PENCIL = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

// ── Main component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [requests,  setRequests]  = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [visits,    setVisits]    = useState([]);
  const [deposits,  setDeposits]  = useState([]);
  const [storages,  setStorages]  = useState([]);
  const [donations, setDonations] = useState([]);
  const [holidayMap, setHolidayMap] = useState({});

  useEffect(() => {
    const _hdYear = new Date().getFullYear();
    Promise.all([
      getRequests({ limit: 50 }).catch(() => null),
      getProjects({ limit: 20 }).catch(() => null),
      getNotifications(1, 4).catch(() => null),
      getVisits({ limit: 50 }).catch(() => null),
      getDeposits({ limit: 50 }).catch(() => null),
      getStorageAreas({ limit: 50 }).catch(() => null),
      getDonations({ limit: 50 }).catch(() => null),
      getHolidays(_hdYear).catch(() => ({ data: [] })),
      getHolidays(_hdYear + 1).catch(() => ({ data: [] })),
    ]).then(([reqRes, projRes, , visitRes, depRes, storRes, donRes, hdRes, hdRes2]) => {
      setRequests(reqRes?.data  ?? []);
      setProjects(projRes?.data ?? []);
      setVisits(visitRes?.data  ?? []);
      setDeposits(depRes?.data  ?? []);
      setStorages(storRes?.data ?? []);
      setDonations(donRes?.data ?? []);
      const hmap = {};
      [...(hdRes?.data ?? []), ...(hdRes2?.data ?? [])].forEach(hd => {
        if (hd.date) hmap[hd.date] = hd.name;
      });
      setHolidayMap(hmap);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const todayStr = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Action banner items ──────────────────────────────────────────────────
  const actionItems = [];
  requests.filter(r => r.status === 'ready_for_pickup').forEach(r => {
    actionItems.push({ priority: 1, color: 'red',   label: 'ไปรับอุปกรณ์',  name: r.name || `#${r.id}`, date: r.requested_pickup_datetime,  to: '/requests/' + r.id });
  });
  requests.filter(r => r.status === 'in_lend' && r.is_overdue).forEach(r => {
    actionItems.push({ priority: 2, color: 'red',   label: 'เกินกำหนดคืน', name: r.name || `#${r.id}`, date: r.requested_return_datetime,  to: '/requests/' + r.id });
  });
  deposits.filter(d => d.status === 'approved').forEach(d => {
    actionItems.push({ priority: 3, color: 'amber', label: 'นำของมาฝาก',   name: d.project_name || `#${d.id}`, date: d.deposit_date,  to: '/deposits/' + d.id });
  });
  donations.filter(d => d.status === 'approved').forEach(d => {
    actionItems.push({ priority: 3, color: 'amber', label: 'นำของมามอบ',   name: d.project_name || `#${d.id}`, date: d.donation_date, to: '/donations/' + d.id });
  });
  deposits.filter(d => d.status === 'deposited').forEach(d => {
    actionItems.push({ priority: 4, color: 'amber', label: 'มารับของคืน',  name: d.project_name || `#${d.id}`, date: d.withdraw_date, to: '/deposits/' + d.id });
  });
  storages.filter(s => s.status === 'in_use').forEach(s => {
    actionItems.push({ priority: 4, color: 'amber', label: 'เตรียมคืนพื้นที่', name: s.project_name || `#${s.id}`, date: s.end_date, to: '/storage-areas/' + s.id });
  });
  visits.filter(v => v.status === 'confirmed').forEach(v => {
    actionItems.push({ priority: 5, color: 'blue',  label: 'เตรียมเยี่ยมชม', name: v.project_name || `#${v.id}`, date: v.visit_date, to: '/visits/' + v.id });
  });
  requests.filter(r => r.status === 'pending').forEach(r => {
    actionItems.push({ priority: 6, color: 'blue',  label: 'รอเจ้าหน้าที่', name: r.name || `#${r.id}`, date: null, to: '/requests/' + r.id });
  });
  requests.filter(r => r.status === 'processing').forEach(r => {
    actionItems.push({ priority: 6, color: 'blue',  label: 'กำลังเตรียม',  name: r.name || `#${r.id}`, date: null, to: '/requests/' + r.id });
  });
  actionItems.sort((a, b) => a.priority - b.priority);
  const shownActions = actionItems.slice(0, 5);
  const moreCount    = actionItems.length - shownActions.length;

  // ── Draft items ──────────────────────────────────────────────────────────
  const draftItems = [];
  requests.filter(r => r.status === 'draft').forEach(r => {
    draftItems.push({ type: 'คำขอยืม',    name: r.name || 'คำขอใหม่', to: '/requests/' + r.id });
  });
  deposits.filter(d => d.status === 'draft').forEach(d => {
    draftItems.push({ type: 'ฝากชั่วคราว', name: d.project_name || 'ร่างฝาก',    to: '/deposits/' + d.id });
  });
  donations.filter(d => d.status === 'draft').forEach(d => {
    draftItems.push({ type: 'บริจาค',      name: d.project_name || 'ร่างบริจาค', to: '/donations/' + d.id });
  });

  // ── 7-day timeline ───────────────────────────────────────────────────────
  const TL = 7;
  const timelineItems = [];
  requests.filter(r => r.status === 'ready_for_pickup' && withinDays(r.requested_pickup_datetime, TL)).forEach(r => {
    timelineItems.push({ date: new Date(r.requested_pickup_datetime), color: 'green', label: 'รับอุปกรณ์', name: r.name || `#${r.id}`, to: '/requests/' + r.id });
  });
  requests.filter(r => r.status === 'in_lend' && withinDays(r.requested_return_datetime, TL)).forEach(r => {
    timelineItems.push({ date: new Date(r.requested_return_datetime), color: 'amber', label: 'กำหนดคืน', name: r.name || `#${r.id}`, to: '/requests/' + r.id });
  });
  visits.filter(v => v.status === 'confirmed' && withinDays(v.visit_date, TL)).forEach(v => {
    timelineItems.push({ date: new Date(v.visit_date), color: 'blue', label: 'เยี่ยมชม', name: v.project_name || `#${v.id}`, to: '/visits/' + v.id });
  });
  deposits.filter(d => d.status === 'approved' && withinDays(d.deposit_date, TL)).forEach(d => {
    timelineItems.push({ date: new Date(d.deposit_date), color: 'green', label: 'นำของฝาก', name: d.project_name || `#${d.id}`, to: '/deposits/' + d.id });
  });
  deposits.filter(d => d.status === 'deposited' && withinDays(d.withdraw_date, TL)).forEach(d => {
    timelineItems.push({ date: new Date(d.withdraw_date), color: 'amber', label: 'รับของคืน', name: d.project_name || `#${d.id}`, to: '/deposits/' + d.id });
  });
  storages.filter(s => s.status === 'in_use' && withinDays(s.end_date, TL)).forEach(s => {
    timelineItems.push({ date: new Date(s.end_date), color: 'amber', label: 'คืนพื้นที่', name: s.project_name || `#${s.id}`, to: '/storage-areas/' + s.id });
  });
  donations.filter(d => d.status === 'approved' && withinDays(d.donation_date, TL)).forEach(d => {
    timelineItems.push({ date: new Date(d.donation_date), color: 'green', label: 'นำของมอบ', name: d.project_name || `#${d.id}`, to: '/donations/' + d.id });
  });
  timelineItems.sort((a, b) => a.date - b.date);

  // ── Event map for calendar ───────────────────────────────────────────────
  const eventMap = buildEventMap(requests, visits, deposits, storages, donations);

  // ── Active requests ──────────────────────────────────────────────────────
  const activeReqs = requests.filter(r => ['in_lend', 'ready_for_pickup', 'processing'].includes(r.status));

  // ── CTA button ───────────────────────────────────────────────────────────
  function handleCta() {
    if (projects.length === 0) navigate('/projects');
    else navigate('/requests/new');
  }

  const shownProjects = projects.slice(0, 6);

  return (
    <>
      {/* Header */}
      <div className="dash-header">
        <div>
          <div className="dash-greeting">ยินดีต้อนรับ, {user?.nickname || user?.name}</div>
          <div className="dash-header-sub">{todayStr}</div>
        </div>
        <button className="btn btn-primary" onClick={handleCta}>
          {projects.length === 0 ? '+ สร้างโครงการ' : '+ สร้างคำขอยืม'}
        </button>
      </div>

      {/* Action banner */}
      {actionItems.length > 0 && (
        <div className="dash-action-banner">
          <div className="dash-action-banner-header">
            ต้องดำเนินการ
            <span className="dash-action-count">{actionItems.length}</span>
          </div>
          {shownActions.map((a, i) => (
            <Link key={i} to={a.to} className="dash-action-item">
              <div className={`dash-action-bar dash-action-bar-${a.color}`} />
              <div className="dash-action-info">
                <span className={`dash-action-label dash-action-label-${a.color}`}>{a.label}</span>
                <span className="dash-action-name">{a.name}</span>
              </div>
              <span className="dash-action-date">{a.date ? formatDate(a.date) : ''}</span>
            </Link>
          ))}
          {moreCount > 0 && <div className="dash-action-more">และอีก {moreCount} รายการ</div>}
        </div>
      )}

      {/* Draft banner */}
      {draftItems.length > 0 && (
        <div className="dash-draft-banner">
          <div className="dash-draft-header">
            {ICON_PENCIL}
            ค้างไว้ — ดำเนินการต่อ
          </div>
          {draftItems.map((d, i) => (
            <Link key={i} to={d.to} className="dash-draft-item">
              <span className="dash-draft-type">{d.type}</span>
              <span className="dash-draft-name">{d.name}</span>
              <span className="dash-draft-arrow">→</span>
            </Link>
          ))}
        </div>
      )}

      {/* Projects */}
      <div className="dash-section-card" style={{ marginBottom: '1.25rem' }}>
        <div className="dash-section-header">
          <span className="dash-section-title">โครงการของฉัน</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/projects')}>+ สร้างโครงการ</button>
            <Link to="/projects" className="dash-section-link">ดูทั้งหมด →</Link>
          </div>
        </div>
        {shownProjects.length === 0 ? (
          <div className="dash-empty" style={{ padding: '2rem 0' }}>
            {ICON_CLIPBOARD}
            <span>ยังไม่มีโครงการ</span>
            <span style={{ fontSize: '.8rem' }}>สร้างโครงการแรกของคุณ</span>
          </div>
        ) : (
          <>
            <div className="dash-proj-grid">
              {shownProjects.map(p => (
                <Link key={p.id} to={'/projects/' + p.id} className="dash-proj-card">
                  <span className="dash-proj-card-name">{p.name}</span>
                  {(p.org_type || p.organization_type) && (
                    <span className="dash-proj-card-org">{p.org_type || p.organization_type}</span>
                  )}
                  <span className="dash-proj-card-meta">
                    {formatDate(p.start_date)}{p.end_date ? ' – ' + formatDate(p.end_date) : ''} · {p.member_count ?? 0} สมาชิก
                  </span>
                </Link>
              ))}
            </div>
            {projects.length > 6 && (
              <div style={{ marginTop: '.75rem', fontSize: '.82rem', color: 'var(--text-muted)' }}>
                และอีก {projects.length - 6} โครงการ —{' '}
                <Link to="/projects" style={{ color: 'var(--primary)' }}>ดูทั้งหมด</Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Calendar */}
      <div className="dash-section-card" style={{ marginBottom: '1.25rem' }}>
        <div className="dash-section-header">
          <span className="dash-section-title">ปฏิทินกำหนดการ</span>
        </div>
        <DashCalendar eventMap={eventMap} holidayMap={holidayMap} />
      </div>

      {/* 2-col: timeline + active requests */}
      <div className="dash-2col">
        <div className="dash-section-card">
          <div className="dash-section-header">
            <span className="dash-section-title">กำหนดการ 7 วัน</span>
          </div>
          {timelineItems.length === 0 ? (
            <div className="dash-empty">
              {ICON_CALENDAR}
              <span>ไม่มีกำหนดการ 7 วันข้างหน้า</span>
            </div>
          ) : (
            timelineItems.map((t, i) => (
              <Link key={i} to={t.to} className="dash-tl-item">
                <span className="dash-tl-date">{tlDateLabel(t.date)}</span>
                <span className={`dash-tl-pill dash-tl-pill-${t.color}`}>{t.label}</span>
                <span className="dash-tl-name">{t.name}</span>
                <span className="dash-tl-arrow">→</span>
              </Link>
            ))
          )}
        </div>

        <div className="dash-section-card">
          <div className="dash-section-header">
            <span className="dash-section-title">รายการที่กำลังดำเนินการ</span>
            <Link to="/requests" className="dash-section-link">ดูทั้งหมด →</Link>
          </div>
          {activeReqs.length === 0 ? (
            <div className="dash-empty">
              {ICON_CLIPBOARD}
              <span>ไม่มีรายการที่กำลังดำเนินการ</span>
            </div>
          ) : (
            <div className="dash-req-table">
              {activeReqs.slice(0, 6).map(r => (
                <Link key={r.id} to={'/requests/' + r.id} className="dash-req-row">
                  <StatusBadge status={r.status} />
                  <span className="dash-req-name">{r.name || '#' + r.id}</span>
                  <span className="dash-req-date">{r.requested_return_datetime ? formatDate(r.requested_return_datetime) : ''}</span>
                  <span className="dash-req-arrow">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
