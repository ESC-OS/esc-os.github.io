import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getDeposit, submitDeposit, approveDeposit, rejectDeposit,
  depositItems, completeDeposit, uploadPhoto, photoUrl,
} from '../../api/api';
import { formatDate, formatCountdown } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import Modal from '../../shared/Modal';
import ConfirmModal from '../../shared/ConfirmModal';
import { showError } from '../../shared/ErrorToast';

function PhotoUploadModal({ isOpen, onClose, title, label, onUpload }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) { setFile(null); setError(''); }
  }, [isOpen]);

  async function handleConfirm() {
    setError('');
    if (!file) { setError('กรุณาเลือกรูปภาพ'); return; }
    setUploading(true);
    try {
      const r2Key = await uploadPhoto(file);
      await onUpload(r2Key);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="form-group">
        <label className="form-label">{label}</label>
        <input type="file" accept="image/*" className="form-input" onChange={e => setFile(e.target.files[0] || null)} />
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" onClick={handleConfirm} disabled={uploading}>
          {uploading ? 'กำลังอัปโหลด…' : 'ยืนยัน'}
        </button>
        <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>ยกเลิก</button>
      </div>
    </Modal>
  );
}

function ApproveModal({ isOpen, onClose, onApprove }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) { setNote(''); setError(''); }
  }, [isOpen]);

  async function handleConfirm() {
    setError('');
    setSubmitting(true);
    try {
      await onApprove(note.trim());
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="อนุมัติคำขอฝากของ">
      <div className="form-group">
        <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
        <textarea
          className="form-textarea"
          placeholder="หมายเหตุเพิ่มเติม…"
          style={{ minHeight: 70 }}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-success" onClick={handleConfirm} disabled={submitting}>
          {submitting ? 'กำลังดำเนินการ…' : 'ยืนยันการอนุมัติ'}
        </button>
        <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>ยกเลิก</button>
      </div>
    </Modal>
  );
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
    if (!note.trim()) { setError('กรุณาระบุเหตุผลการปฏิเสธ'); return; }
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
    <Modal isOpen={isOpen} onClose={onClose} title="ปฏิเสธคำขอฝากของ">
      <div className="form-group">
        <label className="form-label">เหตุผลการปฏิเสธ <span className="form-required">*</span></label>
        <textarea
          className="form-textarea"
          placeholder="ระบุเหตุผล…"
          style={{ minHeight: 80 }}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-danger" onClick={handleConfirm} disabled={submitting}>
          {submitting ? 'กำลังดำเนินการ…' : 'ยืนยันการปฏิเสธ'}
        </button>
        <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>ยกเลิก</button>
      </div>
    </Modal>
  );
}

