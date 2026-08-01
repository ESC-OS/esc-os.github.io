import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItem, getStockLogs, manageStock } from '../../../api/api';
import { formatDateTime } from '../../../shared/utils/format';
import { showError } from '../../../shared/ErrorToast';
import Spinner from '../../../shared/Spinner';

const ACTION_META = {
  add:                 { label: 'เพิ่มสต็อก',    color: 'var(--success)', noteRequired: false },
  remove:              { label: 'นำออก',          color: 'var(--error)',   noteRequired: false },
  send_to_repair:      { label: 'ส่งซ่อม',        color: 'var(--warning)', noteRequired: true  },
  restore_from_repair: { label: 'รับคืนจากซ่อม', color: 'var(--info)',    noteRequired: false },
};

export default function AdminStockPage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionState, setActionState] = useState({}); // action -> { qty, note, loading, error }
  const [globalError, setGlobalError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [itemRes, logsRes] = await Promise.all([getItem(id), getStockLogs(id)]);
      setItem(itemRes.data ?? itemRes);
      setLogs(logsRes.data ?? logsRes ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function getActionVal(action, field, def) {
    return actionState[action]?.[field] ?? def;
  }
  function setActionVal(action, field, val) {
    setActionState(prev => ({ ...prev, [action]: { ...prev[action], [field]: val } }));
  }

  async function handleAction(action) {
    const meta = ACTION_META[action];
    const qty = parseInt(getActionVal(action, 'qty', 1));
    const note = getActionVal(action, 'note', '').trim();
    setGlobalError('');

    if (!qty || qty < 1) { setGlobalError('กรุณาระบุจำนวนที่ถูกต้อง'); return; }
    if (meta.noteRequired && !note) { setGlobalError('กรุณาระบุเหตุผล'); return; }

    setActionVal(action, 'loading', true);
    try {
      await manageStock(id, { action, quantity: qty, note: note || undefined });
      await load();
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      setActionVal(action, 'loading', false);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/admin/items" className="btn btn-secondary btn-sm">← จัดการอุปกรณ์</Link>
      </div>

      <div className="page-header">
        <h1 className="page-title">สต็อก: {item.name}</h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { label: 'ทั้งหมด', value: item.total_quantity, color: null },
          { label: 'พร้อมใช้', value: item.available_quantity, color: 'var(--success)' },
          { label: 'กำลังซ่อม', value: item.repair_quantity, color: 'var(--error)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
            <div style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{s.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {globalError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{globalError}</div>}

      {/* Action Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {Object.entries(ACTION_META).map(([action, meta]) => (
          <div key={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            <div className="card-title" style={{ color: meta.color, marginBottom: 0 }}>{meta.label}</div>
            <input
              type="number"
              className="form-input"
              min={1}
              value={getActionVal(action, 'qty', 1)}
              onChange={e => setActionVal(action, 'qty', e.target.value)}
              placeholder="จำนวน"
            />
            <input
              className="form-input"
              value={getActionVal(action, 'note', '')}
              onChange={e => setActionVal(action, 'note', e.target.value)}
              placeholder={meta.noteRequired ? 'เหตุผล (จำเป็น)' : 'หมายเหตุ (ถ้ามี)'}
            />
            <button
              className="btn btn-sm"
              style={{ background: meta.color, color: '#fff', border: 'none' }}
              disabled={getActionVal(action, 'loading', false)}
              onClick={() => handleAction(action)}
            >
              {getActionVal(action, 'loading', false) ? 'กำลังดำเนินการ...' : meta.label}
            </button>
          </div>
        ))}
      </div>

      {/* Log Table */}
      <div className="card">
        <div className="card-title">ประวัติสต็อก</div>
        {logs.length === 0 ? (
          <p className="empty-text">ยังไม่มีประวัติ</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>การดำเนินการ</th>
                  <th>จำนวน</th>
                  <th>หมายเหตุ</th>
                  <th>โดย</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => {
                  const meta = ACTION_META[l.action];
                  const delta = l.quantity_delta > 0 ? `+${l.quantity_delta}` : String(l.quantity_delta);
                  return (
                    <tr key={i}>
                      <td style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>{formatDateTime(l.created_at)}</td>
                      <td>
                        <span style={{ color: meta ? meta.color : 'inherit', fontWeight: 600, fontSize: '.85rem' }}>
                          {meta ? meta.label : l.action}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: l.quantity_delta >= 0 ? 'var(--success)' : 'var(--error)' }}>{delta}</td>
                      <td>{l.note ?? '-'}</td>
                      <td>{l.admin_name ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
