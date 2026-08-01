import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDonations } from '../../api/api';
import { formatDate } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';

const STATUS_OPTS = [
  ['', 'ทุกสถานะ'],
  ['draft', 'ร่าง'],
  ['pending', 'รอดำเนินการ'],
  ['approved', 'อนุมัติแล้ว'],
  ['donated', 'บริจาคแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['rejected', 'ถูกปฏิเสธ'],
];

export default function DonationsPage() {
  const navigate = useNavigate();

  const [donations, setDonations] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (s) => {
    setLoading(true);
    setError('');
    try {
      const res = await getDonations(s || undefined);
      setDonations(res?.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(status); }, [load, status]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">การบริจาค</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => navigate('/donations/new')}>+ บริจาค</button>
        </div>
      </div>

      <div className="filter-row">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : donations.length === 0 ? (
        <p className="empty-text">ไม่มีรายการบริจาค</p>
      ) : (
        <div className="svc-list">
          {donations.map(d => (
            <div key={d.id} className="svc-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/donations/${d.id}`)}>
              <span className="svc-row-id">#{d.id}</span>
              <span className="svc-row-name">{d.project_name || d.project_id || '-'}</span>
              <span className="svc-row-meta">{d.item_count ?? 0} รายการ · {formatDate(d.donation_date)}</span>
              <StatusBadge status={d.status} />
              <span className="svc-row-arrow">›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
