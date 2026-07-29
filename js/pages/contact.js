import { requireAuth } from '../auth.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  document.getElementById('app').innerHTML = `
    <div style="max-width:560px">
      <h1 class="page-title" style="margin-bottom:1.75rem">Contact Us</h1>

      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">งานพัสดุและสำนักงาน กวศ.</div>
        <div style="display:flex;flex-direction:column;gap:.9rem;font-size:.92rem">
          <div class="info-row">
            <span class="info-label">ที่ตั้ง</span>
            <span>คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย<br>ถนนพญาไท แขวงวังใหม่ เขตปทุมวัน กรุงเทพฯ 10330</span>
          </div>
          <div class="info-row">
            <span class="info-label">เวลาทำการ</span>
            <span>จันทร์ – ศุกร์<br>08:30 – 16:30 น.</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">ช่องทางการติดต่อ</div>
        <div style="display:flex;flex-direction:column;gap:.75rem;font-size:.92rem">
          <div class="info-row">
            <span class="info-label">อีเมล</span>
            <a href="mailto:operation.support@eng.chula.ac.th" style="color:var(--primary)">
              operation.support@eng.chula.ac.th
            </a>
          </div>
          <div class="info-row">
            <span class="info-label">โทรศัพท์</span>
            <span>0-2218-6000</span>
          </div>
        </div>
      </div>
    </div>`;
}

init();
