import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getVisit, confirmVisit, rejectVisit, completeVisit, cancelVisit,
} from '../../api/api';
import { formatDate, formatDateTime } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import Modal from '../../shared/Modal';
import ConfirmModal from '../../shared/ConfirmModal';

export default function VisitDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [visit, setVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Cancel modal state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Complete confirm
  const [completeOpen, setCompleteOpen] = useState(false);

  // Admin fields
  const [approveNote, setApproveNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setActionError('');
    try {
      const res = await getVisit(id);
      setVisit(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!visit) return null;

  const isAdmin = user?.role === 'admin' || user?.role === 'staff';
  const isOwner = user?.id === visit.user_id;
  const status = visit.status;

  const canUserCancel = isOwner && (status === 'pending' || status === 'confirmed');
  const canAdminApprove = isAdmin && status === 'pending';
  const canAdminReject = isAdmin && status === 'pending';
  const canAdminComplete = isAdmin && status === 'confirmed';

  async function handleApprove() {
    setActionError('');
    try {
      await confirmVisit(id, approveNote ? { admin_note: approveNote } : {});
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleReject() {
    setActionError('');
    if (!rejectNote.trim()) { setActionError('กรุณาระบุเหตุผลการปฏิเสธ'); return; }
    try {
      await rejectVisit(id, { admin_note: rejectNote.trim() });
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleCancel() {
    setActionError('');
    try {
      await cancelVisit(id, cancelReason ? { reason: cancelReason } : {});
      setCancelOpen(false);
      await load();
    } catch (err) {
      setActionError(err.message);
      setCancelOpen(false);
    }
  }

  async function handleComplete() {
    setActionError('');
    try {
      await completeVisit(id);
      setCompleteOpen(false);
      await load();
    } catch (err) {
      setActionError(err.message);
      setCompleteOpen(false);
    }
  }

  return (
    <div>
      <Link to="/visits" className="back-btn">← กลับ</Link>

      <div className="page-header" style={{ marginTop: '.75rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>รายละเอียดการเยี่ยมชม</h1>
        <div className="page-header-actions"><StatusBadge status={status} /></div>
      </div>

      {actionError && <div className="alert alert-error" style={{ marginTop: '.5rem' }}>{actionError}</div>}

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">ข้อมูลการเยี่ยมชม</div>
        <div className="req-info-grid">
          <div className="info-row">
            <span className="info-label">โครงการ</span>
            <span>{visit.project_name || visit.project_id}</span>
          </div>
          <div className="info-row">
            <span className="info-label">วันเยี่ยมชม</span>
            <span>{formatDate(visit.visit_date)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">เวลา</span>
            <span>{visit.visit_time || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">จำนวนผู้เข้าร่วม</span>
            <span>{visit.num_people ?? '-'} คน</span>
          </div>
          {visit.borrow_request_id && (
            <div className="info-row">
              <span className="info-label">คำขอยืมที่เชื่อมโยง</span>
              <span>
                <Link to={`/requests/${visit.borrow_request_id}`} style={{ color: 'var(--primary)' }}>
                  #{visit.borrow_request_id}
                </Link>
              </span>
            </div>
          )}
          <div className="info-row">
            <span className="info-label">วันที่สร้าง</span>
            <span>{formatDateTime(visit.created_at)}</span>
          </div>
        </div>

        {visit.admin_note && (
          <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
            <strong>หมายเหตุจากเจ้าหน้าที่:</strong> {visit.admin_note}
          </div>
        )}

        {status === 'rejected' && (
          <div className="alert alert-warning" style={{ marginTop: '.75rem' }}>
            การเยี่ยมชมนี้ถูกปฏิเสธ{!visit.admin_note ? ' กรุณาจองวันอื่น' : ''}
          </div>
        )}
      </div>

      {canUserCancel && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-title">การดำเนินการ</div>
          <div className="actions-bar">
            <button className="btn btn-danger" onClick={() => { setCancelReason(''); setCancelOpen(true); }}>
              ยกเลิกการเยี่ยมชม
            </button>
          </div>
        </div>
      )}

      {(canAdminApprove || canAdminComplete) && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-title">การดำเนินการ (เจ้าหน้าที่)</div>
          {canAdminApprove && (
            <>
              <div className="form-group">
                <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 60 }}
                  placeholder="หมายเหตุสำหรับการอนุมัติ"
                  value={approveNote}
                  onChange={e => setApproveNote(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">เหตุผลการปฏิเสธ (จำเป็นหากปฏิเสธ)</label>
                <input
                  className="form-input"
                  placeholder="ระบุเหตุผล…"
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                />
              </div>
              <div className="actions-bar">
                <button className="btn btn-success" onClick={handleApprove}>อนุมัติ</button>
                <button className="btn btn-danger" onClick={handleReject}>ปฏิเสธ</button>
              </div>
            </>
          )}
          {canAdminComplete && (
            <div className="actions-bar">
              <button className="btn btn-primary" onClick={() => setCompleteOpen(true)}>
                บันทึกว่าเยี่ยมชมแล้ว
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cancel modal */}
      <Modal isOpen={cancelOpen} onClose={() => setCancelOpen(false)} title="ยืนยันการยกเลิก">
        <p style={{ margin: '.25rem 0 1rem' }}>คุณต้องการยกเลิกการเยี่ยมชมนี้ใช่หรือไม่?</p>
        <div className="form-group">
          <label className="form-label">เหตุผล (ไม่บังคับ)</label>
          <input
            className="form-input"
            placeholder="ระบุเหตุผล…"
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-danger" onClick={handleCancel}>ยืนยันยกเลิก</button>
          <button className="btn btn-secondary" onClick={() => setCancelOpen(false)}>ไม่ยกเลิก</button>
        </div>
      </Modal>

      {/* Complete confirm */}
      <ConfirmModal
        isOpen={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="ยืนยันการเยี่ยมชม"
        message="บันทึกว่าผู้ใช้เยี่ยมชมเสร็จสิ้นแล้วใช่หรือไม่?"
        confirmLabel="ยืนยัน"
        onConfirm={handleComplete}
      />
    </div>
  );
}
