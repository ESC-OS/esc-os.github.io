import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStorageAreas, getProjects, createStorageArea, updateStorageArea, submitStorageArea } from '../../api/api';
import { formatDate } from '../../shared/utils/format';
import Spinner from '../../shared/Spinner';
import StatusBadge from '../../shared/StatusBadge';
import Modal from '../../shared/Modal';

const STATUS_OPTS = [
  ['', 'ทุกสถานะ'],
  ['draft', 'ร่าง'],
  ['pending', 'รอดำเนินการ'],
  ['approved', 'อนุมัติแล้ว'],
  ['in_use', 'กำลังใช้งาน'],
  ['completed', 'เสร็จสิ้น'],
  ['rejected', 'ถูกปฏิเสธ'],
];

function calcDays(start, end) {
  if (!start || !end) return null;
  return Math.round((new Date(end) - new Date(start)) / 864e5);
}

function RequestModal({ isOpen, onClose, projects, preProjectId, onSuccess }) {
  const [selProject, setSelProject] = useState(preProjectId || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelProject(preProjectId || '');
      setStartDate('');
      setEndDate('');
      setError('');
    }
  }, [isOpen, preProjectId]);

  const days = calcDays(startDate, endDate);
  let durationNote = '';
  let durationColor = 'var(--text-muted)';
  if (startDate && endDate) {
    if (days <= 0) { durationNote = 'วันสิ้นสุดต้องหลังวันเริ่มต้น'; durationColor = 'var(--danger)'; }
    else if (days > 30) { durationNote = `${days} วัน — เกินขีดสูงสุด 30 วัน`; durationColor = 'var(--danger)'; }
    else { durationNote = `${days} วัน (สูงสุด 30 วัน)`; }
  }

  async function handleSubmit() {
    setError('');
    if (!selProject) { setError('กรุณาเลือกโครงการ'); return; }
    if (!startDate || !endDate) { setError('กรุณาระบุวันเริ่มต้นและวันสิ้นสุด'); return; }
    const d = calcDays(startDate, endDate);
    if (d <= 0) { setError('วันสิ้นสุดต้องหลังวันเริ่มต้น'); return; }
    if (d > 30) { setError('ระยะเวลาสูงสุด 30 วัน'); return; }

    setSubmitting(true);
    try {
      const createRes = await createStorageArea(selProject);
      const newId = createRes.data.id;
      await updateStorageArea(newId, { start_date: startDate, end_date: endDate });
      await submitStorageArea(newId);
      onClose();
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ขอพื้นที่จัดเก็บ">
      {error && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{error}</div>}
      <div className="form">
        <div className="form-group">
          <label className="form-label" htmlFor="m-project">โครงการ <span className="form-required">*</span></label>
          <select className="form-select" id="m-project" value={selProject} onChange={e => setSelProject(e.target.value)}>
            <option value="">-- เลือกโครงการ --</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="m-start">วันเริ่มใช้งาน <span className="form-required">*</span></label>
            <input type="date" className="form-input" id="m-start" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="m-end">วันสิ้นสุด <span className="form-required">*</span></label>
            <input type="date" className="form-input" id="m-end" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <div className="form-hint" style={{ color: durationColor, minHeight: '1.2em' }}>{durationNote}</div>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>ยกเลิก</button>
        </div>
      </div>
    </Modal>
  );
}

export default function StorageAreasPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preProjectId = searchParams.get('project_id') || '';

  const [areas, setAreas] = useState([]);
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const loadAreas = useCallback(async (s) => {
    setLoading(true);
    setError('');
    try {
      const res = await getStorageAreas(s || undefined);
      setAreas(res?.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [areasRes, projRes] = await Promise.all([
          getStorageAreas({ limit: 100 }),
          getProjects({ limit: 100 }),
        ]);
        setAreas(areasRes?.data ?? []);
        setProjects(projRes?.data ?? []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Auto-open modal if project_id in URL
  useEffect(() => {
    if (preProjectId && projects.length > 0) setModalOpen(true);
  }, [preProjectId, projects.length]);

  function handleStatusChange(e) {
    const s = e.target.value;
    setStatus(s);
    loadAreas(s);
  }

  function handleSuccess() {
    loadAreas(status);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">พื้นที่จัดเก็บ</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ ขอพื้นที่</button>
        </div>
      </div>

      <div className="filter-row">
        <select className="filter-select" value={status} onChange={handleStatusChange}>
          {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : areas.length === 0 ? (
        <p className="empty-text">ไม่มีคำขอพื้นที่จัดเก็บ</p>
      ) : (
        <div className="svc-list">
          {areas.map(a => (
            <div key={a.id} className="svc-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/storage-areas/${a.id}`)}>
              <span className="svc-row-id">#{a.id}</span>
              <span className="svc-row-name">{a.project_name || a.project_id || '-'}</span>
              <span className="svc-row-meta">{formatDate(a.start_date)} – {formatDate(a.end_date)}</span>
              <StatusBadge status={a.status} />
              <span className="svc-row-arrow">›</span>
            </div>
          ))}
        </div>
      )}

      <RequestModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        projects={projects}
        preProjectId={preProjectId}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