export default function DepositDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [deposit, setDeposit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [depositPhotoOpen, setDepositPhotoOpen] = useState(false);
  const [completePhotoOpen, setCompletePhotoOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setActionError('');
    try {
      const res = await getDeposit(id);
      setDeposit(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!deposit) return null;

  const isAdmin = user?.role === 'admin' || user?.role === 'staff';
  const isOwner = user?.id === deposit.user_id;
  const status = deposit.status;
  const items = deposit.items ?? [];

  const countdownHtml = status === 'deposited' && deposit.withdraw_date
    ? ` (${formatCountdown(deposit.withdraw_date)})`
    : '';

  async function handleSubmit() {
    setActionError('');
    try {
      await submitDeposit(id);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleApprove(note) {
    await approveDeposit(id, note ? { admin_note: note } : {});
    await load();
  }

  async function handleReject(note) {
    await rejectDeposit(id, { admin_note: note });
    await load();
  }

  async function handleDepositPhoto(r2Key) {
    await depositItems(id, { photo_r2_key: r2Key });
    await load();
  }

  async function handleCompletePhoto(r2Key) {
    await completeDeposit(id, { photo_r2_key: r2Key });
    await load();
  }

  return (
    <div>
      <Link to="/deposits" className="back-btn">← ฝากชั่วคราว</Link>

      <div className="page-header">
        <h1 className="page-title">
          #{id} <StatusBadge status={status} />
        </h1>
        <div style={{ color: 'var(--text-muted)' }}>{deposit.project_name || deposit.project_id || '-'}</div>
      </div>

      {deposit.admin_note && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          <strong>หมายเหตุจากเจ้าหน้าที่:</strong> {deposit.admin_note}
        </div>
      )}

      {actionError && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{actionError}</div>}

      <div className="card">
        <div className="card-title">ข้อมูลการฝาก</div>
        <div className="req-info-grid">
          <div className="info-row">
            <span className="info-label">โครงการ</span>
            <span>{deposit.project_name || deposit.project_id || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">วันฝาก</span>
            <span>{formatDate(deposit.deposit_date)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">วันรับคืน</span>
            <span>
              {formatDate(deposit.withdraw_date)}
              {countdownHtml && <span style={{ color: 'var(--primary)', fontSize: '.9rem', marginLeft: '.5rem' }}>{countdownHtml}</span>}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">ผู้ฝาก</span>
            <span>{deposit.user_name || '-'}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">รายการสิ่งของ ({items.length} รายการ)</div>
        {items.length === 0 ? (
          <p className="empty-text">ยังไม่มีรายการสิ่งของ</p>
        ) : (
          <div className="req-items-table">
            <table>
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th style={{ textAlign: 'center' }}>จำนวน</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td style={{ textAlign: 'center' }}>{item.quantity ?? 1}</td>
                    <td>{item.note || item.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo evidence */}
      {((status === 'deposited' || status === 'completed') && deposit.deposit_photo_r2_key) ||
        (status === 'completed' && deposit.withdrawal_photo_r2_key) ? (
        <div className="card">
          <div className="card-title">รูปภาพหลักฐาน</div>
          {(status === 'deposited' || status === 'completed') && deposit.deposit_photo_r2_key && (
            <div style={{ marginBottom: '1rem' }}>
              <div className="info-label" style={{ marginBottom: '.4rem' }}>รูปภาพการฝากของ</div>
              <img src={photoUrl(deposit.deposit_photo_r2_key)} alt="รูปภาพการฝากของ" className="return-photo" />
            </div>
          )}
          {status === 'completed' && deposit.withdrawal_photo_r2_key && (
            <div>
              <div className="info-label" style={{ marginBottom: '.4rem' }}>รูปภาพการรับของคืน</div>
              <img src={photoUrl(deposit.withdrawal_photo_r2_key)} alt="รูปภาพการรับของคืน" className="return-photo" />
            </div>
          )}
        </div>
      ) : null}

      {/* Actions */}
      {status === 'draft' && isOwner && (
        <div className="card">
          <div className="card-title">การดำเนินการ</div>
          <div className="actions-bar">
            <button className="btn btn-primary" onClick={() => setSubmitConfirmOpen(true)}>ส่งคำขอ</button>
            <button className="btn btn-danger" onClick={() => showError('ไม่สามารถลบคำขอร่างได้ในขณะนี้')}>ยกเลิก</button>
          </div>
        </div>
      )}

      {status === 'pending' && isAdmin && (
        <div className="card">
          <div className="card-title">การดำเนินการ (เจ้าหน้าที่)</div>
          <div className="actions-bar">
            <button className="btn btn-success" onClick={() => setApproveOpen(true)}>อนุมัติ</button>
            <button className="btn btn-danger" onClick={() => setRejectOpen(true)}>ปฏิเสธ</button>
          </div>
        </div>
      )}

      {status === 'approved' && isOwner && (
        <div className="card">
          <div className="card-title">การดำเนินการ</div>
          <div className="actions-bar">
            <button className="btn btn-primary" onClick={() => setDepositPhotoOpen(true)}>นำของมาฝาก</button>
          </div>
        </div>
      )}

      {status === 'deposited' && isOwner && (
        <div className="card">
          <div className="card-title">การดำเนินการ</div>
          <div className="actions-bar">
            <button className="btn btn-primary" onClick={() => setCompletePhotoOpen(true)}>รับของคืน</button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={submitConfirmOpen}
        onClose={() => setSubmitConfirmOpen(false)}
        title="ยืนยันการส่งคำขอฝากของ"
        message="ยืนยันการส่งคำขอฝากของ?"
        confirmLabel="ส่งคำขอ"
        onConfirm={handleSubmit}
      />

      <ApproveModal
        isOpen={approveOpen}
        onClose={() => setApproveOpen(false)}
        onApprove={handleApprove}
      />

      <RejectModal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onReject={handleReject}
      />

      <PhotoUploadModal
        isOpen={depositPhotoOpen}
        onClose={() => setDepositPhotoOpen(false)}
        title="อัปโหลดรูปภาพ"
        label="รูปภาพการนำของมาฝาก"
        onUpload={handleDepositPhoto}
      />

      <PhotoUploadModal
        isOpen={completePhotoOpen}
        onClose={() => setCompletePhotoOpen(false)}
        title="อัปโหลดรูปภาพ"
        label="รูปภาพการรับของคืน"
        onUpload={handleCompletePhoto}
      />
    </div>
  );
}
