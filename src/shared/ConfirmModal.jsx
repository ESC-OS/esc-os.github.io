import Modal from './Modal';

export default function ConfirmModal({
  isOpen, onClose, message, onConfirm,
  title = 'ยืนยัน',
  confirmLabel = 'ยืนยัน',
  confirmClass = 'btn-primary',
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p style={{ margin: '0 0 1.25rem', fontSize: '.95rem', lineHeight: 1.6 }}>{message}</p>
      <div className="form-actions">
        <button className={`btn ${confirmClass}`} onClick={() => { onClose(); onConfirm(); }}>{confirmLabel}</button>
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
      </div>
    </Modal>
  );
}
