import { useState, useEffect, useCallback } from 'react';
import { getAllReturns, getReturn, confirmReturn, photoUrl } from '../../../api/api';
import { formatDateTime } from '../../../shared/utils/format';
import { showError } from '../../../shared/ErrorToast';
import Spinner from '../../../shared/Spinner';
import StatusBadge from '../../../shared/StatusBadge';

export default function AdminReturnsPage() {
  const [view, setView] = useState('list'); // 'list' | returnId
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllReturns('pending');
      setReturns(res.data ?? []);
    } catch (err) {
      showError(err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  if (view !== 'list') {
    return <ReturnDetail returnId={view} onBack={() => { setView('list'); loadList(); }} />;
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">การคืนอุปกรณ์ (รอยืนยัน)</h1>
      </div>

      {loading ? <Spinner /> : returns.length === 0 ? (
        <p className="empty-text">ไม่มีรายการคืนที่รอยืนยัน</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ชื่อคำขอ</th>
                <th>รหัสคำขอ</th>
                <th>วันที่ส่งคืน</th>
                <th>สภาพ</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {returns.map(r => (
                <tr key={r.id} className="clickable-row" style={{ cursor: 'pointer' }} onClick={() => setView(r.id)}>
                  <td>{r.request_name ?? '-'}</td>
                  <td style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{r.request_id ?? ''}</td>
                  <td style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{formatDateTime(r.created_at)}</td>
                  <td>
                    {(r.all_items_ok === 1 || r.all_items_ok === true)
                      ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>ปกติ</span>
                      : <span style={{ color: 'var(--error)', fontWeight: 600 }}>มีปัญหา</span>}
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ReturnDetail({ returnId, onBack }) {
  const [ret, setRet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [returnQtys, setReturnQtys] = useState({});
  const [repairQtys, setRepairQtys] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    getReturn(returnId)
      .then(res => {
        const r = res.data ?? res;
        setRet(r);
        const rq = {}, rep = {};
        (r.items ?? []).forEach(it => {
          rq[it.item_id]  = it.quantity_approved;
          rep[it.item_id] = 0;
        });
        setReturnQtys(rq); setRepairQtys(rep);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [returnId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const items = ret.items ?? [];
    const payload = [];
    let valid = true;
    for (const it of items) {
      const qty_returned  = parseInt(returnQtys[it.item_id] ?? it.quantity_approved);
      const qty_to_repair = parseInt(repairQtys[it.item_id] ?? 0);
      if (qty_returned < 0 || qty_returned > it.quantity_approved) {
        setFormError(`จำนวนที่รับคืนต้องอยู่ระหว่าง 0–${it.quantity_approved}`); valid = false; break;
      }
      if (qty_to_repair < 0 || qty_to_repair > qty_returned) {
        setFormError('จำนวนส่งซ่อมต้องไม่เกินจำนวนที่รับคืน'); valid = false; break;
      }
      payload.push({ item_id: it.item_id, quantity_returned: qty_returned, ...(qty_to_repair > 0 ? { quantity_to_repair: qty_to_repair } : {}) });
    }
    if (!valid) return;
    setSaving(true);
    try {
      await confirmReturn(returnId, { items: payload });
      onBack();
    } catch (err) {
      setFormError(err.message);
    } finally { setSaving(false); }
  }

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;

  const conditions  = ret.conditions ?? [];
  const items       = ret.items ?? [];
  const hasProblems = conditions.length > 0 || ret.all_items_ok === 0 || ret.all_items_ok === false;

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← รายการคืน</button>
      </div>

      <div className="page-header">
        <h1 className="page-title">ยืนยันการคืน</h1>
        <StatusBadge status={ret.status} />
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-title">ข้อมูลการคืน</div>
        {ret.photo_r2_key && (
          <img
            src={photoUrl(ret.photo_r2_key)}
            alt="รูปการคืน"
            style={{ maxWidth: 320, width: '100%', borderRadius: 8, marginBottom: '1rem', display: 'block' }}
          />
        )}
        <div className="info-row"><span className="info-label">ชื่อคำขอ:</span> {ret.request_name ?? '-'}</div>
        <div className="info-row"><span className="info-label">วันที่ส่งคืน:</span> {formatDateTime(ret.created_at)}</div>
        {ret.note && <div className="info-row"><span className="info-label">หมายเหตุจากผู้ใช้:</span> {ret.note}</div>}
        <div className="info-row">
          <span className="info-label">สภาพอุปกรณ์:</span>
          {hasProblems
            ? <span style={{ color: 'var(--error)', fontWeight: 600 }}>มีปัญหา / ชำรุด</span>
            : <span style={{ color: 'var(--success)', fontWeight: 600 }}>ปกติทุกชิ้น</span>}
        </div>
      </div>

      {conditions.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--error)' }}>
          <div className="card-title" style={{ color: 'var(--error)' }}>รายงานปัญหา</div>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {conditions.map((c, i) => (
              <li key={i} style={{ marginBottom: '.4rem' }}>
                <strong>{c.item_name ?? c.item_id}</strong>
                {c.condition !== 'ok' && <> — <span style={{ color: 'var(--error)' }}>{c.condition}</span></>}
                {c.note ? `: ${c.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ret.status === 'pending' ? (
        <div className="card">
          <div className="card-title">ยืนยันการรับคืน</div>
          <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            ระบุจำนวนที่รับคืนจริง และจำนวนที่ต้องส่งซ่อม (ถ้ามี)
          </p>
          {formError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="table-wrap" style={{ marginBottom: '1rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ชื่ออุปกรณ์</th>
                    <th>อนุมัติไป</th>
                    <th>รับคืนได้ <span className="form-required">*</span></th>
                    <th>ส่งซ่อม</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.item_id}>
                      <td>{it.item_name ?? it.item_id}</td>
                      <td>{it.quantity_approved}</td>
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          min={0}
                          max={it.quantity_approved}
                          value={returnQtys[it.item_id] ?? it.quantity_approved}
                          onChange={e => setReturnQtys(prev => ({ ...prev, [it.item_id]: e.target.value }))}
                          style={{ width: 80 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          min={0}
                          value={repairQtys[it.item_id] ?? 0}
                          onChange={e => setRepairQtys(prev => ({ ...prev, [it.item_id]: e.target.value }))}
                          style={{ width: 80 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'ยืนยันการรับคืน'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onBack}>ยกเลิก</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card">
          <p style={{ color: 'var(--text-muted)' }}>รายการนี้ได้รับการยืนยันแล้ว</p>
        </div>
      )}
    </>
  );
}
