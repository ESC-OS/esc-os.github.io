import { useState, useEffect, useCallback } from 'react';
import { getNotifications, markNotifRead, markAllRead } from '../../api/api';
import { formatDateTime } from '../../shared/utils/format';
import { showError } from '../../shared/ErrorToast';
import Spinner from '../../shared/Spinner';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPage = useCallback(async (pg) => {
    setLoading(true);
    setError(null);
    try {
      const [unreadRes, notifRes] = await Promise.all([
        getNotifications(1, 1).catch(() => null),
        getNotifications(pg, 20).catch(err => { showError(`เกิดข้อผิดพลาด: ${err.message}`); return null; }),
      ]);
      if (!notifRes) { setError('ไม่สามารถโหลดการแจ้งเตือนได้'); return; }
      const pagination = notifRes?.pagination ?? { page: pg, limit: 20, total: 0, unread: 0 };
      setNotifications(notifRes?.notifications ?? []);
      setUnread(unreadRes?.pagination?.unread ?? pagination.unread ?? 0);
      setTotalPages(Math.max(1, Math.ceil(pagination.total / (pagination.limit || 20))));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPage(page); }, [page, loadPage]);

  async function handleMarkRead(notif) {
    if (notif.is_read !== 0) return;
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n));
    setUnread(prev => Math.max(0, prev - 1));
    await markNotifRead(String(notif.id)).catch(() => {});
  }

  async function handleMarkAll() {
    try {
      await markAllRead();
      await loadPage(page);
    } catch (err) {
      showError(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">
          การแจ้งเตือน
          {unread > 0 && (
            <span className="badge-count" style={{ marginLeft: '.4rem' }}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </h1>
        <div className="page-header-actions">
          {unread > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={handleMarkAll}>อ่านทั้งหมด</button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <p className="empty-text">ไม่มีการแจ้งเตือน</p>
      ) : (
        <div className="notif-list">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`notif-item ${n.is_read === 0 ? 'unread' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => handleMarkRead(n)}
            >
              <div className="notif-title">{n.title ?? ''}</div>
              <div className="notif-body">{n.body ?? ''}</div>
              <div className="notif-date">{formatDateTime(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn btn-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >← ก่อนหน้า</button>
          <span className="pagination-info">หน้า {page} / {totalPages}</span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >ถัดไป →</button>
        </div>
      )}
    </>
  );
}
