import { useState } from 'react';
import { broadcast } from '../../../api/api';
import Modal from '../../../shared/Modal';

export default function AdminBroadcastPage() {
  const [title, setTitle] = useState('');
  const [body,  setBody]  = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  function handleSendClick() {
    setError(''); setResult('');
    if (!title.trim()) { setError('กรุณาระบุหัวข้อ'); return; }
    if (!body.trim())  { setError('กรุณาระบุเนื้อหา'); return; }
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    setSending(true);
    try {
      await broadcast({ title: title.trim(), body: body.trim() });
      setConfirmOpen(false);
      setTitle(''); setBody('');
      setResult('ส่งการแจ้งเตือนเรียบร้อยแล้ว — ผู้ใช้ทุกคนจะได้รับข้อความนี้');
    } catch (err) {
      setConfirmOpen(false);
      setError(err.message);
    } finally { setSending(false); }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">ส่งการแจ้งเตือน</h1>
      </div>

      <div className="admin-grid">
        {/* Form */}
        <div className="card">
          <div className="card-title">ฟอร์ม</div>

          {result && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{result}</div>}
          {error  && <div className="alert alert-error"   style={{ marginBottom: '1rem' }}>{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="bc-title">
              หัวข้อ <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              id="bc-title"
              placeholder="หัวข้อการแจ้งเตือน"
              autoComplete="off"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="bc-body">
              เนื้อหา <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <textarea
              className="form-textarea"
              id="bc-body"
              placeholder="เนื้อหาที่ต้องการส่ง…"
              style={{ minHeight: 140 }}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleSendClick}>ส่งถึงผู้ใช้ทั้งหมด</button>
          </div>
        </div>

        {/* Preview */}
        <div className="card">
          <div className="card-title">ตัวอย่างการแจ้งเตือน</div>
          <div className="notif-item unread" style={{ borderRadius: 8, padding: '1rem' }}>
            <div className="notif-title" style={{ fontWeight: 600, marginBottom: '.35rem', color: 'var(--text)' }}>
              {title.trim() || '(หัวข้อ)'}
            </div>
            <div className="notif-body" style={{ fontSize: '.9rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
              {body.trim() || '(เนื้อหา)'}
            </div>
            <div className="notif-date" style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '.5rem' }}>
              เพิ่งส่ง
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="ยืนยันการส่งการแจ้งเตือน">
        <p style={{ marginBottom: '1.25rem', color: 'var(--text-muted)' }}>
          ระบบจะส่งการแจ้งเตือนนี้ไปยังผู้ใช้ทุกคน ยืนยันหรือไม่?
        </p>
        <div className="notif-item unread" style={{ borderRadius: 8, padding: '.75rem', marginBottom: '1.25rem' }}>
          <div className="notif-title" style={{ fontWeight: 600, marginBottom: '.25rem' }}>{title}</div>
          <div className="notif-body" style={{ fontSize: '.88rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{body}</div>
        </div>
        <div className="form-actions" style={{ display: 'flex', gap: '.75rem' }}>
          <button className="btn btn-primary" disabled={sending} onClick={handleConfirm}>
            {sending ? 'กำลังส่ง…' : 'ยืนยัน'}
          </button>
          <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>ยกเลิก</button>
        </div>
      </Modal>
    </>
  );
}
