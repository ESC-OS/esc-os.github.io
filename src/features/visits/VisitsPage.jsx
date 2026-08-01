import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getVisits } from '../../api/api';
import { formatDate } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import VisitModal from './VisitModal';

const STATUS_OPTS = [
  ['', 'ทุกสถานะ'],
  ['pending', 'รอดำเนินการ'],
  ['confirmed', 'ยืนยันแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['rejected', 'ถูกปฏิเสธ'],
  ['cancelled', 'ยกเลิกแล้ว'],
];

export default function VisitsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [visits, setVisits] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async (s) => {
    setLoading(true);
    setError('');
    try {
      const res = await getVisits(s || undefined);
      setVisits(res?.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(status); }, [load, status]);

  function handleStatusChange(e) {
    setStatus(e.target.value);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">การเยี่ยมชม</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ จองเยี่ยมชม</button>
        </div>
      </div>

      <div className="filter-row">
        <select className="filter-select" value={status} onChange={handleStatusChange}>
          {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : visits.length === 0 ? (
        <p className="empty-text">ไม่มีการจองเยี่ยมชม</p>
      ) : (
        <div className="svc-list">
          {visits.map(v => (
            <div key={v.id} className="svc-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/visits/${v.id}`)}>
              <span className="svc-row-id">{formatDate(v.visit_date)}</span>
              <span className="svc-row-name">{v.project_name || v.project_id}</span>
              <span className="svc-row-meta">{v.visit_time || '-'} · {v.num_people ?? '-'} คน</span>
              <StatusBadge status={v.status} />
              <span className="svc-row-arrow">›</span>
            </div>
          ))}
        </div>
      )}

      <VisitModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => load(status)}
      />
    </div>
  );
}
