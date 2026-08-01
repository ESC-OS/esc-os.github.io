import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../shared/Modal';
import { getProjects, createRequest } from '../../api/api';
import { showError } from '../../shared/ErrorToast';

// Props: isOpen, onClose, projectId (optional)
// On submit: calls createRequest({ name, project_id }) → navigate to /requests/:id
export default function RequestModal({ isOpen, onClose, projectId }) {
  const navigate = useNavigate();

  const [projects, setProjects]   = useState([]);
  const [loadingProjs, setLoadingProjs] = useState(false);

  const [name, setName]           = useState('');
  const [selectedProj, setSelectedProj] = useState(projectId || '');
  const [error, setError]         = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load projects when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setName(''); setError('');
    setSelectedProj(projectId || '');
    setLoadingProjs(true);
    getProjects()
      .then(r => setProjects(r?.data ?? []))
      .catch(err => { showError('โหลดข้อมูลไม่สำเร็จ: ' + err.message); onClose(); })
      .finally(() => setLoadingProjs(false));
  }, [isOpen, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProjData = projects.find(p => p.id === selectedProj);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) { setError('กรุณาระบุชื่อคำขอ'); return; }
    if (!selectedProj) { setError('กรุณาเลือกโครงการ'); return; }

    setSubmitting(true);
    try {
      const res = await createRequest({ name: trimmedName, project_id: selectedProj });
      const reqId = res?.data?.id;
      if (!reqId) throw new Error('ไม่ได้รับ ID คำขอจากเซิร์ฟเวอร์');
      onClose();
      navigate(`/requests/${reqId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="สร้างคำขอยืม">
      {loadingProjs ? (
        <div className="spinner" style={{ margin: '2rem auto' }} />
      ) : (
        <form className="form" style={{ padding: 0 }} onSubmit={handleSubmit}>
          {error && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{error}</div>}

          <div className="form-group">
            <label className="form-label">ชื่อคำขอ <span className="form-required">*</span></label>
            <input
              className="form-input"
              type="text"
              required
              autoComplete="off"
              placeholder="เช่น คำขอยืมอุปกรณ์ถ่ายภาพ"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">โครงการ <span className="form-required">*</span></label>
            <select
              className="form-select"
              value={selectedProj}
              onChange={e => setSelectedProj(e.target.value)}
              required
            >
              <option value="">-- เลือกโครงการ --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedProjData?.start_date && (
              <span className="form-hint">
                ช่วงโครงการ: {selectedProjData.start_date} → {selectedProjData.end_date}
              </span>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'กำลังสร้าง…' : 'สร้างคำขอ'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
