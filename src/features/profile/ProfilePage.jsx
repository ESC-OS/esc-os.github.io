import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMe, updateMe } from '../../api/api';
import Spinner from '../../shared/Spinner';

const DEPARTMENTS = [
  'ภาควิชาวิศวกรรมคอมพิวเตอร์',
  'ภาควิชาวิศวกรรมนิวเคลียร์',
  'ภาควิชาวิศวกรรมเคมี',
  'ภาควิชาวิศวกรรมเครื่องกล',
  'ภาควิชาวิศวกรรมไฟฟ้า',
  'ภาควิชาวิศวกรรมโยธา',
  'ภาควิชาวิศวกรรมโลหการ',
  'ภาควิชาวิศวกรรมสำรวจ',
  'ภาควิชาวิศวกรรมสิ่งแวดล้อมและความยั่งยืน',
  'ภาควิชาวิศวกรรมเหมืองแร่และปิโตรเลียม',
  'ภาควิชาวิศวกรรมแหล่งน้ำ',
  'ภาควิชาวิศวกรรมอุตสาหการ',
  'วิศวกรรมอากาศยาน',
  'วิศวกรรมนาโน',
  'วิศวกรรมสารสนเทศและการสื่อสาร',
  'วิศวกรรมการออกแบบและการผลิตยานยนต์',
  'วิศวกรรมหุ่นยนต์และปัญญาประดิษฐ์',
  'วิศวกรรมทั่วไป',
];

const STUDY_GROUPS = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T'];

const PDPA_CONTENT = (
  <div style={{ fontSize: '.88rem', lineHeight: 1.75, color: 'var(--text)' }}>
    <p>นโยบายนี้อธิบายถึงวิธีที่ระบบ Operation Support จัดเก็บ ใช้ และคุ้มครองข้อมูลส่วนบุคคลของท่าน
    ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</p>

    <p style={{ fontWeight: 700, marginTop: '1rem', marginBottom: '.35rem' }}>1. ข้อมูลที่เก็บรวบรวม</p>
    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
      <li>ชื่อ-นามสกุล และอีเมล (จาก Google Account)</li>
      <li>ชื่อเล่น, ชั้นปี, ภาควิชา, กลุ่มการศึกษา</li>
      <li>หมายเลขโทรศัพท์, Line ID, Instagram (ตามที่กรอก)</li>
      <li>ประวัติการใช้บริการ เช่น การยืม คืน ฝากของ เยี่ยมชม บริจาค และพื้นที่จัดเก็บ</li>
    </ul>

    <p style={{ fontWeight: 700, marginTop: '1rem', marginBottom: '.35rem' }}>2. วัตถุประสงค์ในการใช้ข้อมูล</p>
    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
      <li>บริหารจัดการการยืม-คืนอุปกรณ์และบริการต่าง ๆ ของคลัง</li>
      <li>ติดต่อสื่อสารและแจ้งเตือนเกี่ยวกับสถานะคำขอ</li>
      <li>ตรวจสอบสิทธิ์และยืนยันตัวตนผู้ใช้งาน</li>
      <li>ปรับปรุงและพัฒนาประสิทธิภาพระบบ</li>
    </ul>

    <p style={{ fontWeight: 700, marginTop: '1rem', marginBottom: '.35rem' }}>3. ระยะเวลาจัดเก็บข้อมูล</p>
    <p style={{ margin: 0 }}>ระบบจะเก็บข้อมูลตลอดระยะเวลาที่ท่านเป็นสมาชิก และอาจเก็บต่ออีก 1 ปีหลังพ้นสมาชิกภาพเพื่อวัตถุประสงค์ทางกฎหมาย</p>

    <p style={{ fontWeight: 700, marginTop: '1rem', marginBottom: '.35rem' }}>4. การเปิดเผยข้อมูล</p>
    <p style={{ margin: 0 }}>ระบบจะไม่เปิดเผยข้อมูลส่วนบุคคลแก่บุคคลภายนอก ยกเว้นกรณีที่จำเป็นตามกฎหมายหรือคำสั่งหน่วยงานที่มีอำนาจ</p>

    <p style={{ fontWeight: 700, marginTop: '1rem', marginBottom: '.35rem' }}>5. สิทธิ์ของเจ้าของข้อมูล</p>
    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
      <li><strong>เข้าถึงข้อมูล</strong> — ดูและแก้ไขข้อมูลได้ในหน้าโปรไฟล์</li>
      <li><strong>ถอนความยินยอม</strong> — ติดต่อแอดมิน (การถอนยินยอมจะส่งผลให้ไม่สามารถใช้บริการได้)</li>
      <li><strong>ขอลบข้อมูล</strong> — ติดต่อแอดมินเพื่อขอลบข้อมูลของท่าน</li>
      <li><strong>ร้องเรียน</strong> — ยื่นเรื่องต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล</li>
    </ul>

    <p style={{ fontWeight: 700, marginTop: '1rem', marginBottom: '.35rem' }}>6. การติดต่อ</p>
    <p style={{ margin: 0 }}>หากมีคำถามหรือต้องการใช้สิทธิ์ตาม PDPA กรุณาติดต่อผู้ดูแลระบบ Operation Support</p>

    <p style={{ marginTop: '1rem', padding: '.6rem .75rem', background: 'var(--surface-2,#f5f5f5)', borderRadius: 6, fontSize: '.8rem', color: 'var(--text-muted)' }}>
      นโยบายนี้มีผลบังคับใช้ตั้งแต่วันที่ท่านยอมรับ และอาจมีการปรับปรุงได้ตามความเหมาะสม
    </p>
  </div>
);

