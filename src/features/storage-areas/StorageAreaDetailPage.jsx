import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getStorageArea, submitStorageArea, approveStorageArea,
  rejectStorageArea, checkoutStorageArea, uploadPhoto, photoUrl,
} from '../../api/api';
import { formatDate, formatCountdown } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import Modal from '../../shared/Modal';
import ConfirmModal from '../../shared/ConfirmModal';

function daysBetween(start, end) {
  if (!start || !end) return '-';
  const diff = Math.round((new Date(end) - new Date(start)) / 864e5);
  return diff > 0 ? diff : '-';
}

function RejectModal({ isOpen, onClose, onReject }) {
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
    <Modal isOpen={isOpen} onClose={onClose} title="ปฏิเสธคำขอพื้นที่จัดเก็บ">
      {error && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{error}</div>}
      <div className="form">
        <div className="form-group">
          <label className="form-label" htmlFor="reject-note">
            เหตุผลการปฏิเสธ <span className="form-required">*</span>
          </label>
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
            {submitting ? 'กำลังดำเนินการ...' : 'ปฏิเสธคำขอ'}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>ยกเลิก</button>
        </div>
      </div>
    </Modal>
  );
}

function CheckoutModal({ isOpen, onClose, onCheckout }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) { setFile(null); setError(''); }
  }, [isOpen]);

  async function handleConfirm() {
    setError('');
    if (!file) { setError('กรุณาเลือกรูปถ่าย'); return; }
    setUploading(true);
    try {
      const r2Key = await uploadPhoto(file);
      await onCheckout(r2Key);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="คืนพื้นที่จัดเก็บ">
      {error && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{error}</div>}
      <div className="form">
        <div className="form-group">
          <label className="form-label" htmlFor="checkout-photo">
            รูปถ่ายยืนยันการเก็บของออกและทำความสะอาด <span className="form-required">*</span>
          </label>
          <input type="file" accept="image/*" className="form-input" id="checkout-photo" onChange={e => setFile(e.target.files[0] || null)} />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleConfirm} disabled={uploading}>
            {uploading ? 'กำลังอัปโหลด...' : 'ยืนยันคืนพื้นที่'}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>ยกเลิก</button>
        </div>
      </div>
    </Modal>
  );
}

export default function StorageAreaDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [area, setArea] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setActionError('');
    try {
      const res = await getStorageArea(id);
      setArea(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!area) return null;

  const isAdmin = user?.role === 'admin' || user?.role === 'staff';
  const isOwner = user?.id === area.user_id;
  const status = area.status;

  async function handleSubmit() {
    setActionError('');
    try {
      await submitStorageArea(id);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleApprove() {
    setActionError('');
    try {
      await approveStorageArea(id, {});
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleReject(note) {
    await rejectStorageArea(id, { admin_note: note });
    await load();
  }

  async function handleCheckout(r2Key) {
    await checkoutStorageArea(id, { photo_r2_key: r2Key });
    await load();
  }

  return (
    <div>
      <Link to="/storage-areas" className="back-btn">← พื้นที่จัดเก็บ</Link>

      <div className="req-header">
        <div className="req-title-row">
          <h1 className="page-title" style={{ margin: 0 }}>#{id}</h1>
          <StatusBadge status={status} />
        </div>
        <div className="page-title" style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-muted)' }}>
          {area.project_name || area.project_id || '-'}
        </div>
        <div className="actions-bar" id="actions-bar">
          {status === 'draft' && isOwner && (
            <button className="btn btn-primary" onClick={() => setSubmitConfirmOpen(true)}>ส่งคำขอ</button>
          )}
          {status === 'pending' && isAdmin && (
            <>
              <button className="btn btn-success" onClick={() => setApproveConfirmOpen(true)}>อนุมัติ</button>
              <button className="btn btn-danger" onClick={() => setRejectOpen(true)}>ปฏิเสธ</button>
            </>
          )}
          {status === 'in_use' && isOwner && (
            <button className="btn btn-primary" onClick={() => setCheckoutOpen(true)}>คืนพื้นที่</button>
          )}
        </div>
      </div>

      {actionError && <div className="alert alert-error" id="action-error">{actionError}</div>}

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">ข้อมูลพื้นที่จัดเก็บ</div>
        <div className="req-info-grid">
          <div className="info-row">
            <span className="info-label">โครงการ</span>
            <span>{area.project_name || area.project_id || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">วันเริ่มต้น</span>
            <span>{formatDate(area.start_date)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">วันสิ้นสุด</span>
            <span>{formatDate(area.end_date)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">จำนวนวัน</span>
            <span>{daysBetween(area.start_date, area.end_date)} วัน</span>
          </div>
          <div className="info-row">
            <span className="info-label">ผู้ขอ</span>
            <span>{area.user_name || '-'}</span>
          </div>
          {status === 'in_use' && area.end_date && (
            <div className="info-row">
              <span className="info-label">เวลาที่เหลือ</span>
              <span><span className="countdown">{formatCountdown(area.end_date)}</span></span>
            </div>
          )}
        </div>

        {area.admin_note && (
          <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
            หมายเหตุจากเจ้าหน้าที่: {area.admin_note}
          </div>
        )}
        {status === 'approved' && (
          <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
            ระบบจะเปิดใช้งานอัตโนมัติเมื่อถึงวันเริ่มต้น
          </div>
        )}
      </div>

      {area.checkout_photo_r2_key && (
        <div className="card" style={{ marginTop: '1.25rem' }}>
          <div className="card-title">รูปภาพหลักฐานการคืนพื้นที่</div>
          <img
            src={photoUrl(area.checkout_photo_r2_key)}
            alt="รูปถ่ายการคืนพื้นที่"
            className="return-photo"
            style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 6, border: '1px solid var(--border)', marginTop: '.5rem' }}
          />
        </div>
      )}

      <ConfirmModal
        isOpen={submitConfirmOpen}
        onClose={() => setSubmitConfirmOpen(false)}
        title="ยืนยันการส่งคำขอ"
        message="ยืนยันการส่งคำขอพื้นที่จัดเก็บ?"
        confirmLabel="ส่งคำขอ"
        onConfirm={handleSubmit}
      />

      <ConfirmModal
        isOpen={approveConfirmOpen}
        onClose={() => setApproveConfirmOpen(false)}
        title="ยืนยันการอนุมัติ"
        message="ยืนยันการอนุมัติคำขอนี้?"
        confirmLabel="อนุมัติ"
        onConfirm={handleApprove}
      />

      <RejectModal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onReject={handleReject}
      />

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onCheckout={handleCheckout}
      />
    </div>
  );
}
