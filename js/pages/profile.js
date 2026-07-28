import { requireAuth } from '../auth.js';
import { getMe, updateMe } from '../api.js';
import { h, renderNavbar, showError, openModal } from '../ui.js';

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

function deptOptions(selected) {
  return DEPARTMENTS.map(d =>
    `<option value="${h(d)}" ${selected === d ? 'selected' : ''}>${h(d)}</option>`
  ).join('');
}

function groupOptions(selected) {
  return STUDY_GROUPS.map(g =>
    `<option value="${h(g)}" ${selected === g ? 'selected' : ''}>${h(g)}</option>`
  ).join('');
}

function yearOptions(selected) {
  return [1,2,3,4,5,6].map(y =>
    `<option value="${y}" ${selected == y ? 'selected' : ''}>ปี ${y}</option>`
  ).join('');
}

async function init() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="spinner">กำลังโหลด…</div>';

  // requireAuth allows is_profile_complete === 0 to land on profile.html
  const user = await requireAuth();
  if (!user) return;

  let meData;
  try {
    const res = await getMe();
    meData = res.data;
  } catch (e) {
    showError('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้: ' + e.message);
    return;
  }

  const isSetup = !meData.is_profile_complete;
  const pdpaAccepted = !!meData.pdpa_accepted;

  renderNavbar(user);

  app.innerHTML = `
    <div style="max-width:560px;margin:0 auto;">
      <div class="page-header">
        <h1 class="page-title">${isSetup ? 'ตั้งค่าโปรไฟล์' : 'แก้ไขโปรไฟล์'}</h1>
      </div>
      ${isSetup ? `<div class="alert alert-info" style="margin-bottom:1.25rem;">กรุณากรอกข้อมูลโปรไฟล์เพื่อเริ่มใช้งานระบบ</div>` : ''}
      <div class="card">
        <form class="form" id="profile-form">
          <div class="form-group">
            <label class="form-label" for="nickname">ชื่อเล่น <span class="form-required">*</span></label>
            <input class="form-input" type="text" id="nickname" name="nickname"
              value="${h(meData.nickname || '')}" required placeholder="ชื่อเล่น">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="year">ชั้นปี <span class="form-required">*</span></label>
              <select class="form-select" id="year" name="year" required>
                <option value="">-- เลือกชั้นปี --</option>
                ${yearOptions(meData.year)}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="study_group">Group <span class="form-required">*</span></label>
              <select class="form-select" id="study_group" name="study_group" required>
                <option value="">-- เลือกกลุ่ม --</option>
                ${groupOptions(meData.study_group)}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="department">ภาควิชา <span class="form-required">*</span></label>
            <select class="form-select" id="department" name="department" required>
              <option value="">-- เลือกภาควิชา --</option>
              ${deptOptions(meData.department)}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="phone_number">เบอร์โทร <span class="form-required">*</span></label>
            <input class="form-input" type="tel" id="phone_number" name="phone_number"
              value="${h(meData.phone_number || '')}" required placeholder="0812345678">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="line_id">Line ID <span class="form-required">*</span></label>
              <input class="form-input" type="text" id="line_id" name="line_id"
                value="${h(meData.line_id || '')}" required placeholder="Line ID">
            </div>
            <div class="form-group">
              <label class="form-label" for="instagram">Instagram <span class="muted" style="font-weight:400;">(ไม่บังคับ)</span></label>
              <input class="form-input" type="text" id="instagram" name="instagram"
                value="${h(meData.instagram || '')}" placeholder="@username">
            </div>
          </div>

          <div class="form-group">
            <label style="display:flex;align-items:flex-start;gap:.6rem;cursor:${pdpaAccepted ? 'default' : 'pointer'};">
              <input type="checkbox" id="pdpa_accepted" name="pdpa_accepted"
                ${pdpaAccepted ? 'checked disabled' : (isSetup ? 'required' : '')}
                style="margin-top:.25rem;flex-shrink:0;">
              <span style="font-size:.88rem;">
                ข้าพเจ้ายินยอมให้ระบบจัดเก็บและใช้ข้อมูลส่วนบุคคลตาม
                <a href="#" id="pdpa-link" style="color:var(--primary);text-decoration:underline;">นโยบายความเป็นส่วนตัว (PDPA)</a>
                ${!isSetup && !pdpaAccepted ? '<span class="form-required">*</span>' : ''}
              </span>
            </label>
            ${pdpaAccepted
              ? `<p class="form-hint" style="margin-top:.35rem;">หากต้องการถอนความยินยอม PDPA กรุณาติดต่อแอดมิน</p>`
              : ''
            }
          </div>

          <div id="form-error"></div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="save-btn">
              ${isSetup ? 'เริ่มใช้งาน' : 'บันทึก'}
            </button>
            ${!isSetup ? `<a href="dashboard.html" class="btn btn-secondary">ยกเลิก</a>` : ''}
          </div>
        </form>
      </div>
    </div>`;

  const form     = document.getElementById('profile-form');
  const saveBtn  = document.getElementById('save-btn');
  const errDiv   = document.getElementById('form-error');

  const PDPA_BODY = `
    <div style="font-size:.88rem;line-height:1.75;color:var(--text)">
      <p>นโยบายนี้อธิบายถึงวิธีที่ระบบOperation Support จัดเก็บ ใช้ และคุ้มครองข้อมูลส่วนบุคคลของท่าน
      ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</p>

      <p style="font-weight:700;margin-top:1rem;margin-bottom:.35rem">1. ข้อมูลที่เก็บรวบรวม</p>
      <ul style="margin:0;padding-left:1.25rem">
        <li>ชื่อ-นามสกุล และอีเมล (จาก Google Account)</li>
        <li>ชื่อเล่น, ชั้นปี, ภาควิชา, กลุ่มการศึกษา</li>
        <li>หมายเลขโทรศัพท์, Line ID, Instagram (ตามที่กรอก)</li>
        <li>ประวัติการใช้บริการ เช่น การยืม คืน ฝากของ เยี่ยมชม บริจาค และพื้นที่จัดเก็บ</li>
      </ul>

      <p style="font-weight:700;margin-top:1rem;margin-bottom:.35rem">2. วัตถุประสงค์ในการใช้ข้อมูล</p>
      <ul style="margin:0;padding-left:1.25rem">
        <li>บริหารจัดการการยืม-คืนอุปกรณ์และบริการต่าง ๆ ของคลัง</li>
        <li>ติดต่อสื่อสารและแจ้งเตือนเกี่ยวกับสถานะคำขอ</li>
        <li>ตรวจสอบสิทธิ์และยืนยันตัวตนผู้ใช้งาน</li>
        <li>ปรับปรุงและพัฒนาประสิทธิภาพระบบ</li>
      </ul>

      <p style="font-weight:700;margin-top:1rem;margin-bottom:.35rem">3. ระยะเวลาจัดเก็บข้อมูล</p>
      <p style="margin:0">ระบบจะเก็บข้อมูลตลอดระยะเวลาที่ท่านเป็นสมาชิก และอาจเก็บต่ออีก 1 ปีหลังพ้นสมาชิกภาพเพื่อวัตถุประสงค์ทางกฎหมาย</p>

      <p style="font-weight:700;margin-top:1rem;margin-bottom:.35rem">4. การเปิดเผยข้อมูล</p>
      <p style="margin:0">ระบบจะไม่เปิดเผยข้อมูลส่วนบุคคลแก่บุคคลภายนอก ยกเว้นกรณีที่จำเป็นตามกฎหมายหรือคำสั่งหน่วยงานที่มีอำนาจ</p>

      <p style="font-weight:700;margin-top:1rem;margin-bottom:.35rem">5. สิทธิ์ของเจ้าของข้อมูล</p>
      <ul style="margin:0;padding-left:1.25rem">
        <li><strong>เข้าถึงข้อมูล</strong> — ดูและแก้ไขข้อมูลได้ในหน้าโปรไฟล์</li>
        <li><strong>ถอนความยินยอม</strong> — ติดต่อแอดมิน (การถอนยินยอมจะส่งผลให้ไม่สามารถใช้บริการได้)</li>
        <li><strong>ขอลบข้อมูล</strong> — ติดต่อแอดมินเพื่อขอลบข้อมูลของท่าน</li>
        <li><strong>ร้องเรียน</strong> — ยื่นเรื่องต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล</li>
      </ul>

      <p style="font-weight:700;margin-top:1rem;margin-bottom:.35rem">6. การติดต่อ</p>
      <p style="margin:0">หากมีคำถามหรือต้องการใช้สิทธิ์ตาม PDPA กรุณาติดต่อผู้ดูแลระบบOperation Support</p>

      <p style="margin-top:1rem;padding:.6rem .75rem;background:var(--surface-2,#f5f5f5);border-radius:6px;font-size:.8rem;color:var(--text-muted)">
        นโยบายนี้มีผลบังคับใช้ตั้งแต่วันที่ท่านยอมรับ และอาจมีการปรับปรุงได้ตามความเหมาะสม
      </p>
    </div>
    <div style="margin-top:1.25rem;text-align:right">
      <button class="btn btn-primary" id="pdpa-close-btn">รับทราบและปิด</button>
    </div>`;

  document.getElementById('pdpa-link').addEventListener('click', (e) => {
    e.preventDefault();
    const close = openModal('นโยบายความเป็นส่วนตัว (PDPA)', PDPA_BODY);
    document.getElementById('pdpa-close-btn').addEventListener('click', close);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errDiv.innerHTML = '';
    saveBtn.disabled = true;
    saveBtn.textContent = 'กำลังบันทึก…';

    const pdpaCheckbox = document.getElementById('pdpa_accepted');

    const payload = {
      nickname:     form.nickname.value.trim(),
      year:         parseInt(form.year.value, 10),
      department:   form.department.value,
      study_group:  form.study_group.value,
      phone_number: form.phone_number.value.trim(),
      line_id:      form.line_id.value.trim(),
      instagram:    form.instagram.value.trim() || null,
    };

    if (pdpaCheckbox.checked && !pdpaAccepted) {
      payload.pdpa_accepted = true;
    }

    try {
      await updateMe(payload);
      window.location.href = 'dashboard.html';
    } catch (err) {
      errDiv.innerHTML = `<div class="alert alert-error">${h(err.message)}</div>`;
      saveBtn.disabled = false;
      saveBtn.textContent = isSetup ? 'เริ่มใช้งาน' : 'บันทึก';
    }
  });
}

init();
