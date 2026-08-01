import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getDeposits } from '../../api/api';
import { formatDate } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import DepositModal from './DepositModal';

const STATUS_OPTS = [
  ['', 'ทุกสถานะ'],
  ['draft', 'ร่าง'],
  ['pending', 'รอดำเนินการ'],
  ['approved', 'อนุมัติแล้ว'],
  ['deposited', 'รับฝากแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['rejected', 'ถูกปฏิเสธ'],
];

export default function DepositsPage() {
  const navigate = useNavigate();

  const [deposits, setDeposits] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async (s) => {
    setLoading(true);
    setError('');
    try {
      const res = await getDeposits(s || undefined);
      setDeposits(res?.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(status); }, [load, status]);

  function handleSuccess(id) {
    if (id) navigate(`/deposits/${id}`);
    else load(status);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ฝากชั่วคราว</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ ฝากของใหม่</button>
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
      ) : deposits.length === 0 ? (
        <p className="empty-text">ไม่มีรายการฝากชั่วคราว</p>
      ) : (
        <div className="svc-list">
          {deposits.map(d => {
            const itemCount = d.item_count ?? d.items?.length ?? 0;
            return (
              <div key={d.id} className="svc-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/deposits/${d.id}`)}>
                <span className="svc-row-id">#{d.id}</span>
                <span className="svc-row-name">{d.project_name || d.project_id || '-'}</span>
                <span className="svc-row-meta">{itemCount} รายการ · ฝาก {formatDate(d.deposit_date)}</span>
                <StatusBadge status={d.status} />
                <span className="svc-row-arrow">›</span>
              </div>
            );
          })}
        </div>
      )}

      <DepositModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
