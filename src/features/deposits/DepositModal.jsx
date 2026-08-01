import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../shared/Modal';
import Spinner from '../../shared/Spinner';
import { showError } from '../../shared/ErrorToast';
import {
  getProjects, createDeposit, updateDeposit, addDepositItem, submitDeposit,
} from '../../api/api';

export default function DepositModal({ isOpen, onClose, projectId, onSuccess }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [noProjects, setNoProjects] = useState(false);

  const [selProject, setSelProject] = useState(projectId || '');
  const [depositDate, setDepositDate] = useState('');
  const [withdrawDate, setWithdrawDate] = useState('');
  const [items, setItems] = useState([]);

  // Item form fields
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemNote, setItemNote] = useState('');
  const [itemError, setItemError] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    setItems([]);
    setItemName('');
    setItemQty(1);
    setItemNote('');
    setItemError('');
    setDepositDate('');
    setWithdrawDate('');
    try {
      const res = await getProjects();
      const list = res?.data ?? [];
      setProjects(list);
      setNoProjects(list.length === 0);
      setSelProject(projectId || '');
    } catch (err) {
      showError('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
      onClose();
    } finally {
      setLoading(false);
    }
  }, [isOpen, projectId, onClose]);

  useEffect(() => { load(); }, [load]);

  function addItem() {
    setItemError('');
    const name = itemName.trim();
    const qty = isNaN(itemQty) || itemQty < 1 ? 1 : itemQty;
    const note = itemNote.trim();
    if (!name) { setItemError('กรุณาระบุชื่อสิ่งของ'); return; }
    setItems(prev => [...prev, { name, quantity: qty, note }]);
    setItemName('');
    setItemQty(1);
    setItemNote('');
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    setError('');
    if (!selProject) { setError('กรุณาเลือกโครงการ'); return; }
    if (!depositDate) { setError('กรุณาระบุวันฝาก'); return; }
    if (!withdrawDate) { setError('กรุณาระบุวันรับคืน'); return; }
    if (items.length === 0) { setError('กรุณาเพิ่มรายการสิ่งของอย่างน้อย 1 รายการ'); return; }

    setSubmitting(true);
    try {
      const cr = await createDeposit(selProject);
      const did = cr.data.id;
      await updateDeposit(did, { deposit_date: depositDate, withdraw_date: withdrawDate });
      for (const it of items) {
        await addDepositItem(did, { name: it.name, quantity: it.quantity, ...(it.note ? { note: it.note } : {}) });
      }
      await submitDeposit(did);
      onClose();
      onSuccess?.(did);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ฝากของใหม่" wide>
      {loading ? (
        <Spinner />
      ) : noProjects ? (
        <>
          <div className="alert alert-warning">คุณยังไม่มีโครงการ กรุณาสร้างโครงการก่อน</div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => { onClose(); navigate('/projects'); }}>ไปที่โครงการ</button>
            <button className="btn btn-secondary" onClick={onClose}>ปิด</button>
          </div>
        </>
      ) : (
        <>
          {error && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', alignItems: 'start' }}>
            {/* Left: project + dates */}
            <div className="form" style={{ padding: 0 }}>
              <div className="form-group">
                <label className="form-label">โครงการ <span className="form-required">*</span></label>
                <select className="form-select" value={selProject} onChange={e => setSelProject(e.target.value)}>
                  <option value="">-- เลือกโครงการ --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">วันฝาก <span className="form-required">*</span></label>
                <input className="form-input" type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">วันรับคืน <span className="form-required">*</span></label>
                <input className="form-input" type="date" value={withdrawDate} onChange={e => setWithdrawDate(e.target.value)} />
                <span className="form-hint">สูงสุด 7 วันทำการ</span>
              </div>
            </div>

            {/* Right: items */}
            <div>
              <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: '.35rem' }}>รายการของที่ฝาก</div>
              <div style={{ background: 'var(--bg)', padding: '.65rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: '.65rem' }}>
                <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.35rem' }}>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="ชื่อสิ่งของ"
                    autoComplete="off"
                    style={{ flex: 2, fontSize: '.85rem' }}
                    value={itemName}
                    onChange={e => setItemName(e.target.value)}
                  />
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    style={{ width: 60, fontSize: '.85rem' }}
                    value={itemQty}
                    onChange={e => setItemQty(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
                <input
                  className="form-input"
                  type="text"
                  placeholder="หมายเหตุ (ไม่บังคับ)"
                  autoComplete="off"
                  style={{ fontSize: '.85rem', marginBottom: '.35rem' }}
                  value={itemNote}
                  onChange={e => setItemNote(e.target.value)}
                />
                {itemError && <div className="alert alert-error" style={{ marginBottom: '.25rem' }}>{itemError}</div>}
                <button className="btn btn-secondary btn-sm" onClick={addItem}>+ เพิ่มสิ่งของ</button>
              </div>

              {/* Items list */}
              <div>
                {items.length === 0 ? (
                  <p className="empty-text" style={{ margin: 0 }}>ยังไม่มีรายการสิ่งของ</p>
                ) : (
                  <>
                    {items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem', fontSize: '.85rem' }}>
                        <span style={{ flex: 1 }}>
                          {it.name} × {it.quantity}
                          {it.note && <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}> ({it.note})</span>}
                        </span>
                        <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>ลบ</button>
                      </div>
                    ))}
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '.15rem' }}>รวม {items.length} รายการ</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'กำลังส่งคำขอ…' : 'ส่งคำขอ'}
            </button>
            <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>ยกเลิก</button>
          </div>
        </>
      )}
    </Modal>
  );
}
