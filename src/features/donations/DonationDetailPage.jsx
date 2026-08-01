import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getDonation, submitDonation, reviewDonationItem,
  approveDonation, rejectDonation, donateDonation, completeDonation,
  uploadPhoto, photoUrl,
} from '../../api/api';
import { formatDate } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import Modal from '../../shared/Modal';
import ConfirmModal from '../../shared/ConfirmModal';

const ITEM_STATUS_LABELS = { pending: 'รอพิจารณา', approved: 'อนุมัติ', rejected: 'ปฏิเสธ' };
const ITEM_STATUS_CLS    = { pending: 'pending',    approved: 'approved', rejected: 'rejected' };

function ItemStatusBadge({ status }) {
  return (
    <span className={`badge badge-${ITEM_STATUS_CLS[status] || status}`}>
      {ITEM_STATUS_LABELS[status] || status}
    </span>
  );
}

function RejectDonationModal({ isOpen, onClose, onReject }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) { setNote(''); setError(''); }
  }, [isOpen]);

  async function handleConfirm() {
    setError('');
    if (!note.trim()) { setError('กรุณาระบุเหตุผล'); return; }
    setSubmitting(true);
    try {
      await onReject(note.trim());
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ปฏิเสธการบริจาค">
      {error && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{error}</div>}
      <div className="form">
        <div className="form-group">
          <label className="form-label" htmlFor="reject-note">เหตุผล <span className="form-required">*</span></label>
          <textarea
            className="form-textarea"
            id="reject-note"
            rows={3}
            placeholder="ระบุเหตุผล…"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-danger" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'กำลังดำเนินการ...' : 'ปฏิเสธ'}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>ยกเลิก</button>
        </div>
      </div>
    </Modal>
  );
}

function DonateModal({ isOpen, onClose, onDonate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) { setDate(today); setFile(null); setError(''); }
  }, [isOpen]);

  async function handleConfirm() {
    setError('');
    if (!date) { setError('กรุณาระบุวันบริจาค'); return; }
    if (!file) { setError('กรุณาเลือกรูปภาพ'); return; }
    setUploading(true);
    try {
      const r2Key = await uploadPhoto(file);
      await onDonate({ photo_r2_key: r2Key, donation_date: date });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="นำของมามอบ">
      {error && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{error}</div>}
      <div className="form">
        <div className="form-group">
          <label className="form-label" htmlFor="f-donate-date">
            วันบริจาคจริง <span className="form-required">*</span>
          </label>
          <input type="date" className="form-input" id="f-donate-date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="f-donate-photo">
            รูปภาพ <span className="form-required">*</span>
          </label>
          <input type="file" accept="image/*" className="form-input" id="f-donate-photo" onChange={e => setFile(e.target.files[0] || null)} />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleConfirm} disabled={uploading}>
            {uploading ? 'กำลังอัปโหลด...' : 'ยืนยันการบริจาค'}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>ยกเลิก</button>
        </div>
      </div>
    </Modal>
  );
}

