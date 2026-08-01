import { useState, useEffect, useCallback } from 'react';
import { getVisits, confirmVisit, rejectVisit, completeVisit, cancelVisit } from '../../../api/api';
import { formatDate } from '../../../shared/utils/format';
import { showError } from '../../../shared/ErrorToast';
import Spinner from '../../../shared/Spinner';
import StatusBadge from '../../../shared/StatusBadge';
import Modal from '../../../shared/Modal';
import ConfirmModal from '../../../shared/ConfirmModal';

const STATUS_OPTS = [
  ['pending',   'รอยืนยัน'],
  ['confirmed', 'ยืนยันแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['cancelled', 'ยกเลิกแล้ว'],
  ['rejected',  'ถูกปฏิเสธ'],
  ['',          'ทุกสถานะ'],
];

export default function AdminVisitsPage() {
  const [currentStatus, setCurrentStatus] = useState('pending');
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Modals
  const [noteModal, setNoteModal] = useState({ open: false, id: null, action: null, title: '', confirmLabel: '', confirmClass: '' });
  const [confirm, setConfirm] = useState({ open: false, message: '', onConfirm: null, title: 'ยืนยัน', confirmLabel: 'ยืนยัน', confirmClass: 'btn-primary' });

  const loadList = useCallback(async (status) => {
    setLoading(true);
    setActionError('');
    try {
      const params = { limit: 100 };
      if (status) params.status = status;
      const res = await getVisits(params);
      setVisits(res?.data ?? []);
    } catch (err) {
      showError(err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(currentStatus); }, [currentStatus, loadList]);

  async function handleNoteSubmit(note) {
    const { id, action } = noteModal;
    if (action === 'confirm') await confirmVisit(id, note ? { admin_note: note } : {});
    else if (action === 'reject') await rejectVisit(id, note ? { admin_note: note } : {});
    await loadList(currentStatus);
  }

  function handleComplete(id) {
    setConfirm({
      open: true,
      message: 'ยืนยันว่านัดชมเสร็จสิ้น?',
      confirmLabel: 'เสร็จสิ้น',
      confirmClass: 'btn-primary',
      title: 'ยืนยัน',
      onConfirm: async () => {
        try {
          await completeVisit(id);
          await loadList(currentStatus);
        } catch (err) { setActionError(err.message); }
      },
    });
  }

  function handleCancel(id) {
    setConfirm({
      open: true,
      message: 'ยกเลิกนัดชมนี้?',
      confirmLabel: 'ยกเลิก',
      confirmClass: 'btn-danger',
      title: 'ยืนยันการยกเลิก',
      onConfirm: async () => {
        try {
          await cancelVisit(id, {});
          await loadList(currentStatus);
        } catch (err) { setActionError(err.message); }
      },
    });
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">จัดการนัดชม</h1>
        <div className="filter-row">
          <select
            className="filter-select"
            value={currentStatus}
            onChange={e => setCurrentStatus(e.target.value)}
          >
            {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {actionError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{actionError}</div>}

      {loading ? <Spinner /> : visits.length === 0 ? (
        <p className="empty-text">ไม่มีนัดชม</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>โครงการ</th>
                <th>วันที่</th>
                <th>เวลา</th>
                <th>จำนวนคน</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {visits.map(v => (
                <tr key={v.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{v.project_name || '-'}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{v.user_name || ''}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(v.visit_date)}</td>
                  <td>{v.visit_time ? v.visit_time.slice(0, 5) : '-'}</td>
                  <td style={{ textAlign: 'center' }}>{v.num_people ?? 1}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                      {v.status === 'pending' && <>
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => setNoteModal({ open: true, id: v.id, action: 'confirm', title: 'ยืนยันนัดชม', confirmLabel: 'ยืนยัน', confirmClass: 'btn-success' })}
                        >ยืนยัน</button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => setNoteModal({ open: true, id: v.id, action: 'reject', title: 'ปฏิเสธนัดชม', confirmLabel: 'ปฏิเสธ', confirmClass: 'btn-danger' })}
                        >ปฏิเสธ</button>
                      </>}
                      {v.status === 'confirmed' && <>
                        <button className="btn btn-sm btn-primary" onClick={() => handleComplete(v.id)}>เสร็จสิ้น</button>
                        <button className="btn btn-sm btn-danger"  onClick={() => handleCancel(v.id)}>ยกเลิก</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Note modal for confirm/reject */}
      <NoteModal
        isOpen={noteModal.open}
        title={noteModal.title}
        confirmLabel={noteModal.confirmLabel}
        confirmClass={noteModal.confirmClass}
        onClose={() => setNoteModal(m => ({ ...m, open: false }))}
        onConfirm={handleNoteSubmit}
      />

      <ConfirmModal
        isOpen={confirm.open}
        onClose={() => setConfirm(c => ({ ...c, open: false }))}
        message={confirm.message}
        onConfirm={confirm.onConfirm}
        title={confirm.title}
        confirmLabel={confirm.confirmLabel}
        confirmClass={confirm.confirmClass}
      />
    </>
  );
}

function NoteModal({ isOpen, onClose, title, confirmLabel, confirmClass, onConfirm }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!isOpen) { setNote(''); setSaving(false); setError(''); } }, [isOpen]);

  async function handleOk() {
    setSaving(true); setError('');
    try {
      await onConfirm(note.trim());
      onClose();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="form-group">
        <label className="form-label">
          หมายเหตุ <span style={{ color: 'var(--text-muted)', fontSize: '.85em' }}>(ไม่บังคับ)</span>
        </label>
        <textarea
          className="form-textarea"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ minHeight: 60 }}
          placeholder="หมายเหตุถึงผู้ขอ"
        />
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: '.75rem' }}>{error}</div>}
      <div className="modal-actions" style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className={`btn ${confirmClass}`} disabled={saving} onClick={handleOk}>
          {saving ? 'กำลังบันทึก…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