export default function ProfilePage() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading]       = useState(true);
  const [meData,  setMeData]        = useState(null);
  const [loadErr, setLoadErr]       = useState('');
  const [saving,  setSaving]        = useState(false);
  const [saveErr, setSaveErr]       = useState('');
  const [showPdpa, setShowPdpa]     = useState(false);

  // Form state
  const [nickname,    setNickname]    = useState('');
  const [year,        setYear]        = useState('');
  const [studyGroup,  setStudyGroup]  = useState('');
  const [department,  setDepartment]  = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [lineId,      setLineId]      = useState('');
  const [instagram,   setInstagram]   = useState('');
  const [pdpaChecked, setPdpaChecked] = useState(false);

  useEffect(() => {
    getMe()
      .then(res => {
        const d = res?.data;
        if (!d) { setLoadErr('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้'); return; }
        setMeData(d);
        setNickname(d.nickname    || '');
        setYear(d.year            ? String(d.year) : '');
        setStudyGroup(d.study_group || '');
        setDepartment(d.department  || '');
        setPhoneNumber(d.phone_number || '');
        setLineId(d.line_id         || '');
        setInstagram(d.instagram    || '');
        setPdpaChecked(!!d.pdpa_accepted);
      })
      .catch(e => setLoadErr('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้: ' + e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (loadErr) return <div className="alert alert-error">{loadErr}</div>;

  const isSetup     = !meData.is_profile_complete;
  const pdpaAccepted = !!meData.pdpa_accepted;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveErr('');
    setSaving(true);

    const payload = {
      nickname:     nickname.trim(),
      year:         parseInt(year, 10),
      department,
      study_group:  studyGroup,
      phone_number: phoneNumber.trim(),
      line_id:      lineId.trim(),
      instagram:    instagram.trim() || null,
    };
    if (pdpaChecked && !pdpaAccepted) {
      payload.pdpa_accepted = true;
    }

    try {
      await updateMe(payload);
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      setSaveErr(err.message);
      setSaving(false);
    }
  }

  return (
    <>
      {/* PDPA Modal */}
      {showPdpa && (
        <div className="modal-overlay" onClick={() => setShowPdpa(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2 className="modal-title">นโยบายความเป็นส่วนตัว (PDPA)</h2>
              <button className="modal-close" onClick={() => setShowPdpa(false)}>✕</button>
            </div>
            <div className="modal-body">
              {PDPA_CONTENT}
            </div>
            <div className="modal-footer" style={{ textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={() => setShowPdpa(false)}>รับทราบและปิด</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="page-header">
          <h1 className="page-title">{isSetup ? 'ตั้งค่าโปรไฟล์' : 'แก้ไขโปรไฟล์'}</h1>
        </div>

        {isSetup && (
          <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
            กรุณากรอกข้อมูลโปรไฟล์เพื่อเริ่มใช้งานระบบ
          </div>
        )}

        <div className="card">
          <form className="form" onSubmit={handleSubmit}>
            {/* Nickname */}
            <div className="form-group">
              <label className="form-label" htmlFor="nickname">
                ชื่อเล่น <span className="form-required">*</span>
              </label>
              <input
                className="form-input"
                type="text"
                id="nickname"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                required
                placeholder="ชื่อเล่น"
              />
            </div>

            {/* Year + Study Group */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="year">
                  ชั้นปี <span className="form-required">*</span>
                </label>
                <select
                  className="form-select"
                  id="year"
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  required
                >
                  <option value="">-- เลือกชั้นปี --</option>
                  {[1,2,3,4,5,6].map(y => (
                    <option key={y} value={String(y)}>ปี {y}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="study_group">
                  Group <span className="form-required">*</span>
                </label>
                <select
                  className="form-select"
                  id="study_group"
                  value={studyGroup}
                  onChange={e => setStudyGroup(e.target.value)}
                  required
                >
                  <option value="">-- เลือกกลุ่ม --</option>
                  {STUDY_GROUPS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Department */}
            <div className="form-group">
              <label className="form-label" htmlFor="department">
                ภาควิชา <span className="form-required">*</span>
              </label>
              <select
                className="form-select"
                id="department"
                value={department}
                onChange={e => setDepartment(e.target.value)}
                required
              >
                <option value="">-- เลือกภาควิชา --</option>
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Phone */}
            <div className="form-group">
              <label className="form-label" htmlFor="phone_number">
                เบอร์โทร <span className="form-required">*</span>
              </label>
              <input
                className="form-input"
                type="tel"
                id="phone_number"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                required
                placeholder="0812345678"
              />
            </div>

            {/* Line ID + Instagram */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="line_id">
                  Line ID <span className="form-required">*</span>
                </label>
                <input
                  className="form-input"
                  type="text"
                  id="line_id"
                  value={lineId}
                  onChange={e => setLineId(e.target.value)}
                  required
                  placeholder="Line ID"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="instagram">
                  Instagram{' '}
                  <span className="muted" style={{ fontWeight: 400 }}>(ไม่บังคับ)</span>
                </label>
                <input
                  className="form-input"
                  type="text"
                  id="instagram"
                  value={instagram}
                  onChange={e => setInstagram(e.target.value)}
                  placeholder="@username"
                />
              </div>
            </div>

            {/* PDPA */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem', cursor: pdpaAccepted ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  id="pdpa_accepted"
                  checked={pdpaChecked}
                  onChange={e => { if (!pdpaAccepted) setPdpaChecked(e.target.checked); }}
                  disabled={pdpaAccepted}
                  required={isSetup && !pdpaAccepted}
                  style={{ marginTop: '.25rem', flexShrink: 0 }}
                />
                <span style={{ fontSize: '.88rem' }}>
                  ข้าพเจ้ายินยอมให้ระบบจัดเก็บและใช้ข้อมูลส่วนบุคคลตาม{' '}
                  <button
                    type="button"
                    onClick={() => setShowPdpa(true)}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
                  >
                    นโยบายความเป็นส่วนตัว (PDPA)
                  </button>
                  {!isSetup && !pdpaAccepted && <span className="form-required">*</span>}
                </span>
              </label>
              {pdpaAccepted && (
                <p className="form-hint" style={{ marginTop: '.35rem' }}>
                  หากต้องการถอนความยินยอม PDPA กรุณาติดต่อแอดมิน
                </p>
              )}
            </div>

            {/* Error */}
            {saveErr && <div className="alert alert-error">{saveErr}</div>}

            {/* Actions */}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'กำลังบันทึก…' : isSetup ? 'เริ่มใช้งาน' : 'บันทึก'}
              </button>
              {!isSetup && (
                <Link to="/dashboard" className="btn btn-secondary">ยกเลิก</Link>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
