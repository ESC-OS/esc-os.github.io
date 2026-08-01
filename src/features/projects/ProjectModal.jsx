import { useState, useEffect } from 'react';
import Modal from '../../shared/Modal';
import DatePicker from '../../shared/DatePicker';
import CustomSelect from '../../shared/CustomSelect';
import { getProject, createProject, updateProject } from '../../api/api';
import { showError } from '../../shared/ErrorToast';

const ORG_TYPES = [
  'ESC: พัฒนาองค์กร', 'ESC: การเงิน', 'ESC: เลขานุการ', 'ESC: เทคโนโลยี',
  'ESC: ประชาสัมพันธ์และการตลาด', 'ESC: วิชาการ', 'ESC: กิจการภายใน',
  'ESC: กิจการภายนอก', 'ESC: นิสิตสัมพันธ์', 'ESC: CSR', 'ESC: Sustain',
  'ESC: OS', 'ชมรม', 'โครงการ', 'ภาค', 'Group',
];

const ORG_OPTIONS = [
  { value: '', label: '-- เลือกประเภทโครงการ --' },
  ...ORG_TYPES.map(t => ({ value: t, label: t })),
];

// Props: isOpen, onClose, editId (optional), onSuccess
export default function ProjectModal({ isOpen, onClose, editId, onSuccess }) {
  const [loading, setLoading]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [name, setName]           = useState('');
  const [orgType, setOrgType]     = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');

  // Load existing project when editing
  useEffect(() => {
    if (!isOpen) return;
    if (!editId) {
      setName(''); setOrgType(''); setDescription('');
      setStartDate(''); setEndDate(''); setError('');
      return;
    }
    setLoading(true);
    setError('');
    getProject(editId)
      .then(res => {
        const p = res?.data;
        if (!p) throw new Error('ไม่พบข้อมูลโครงการ');
        setName(p.name ?? '');
        setOrgType(p.org_type || p.organization_type || '');
        setDescription(p.description ?? '');
        setStartDate(p.start_date ? String(p.start_date).slice(0, 10) : '');
        setEndDate(p.end_date   ? String(p.end_date).slice(0, 10)   : '');
      })
      .catch(err => { showError('โหลดข้อมูลไม่สำเร็จ: ' + err.message); onClose(); })
      .finally(() => setLoading(false));
  }, [isOpen, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!orgType) { setError('กรุณาเลือกประเภทโครงการ'); return; }
    if (endDate && startDate && endDate <= startDate) {
      setError('วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น'); return;
    }

    const data = {
      name,
      organization_type: orgType,
      description: description || undefined,
      start_date: startDate,
      end_date:   endDate,
    };

    setSubmitting(true);
    try {
      if (editId) {
        await updateProject(editId, data);
        onClose();
        onSuccess?.();
      } else {
        const res = await createProject(data);
        onClose();
        onSuccess?.(res?.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const title = editId ? 'แก้ไขโครงการ' : 'สร้างโครงการ';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {loading ? (
        <div className="spinner" style={{ margin: '2rem auto' }} />
      ) : (
        <form className="form" style={{ padding: 0 }} onSubmit={handleSubmit}>
          {error && <div className="alert alert-error" style={{ marginBottom: '.5rem' }}>{error}</div>}

          <div className="form-group">
            <label className="form-label">ชื่อโครงการ <span className="form-required">*</span></label>
            <input
              className="form-input"
              type="text"
              required
              autoComplete="off"
              placeholder="ชื่อโครงการ"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">ประเภทโครงการ <span className="form-required">*</span></label>
            <CustomSelect
              value={orgType}
              onChange={setOrgType}
              options={ORG_OPTIONS}
              placeholder="-- เลือกประเภทโครงการ --"
            />
          </div>

          <div className="form-group">
            <label className="form-label">คำอธิบาย</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="รายละเอียดโครงการ (ไม่บังคับ)"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">วันเริ่มต้น <span className="form-required">*</span></label>
              <DatePicker value={startDate} onChange={setStartDate} placeholder="เลือกวันเริ่มต้น" />
            </div>
            <div className="form-group">
              <label className="form-label">วันสิ้นสุด <span className="form-required">*</span></label>
              <DatePicker value={endDate} onChange={setEndDate} placeholder="เลือกวันสิ้นสุด" />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'กำลังบันทึก…' : editId ? 'บันทึกการแก้ไข' : 'สร้างโครงการ'}
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
