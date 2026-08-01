import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRequests } from '../../api/api';
import { formatDate } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import RequestModal from './RequestModal';

const STATUS_OPTS = [
  ['', 'ทุกสถานะ'],
  ['draft', 'ร่าง'],
  ['pending', 'รอดำเนินการ'],
  ['processing', 'กำลังดำเนินการ'],
  ['ready_for_pickup', 'พร้อมรับ'],
  ['in_lend', 'กำลังยืม'],
  ['returned', 'คืนแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['rejected', 'ถูกปฏิเสธ'],
  ['cancelled', 'ยกเลิกแล้ว'],
];

export default function RequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin   = user?.role === 'admin';
  const adminView = isAdmin && searchParams.get('view') === 'admin';

  const [status, setStatus]       = useState(adminView ? 'pending' : (searchParams.get('status') || ''));
  const [requests, setRequests]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    load(status);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load(st) {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 100 };
      if (st) params.status = st;
      const res = await getRequests(params);
      setRequests(res?.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleStatusChange(e) {
    const val = e.target.value;
    setStatus(val);
    const sp = new URLSearchParams(searchParams);
    if (val) sp.set('status', val); else sp.delete('status');
    setSearchParams(sp, { replace: true });
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{adminView ? 'คำขอยืม (ทั้งหมด)' : 'คำขอยืม'}</h1>
        <div className="page-header-actions">
          <div className="filter-row">
            <select className="filter-select" value={status} onChange={handleStatusChange}>
              {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {!adminView && (
            <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ สร้างคำขอ</button>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : requests.length === 0 ? (
        <p className="empty-text">ไม่มีคำขอ</p>
      ) : (
        <div className="svc-list">
          {requests.map(r => (
            <div
              key={r.id}
              className="svc-row"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/requests/${r.id}`)}
            >
              <span className="svc-row-id">#{r.id}</span>
              <span className="svc-row-name">{r.name || '-'}</span>
              {adminView && r.user_name && (
                <span className="svc-row-meta" style={{ color: 'var(--text-muted)' }}>{r.user_name}</span>
              )}
              <span>
                <StatusBadge status={r.status} />
                {r.is_overdue && <span className="badge badge-overdue" style={{ marginLeft: '.25rem' }}>เกินกำหนด</span>}
              </span>
              <span className="svc-row-meta">{formatDate(r.requested_pickup_datetime)}</span>
              <span className="svc-row-arrow">›</span>
            </div>
          ))}
        </div>
      )}

      <RequestModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