export default function DonationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [donation, setDonation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Per-item review state: { [itemId]: qty }
  const [itemQtys, setItemQtys] = useState({});
  const [itemLoading, setItemLoading] = useState({});

  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);

  // Per-item reject confirm
  const [rejectItemId, setRejectItemId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setActionError('');
    try {
      const res = await getDonation(id);
      setDonation(res.data);
      // Initialize qty state for items
      const qtys = {};
      for (const item of res.data?.items ?? []) {
        qtys[item.id] = item.quantity ?? 1;
      }
      setItemQtys(qtys);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!donation) return null;

  const isAdmin = user?.role === 'admin' || user?.role === 'staff';
  const isOwner = user?.id === donation.user_id;
  const status = donation.status;
  const items = donation.items ?? [];
  const allReviewed = items.length > 0 && items.every(i => i.status !== 'pending');

  function setActionErr(msg) { setActionError(msg); }

  async function handleSubmit() {
    setActionError('');
    try {
      await submitDonation(id);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleItemApprove(item) {
    setActionError('');
    const qty = parseInt(itemQtys[item.id] ?? item.quantity, 10);
    if (!qty || qty < 1) { setActionError('กรุณาระบุจำนวนที่อนุมัติให้ถูกต้อง'); return; }
    setItemLoading(prev => ({ ...prev, [item.id]: true }));
    try {
      await reviewDonationItem(id, item.id, { action: 'approve', quantity_approved: qty });
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setItemLoading(prev => ({ ...prev, [item.id]: false }));
    }
  }

  async function handleItemReject(itemId) {
    setActionError('');
    setItemLoading(prev => ({ ...prev, [itemId]: true }));
    try {
      await reviewDonationItem(id, itemId, { action: 'reject' });
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setItemLoading(prev => ({ ...prev, [itemId]: false }));
    }
  }

  async function handleApproveDonation() {
    setActionError('');
    try {
      await approveDonation(id, {});
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleRejectDonation(note) {
    await rejectDonation(id, { admin_note: note });
    await load();
  }

  async function handleDonate(data) {
    await donateDonation(id, data);
    await load();
  }

  async function handleComplete() {
    setActionError('');
    try {
      await completeDonation(id);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  const showActions = (status === 'draft' && isOwner)
    || (status === 'pending' && isAdmin && allReviewed)
    || (status === 'approved' && isOwner)
    || (status === 'donated' && isAdmin);

  return (
    <div>
      <Link to="/donations" className="back-btn">← การบริจาค</Link>

      <div className="req-header">
        <div className="req-title-row">
          <h1 className="page-title" style={{ margin: 0 }}>#{id}</h1>
          <StatusBadge status={status} />
        </div>
        <div className="page-title" style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-muted)' }}>
          {donation.project_name || donation.project_id || '-'}
        </div>
        {showActions && (
          <div className="actions-bar">
            {status === 'draft' && isOwner && (
              <button className="btn btn-primary" onClick={() => setSubmitConfirmOpen(true)}>ส่งคำขอ</button>
            )}
            {status === 'pending' && isAdmin && allReviewed && (
              <>
                <button className="btn btn-success" onClick={() => setApproveConfirmOpen(true)}>อนุมัติการบริจาค</button>
                <button className="btn btn-danger" onClick={() => setRejectOpen(true)}>ปฏิเสธทั้งหมด</button>
              </>
            )}
            {status === 'approved' && isOwner && (
              <button className="btn btn-primary" onClick={() => setDonateOpen(true)}>นำของมามอบ</button>
            )}
            {status === 'donated' && isAdmin && (
              <button className="btn btn-success" onClick={() => setCompleteConfirmOpen(true)}>ยืนยันรับบริจาค</button>
            )}
          </div>
        )}
      </div>

      {actionError && <div className="alert alert-error" id="action-error">{actionError}</div>}

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">ข้อมูลการบริจาค</div>
        <div className="req-info-grid">
          <div className="info-row">
            <span className="info-label">โครงการ</span>
            <span>{donation.project_name || donation.project_id || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">วันบริจาค</span>
            <span>{formatDate(donation.donation_date)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">ผู้บริจาค</span>
            <span>{donation.user_name || '-'}</span>
          </div>
        </div>
        {donation.admin_note && (
          <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
            หมายเหตุจากเจ้าหน้าที่: {donation.admin_note}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">รายการสิ่งของ ({items.length} รายการ)</div>
        {items.length === 0 ? (
          <p className="empty-text">ยังไม่มีรายการสิ่งของ</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ชื่อ/ของที่เสนอ</th>
                  <th>ประเภท</th>
                  <th style={{ textAlign: 'center' }}>จำนวนขอ</th>
                  <th style={{ textAlign: 'center' }}>จำนวนอนุมัติ</th>
                  <th>สถานะรายการ</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>{item.proposed_name || item.item_name || item.item_id || '-'}</td>
                    <td>{item.proposed_category_code || item.category_code || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{item.quantity ?? '-'}</td>
                    <td style={{ textAlign: 'center' }}>{item.quantity_approved != null ? item.quantity_approved : '-'}</td>
                    <td>
                      <ItemStatusBadge status={item.status || 'pending'} />
                      {isAdmin && status === 'pending' && item.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginTop: '.3rem', flexWrap: 'wrap' }}>
                          <input
                            type="number"
                            className="form-input"
                            min={1}
                            value={itemQtys[item.id] ?? item.quantity}
                            onChange={e => setItemQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                            style={{ width: 110 }}
                            placeholder="จำนวนที่อนุมัติ"
                          />
                          <button
                            className="btn btn-success btn-sm"
                            disabled={!!itemLoading[item.id]}
                            onClick={() => handleItemApprove(item)}
                          >
                            อนุมัติ
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={!!itemLoading[item.id]}
                            onClick={() => setRejectItemId(item.id)}
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {donation.photo_r2_key && (status === 'donated' || status === 'completed') && (
        <div className="card" style={{ marginTop: '1.25rem' }}>
          <div className="card-title">รูปถ่ายการบริจาค</div>
          <img
            src={photoUrl(donation.photo_r2_key)}
            alt="รูปถ่ายการบริจาค"
            className="return-photo"
            style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 6, border: '1px solid var(--border)', marginTop: '.5rem' }}
          />
        </div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={submitConfirmOpen}
        onClose={() => setSubmitConfirmOpen(false)}
        title="ยืนยันการส่งคำขอ"
        message="ยืนยันการส่งคำขอบริจาค?"
        confirmLabel="ส่งคำขอ"
        onConfirm={handleSubmit}
      />

      <ConfirmModal
        isOpen={approveConfirmOpen}
        onClose={() => setApproveConfirmOpen(false)}
        title="ยืนยันการอนุมัติ"
        message="ยืนยันการอนุมัติการบริจาค?"
        confirmLabel="อนุมัติ"
        onConfirm={handleApproveDonation}
      />

      <RejectDonationModal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onReject={handleRejectDonation}
      />

      <DonateModal
        isOpen={donateOpen}
        onClose={() => setDonateOpen(false)}
        onDonate={handleDonate}
      />

      <ConfirmModal
        isOpen={completeConfirmOpen}
        onClose={() => setCompleteConfirmOpen(false)}
        title="ยืนยันการรับบริจาค"
        message="ยืนยันการรับบริจาคและทำเครื่องหมายเสร็จสิ้น?"
        confirmLabel="ยืนยันรับบริจาค"
        onConfirm={handleComplete}
      />

      <ConfirmModal
        isOpen={rejectItemId !== null}
        onClose={() => setRejectItemId(null)}
        title="ปฏิเสธรายการ"
        message="ยืนยันการปฏิเสธรายการนี้?"
        confirmLabel="ปฏิเสธ"
        confirmClass="btn-danger"
        onConfirm={() => { const iid = rejectItemId; setRejectItemId(null); handleItemReject(iid); }}
      />
    </div>
  );
}
