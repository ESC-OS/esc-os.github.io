import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getRequests, getAllReturns, getVisits } from '../api/api';

const BELL_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export default function Layout() {
  const { user, unread, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [queueCount, setQueueCount] = useState(0);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    document.body.classList.add('has-sidebar');
    return () => document.body.classList.remove('has-sidebar');
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.allSettled([
      getRequests({ limit: 100, status: 'pending' }),
      getAllReturns('pending'),
      getVisits({ limit: 100, status: 'pending' }),
    ]).then(([rq, rt, vs]) => {
      const total =
        (rq.status === 'fulfilled' ? (rq.value?.data?.length ?? 0) : 0) +
        (rt.status === 'fulfilled' ? (rt.value?.data?.length ?? 0) : 0) +
        (vs.status === 'fulfilled' ? (vs.value?.data?.length ?? 0) : 0);
      setQueueCount(total);
    }).catch(() => {});
  }, [isAdmin]);

  const navCls = (path) => ({ isActive }) =>
    `sidebar-link${isActive || location.pathname.startsWith(path + '/') ? ' active' : ''}`;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const year = new Date().getFullYear();

  return (
    <>
      <div id="navbar-root">
      <aside className="sidebar">
        <NavLink to="/dashboard" className="sidebar-brand">
          <img src="/ESC_logo.png" alt="กวศ." />
          <span className="sidebar-brand-name">Operation Support</span>
        </NavLink>
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">เมนูหลัก</div>
          <NavLink to="/dashboard" className={navCls('/dashboard')}>หน้าหลัก</NavLink>
          <NavLink to="/items" className={navCls('/items')}>อุปกรณ์</NavLink>
          <NavLink to="/projects" className={navCls('/projects')}>โครงการ</NavLink>
          <NavLink to="/requests" className={navCls('/requests')}>คำขอยืม</NavLink>
          <NavLink to="/visits" className={navCls('/visits')}>เยี่ยมชม</NavLink>
          <NavLink to="/deposits" className={navCls('/deposits')}>ฝากชั่วคราว</NavLink>
          <NavLink to="/storage-areas" className={navCls('/storage-areas')}>พื้นที่จัดเก็บ</NavLink>
          <NavLink to="/donations" className={navCls('/donations')}>บริจาค</NavLink>
          <NavLink to="/notifications" className={navCls('/notifications')}>
            การแจ้งเตือน
            {unread > 0 && <span className="sidebar-notif-dot">{unread > 99 ? '99+' : unread}</span>}
          </NavLink>
          {isAdmin && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: '.5rem' }}>แอดมิน</div>
              <NavLink to="/admin/items" className={navCls('/admin/items')}>จัดการอุปกรณ์</NavLink>
              <NavLink to="/admin/queue" className={navCls('/admin/queue')}>
                จัดการคำขอ
                {queueCount > 0 && <span className="sidebar-notif-dot">{queueCount > 99 ? '99+' : queueCount}</span>}
              </NavLink>
              <NavLink to="/admin/calendar" className={navCls('/admin/calendar')}>ปฏิทิน</NavLink>
              <NavLink to="/admin/slots" className={navCls('/admin/slots')}>ช่วงเวลา</NavLink>
              <NavLink to="/admin/holidays" className={navCls('/admin/holidays')}>วันหยุด</NavLink>
              <NavLink to="/admin/broadcast" className={navCls('/admin/broadcast')}>แจ้งเตือน</NavLink>
              <NavLink to="/admin/users" className={navCls('/admin/users')}>ผู้ใช้งาน</NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-logout" onClick={handleLogout}>ออกจากระบบ</button>
        </div>
      </aside>
      </div>

      <div id="right-pane">
        <header className="topbar">
          <div className="topbar-left" />
          <div className="topbar-right">
            <NavLink to="/notifications" className="topbar-notif" aria-label={`การแจ้งเตือน (${unread} ใหม่)`}>
              {BELL_SVG}
              {unread > 0 && <span className="topbar-badge">{unread > 99 ? '99+' : unread}</span>}
            </NavLink>
            <NavLink to="/profile" className="topbar-profile-link" title={user?.nickname || user?.name}>
              {user?.avatar_url
                ? <img src={user.avatar_url} alt={user?.name} className="topbar-avatar" />
                : <div className="topbar-avatar-ph">{user?.name?.charAt(0).toUpperCase()}</div>
              }
            </NavLink>
          </div>
        </header>

        <main id="app">
          <Outlet />
        </main>

        <footer className="site-footer">
          <span>Operation Support</span>
          <span>© {year} คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</span>
        </footer>
      </div>
    </>
  );
}
