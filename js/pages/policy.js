import { requireAuth } from '../auth.js';

async function init() {
  const user = await requireAuth();
  if (!user) return;

  document.getElementById('app').innerHTML = `
    <div style="max-width:760px">
      <h1 class="page-title" style="margin-bottom:1.75rem">Policy</h1>

      <!-- BORROWING PROCESS -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">การยืม-คืนอุปกรณ์</div>
        <p style="font-size:.87rem;color:var(--text-muted);margin-bottom:1.1rem;display:flex;gap:1.5rem;flex-wrap:wrap">
          <span>⏰ เวลายืม/คืน: <strong style="color:var(--text)">12:30 น. และ 16:30 น.</strong></span>
          <span>📍 สถานที่: <strong style="color:var(--text)">หน้าห้องกร ชั้น 100 ตึก 3</strong></span>
        </p>
        <ol style="padding-left:1.3rem;display:flex;flex-direction:column;gap:.75rem;font-size:.9rem;line-height:1.75;color:var(--text)">
          <li>ดูรายการที่มีในระบบ / sheet รายการอุปกรณ์</li>
          <li>
            กรอก sheet การยืมให้ฝ่ายอุปกรณ์ กวศ. <strong>ล่วงหน้า 3 วัน</strong>
            <div style="font-size:.82rem;color:var(--text-muted);margin-top:.2rem">เช่น กรอกวันจันทร์ จะถูกประมวลผลภายในวันพุธ</div>
          </li>
          <li>
            ส่งข้อความแจ้งใน Line OpenChat ตามรูปแบบ:
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.65rem .9rem;margin-top:.45rem;font-size:.82rem;font-family:monospace;line-height:2;color:var(--text)">
              ยืม-คืน<br>
              ชื่อโครงการ: [ชื่อ]<br>
              วันยืม: [วัน ว/ด/ป / เวลา]<br>
              วันคืน: [วัน ว/ด/ป / เวลา]<br>
              รายการที่ยืม: [เลขที่รายการ]
            </div>
            <div style="font-size:.8rem;color:var(--text-muted);margin-top:.35rem">ตัวอย่าง — วันยืม: จันทร์ 23/02/69 / 12:30 &nbsp; วันคืน: พุธ 25/02/69 / 16:30 &nbsp; รายการ: 4–12</div>
          </li>
          <li>รอฝ่ายอุปกรณ์ติดต่อใน LINE OpenChat และติดตามสถานะในระบบนี้</li>
          <li>ยืมอุปกรณ์ตามวัน/เวลาที่กรอก — <strong>หน้าห้องกร ชั้น 100 ตึก 3</strong></li>
          <li>คืนอุปกรณ์ให้ครบตามวัน/เวลาที่กรอก — <strong>หน้าห้องกร ชั้น 100 ตึก 3</strong></li>
          <li>
            หากของคืนมากกว่า 20 รายการ ต้อง<strong>แยกหมวดหมู่</strong>ตามที่กรอก
            <div style="font-size:.82rem;color:var(--text-muted);margin-top:.2rem">ฝ่ายอุปกรณ์จะจัดเตรียมกระเป๋าให้ สามารถติดต่อสอบถามใน Thread ใน OpenChat</div>
          </li>
          <li>ถ่ายรูปอุปกรณ์ที่คืน และส่งใน Thread OpenChat</li>
        </ol>
      </div>

      <!-- NOTES -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">หมายเหตุ</div>
        <ul style="list-style:disc;padding-left:1.3rem;display:flex;flex-direction:column;gap:.6rem;font-size:.9rem;color:var(--text-muted);line-height:1.75">
          <li>ต้องแจ้งค่าวางของล่วงหน้า 3 วัน — หากไม่แจ้ง กวศ. จะนำเข้าคลังหรือจัดการทิ้ง</li>
          <li>หากต้องการวางของ ให้แจ้งพร้อมกับการเคลียร์ของด้วย</li>
          <li>หากไม่ปฏิบัติตาม policy จะมีผลต่อสิทธิ์การยืมของสมาชิก/โครงการในครั้งต่อ ๆ ไป</li>
          <li>การคืนเกินกำหนดอาจส่งผลต่อสิทธิ์การยืมในอนาคต</li>
          <li>อุปกรณ์ต้องได้รับการดูแลรักษาและคืนในสภาพที่ดี</li>
        </ul>
      </div>

      <!-- SHEET RULES -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">ระเบียบการกรอก Sheet</div>
        <ul style="list-style:disc;padding-left:1.3rem;display:flex;flex-direction:column;gap:.6rem;font-size:.9rem;color:var(--text-muted);line-height:1.75">
          <li>รวบยอดต่อรายการ — เช่น เก้าอี้ 5 ตัว ให้รวมเป็นรายการเดียว ไม่แยกแถว</li>
          <li>กรอกให้ครบทุกคอลัมน์</li>
        </ul>
      </div>

      <!-- DAMAGED / LOST -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">อุปกรณ์ชำรุดหรือสูญหาย</div>
        <p style="font-size:.9rem;color:var(--text-muted);margin-bottom:.9rem;line-height:1.75">
          หากอุปกรณ์ชำรุดหรือสูญหาย ผู้ยืมต้องรับผิดชอบค่าซ่อมแซมหรือชดใช้ตามราคาจริง
        </p>
        <ol style="padding-left:1.3rem;display:flex;flex-direction:column;gap:.65rem;font-size:.9rem;line-height:1.75;color:var(--text)">
          <li>กรอกใน sheet ของชำรุด/สูญหาย</li>
          <li>
            ส่งข้อความแจ้งใน Line OpenChat ใน Thread ยืมของ ตามรูปแบบ:
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.55rem .85rem;margin-top:.4rem;font-size:.82rem;font-family:monospace;color:var(--text)">
              (ชื่อโครงการ) ทำของหาย กรอกในที่ได้เรียบร้อยแล้ว
            </div>
          </li>
          <li>นำของที่หายมาคืน หรือชำระค่าชดเชย</li>
          <li>ส่งข้อความแจ้งใน Line OpenChat ว่าดำเนินการแล้ว</li>
          <li>ติดตาม status ของรายการในระบบนี้</li>
        </ol>
      </div>

      <!-- EQUIPMENT SERVICE -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">การบริการอุปกรณ์</div>
        <ol style="padding-left:1.3rem;display:flex;flex-direction:column;gap:.65rem;font-size:.9rem;line-height:1.75;color:var(--text)">
          <li>กรอกใน Sheet บริการอุปกรณ์</li>
          <li>
            แจ้งใน OpenChat ที่ subchat บริการอุปกรณ์ ตามรูปแบบ:
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.55rem .85rem;margin-top:.4rem;font-size:.82rem;font-family:monospace;line-height:2;color:var(--text)">
              บริการอุปกรณ์<br>
              ชื่อโครงการ: [ชื่อ]<br>
              เลขที่รายการ: [เลขที่]
            </div>
          </li>
          <li>ติดตาม Thread เรื่อง status และที่วางของ</li>
          <li>นำมาตั้งในที่ที่แจ้งไว้ใน Thread</li>
          <li>ของที่ไม่รับ ให้โครงการนำไปทิ้ง</li>
        </ol>
      </div>

      <!-- GENERAL PLACEMENT 7 DAYS -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-title">การนำอุปกรณ์ตั้งทั่วไป</div>
        <div class="alert alert-warning" style="margin-bottom:1rem;font-size:.86rem">
          ตั้งได้สูงสุด <strong>7 วัน</strong> หลังได้รับการอนุมัติ — หากเกินกำหนด กวศ. จะนำเข้าคลังหรือจัดการทิ้ง
        </div>
        <ol style="padding-left:1.3rem;display:flex;flex-direction:column;gap:.65rem;font-size:.9rem;line-height:1.75;color:var(--text)">
          <li>กรอกใน sheet ตั้งอุปกรณ์ทั่วไป</li>
          <li>
            แจ้งเจ้าหน้าที่ กวศ. ใน Line OpenChat ตามรูปแบบ:
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.55rem .85rem;margin-top:.4rem;font-size:.82rem;font-family:monospace;line-height:2;color:var(--text)">
              ตั้งอุปกรณ์<br>
              ชื่อโครงการ: [ชื่อ]<br>
              วันที่เริ่มตั้ง: [วัน ว/ด/ป เวลา]<br>
              วันคืน: [วัน ว/ด/ป เวลา]
            </div>
          </li>
          <li>ติดตาม Thread เรื่อง status และที่วางของ</li>
          <li>นำมาตั้งในที่ที่แจ้งไว้ใน Thread</li>
        </ol>
      </div>

      <!-- INDEPENDENT PLACEMENT 30 DAYS -->
      <div class="card">
        <div class="card-title">การนำอุปกรณ์ตั้งอิสระ</div>
        <div class="alert alert-warning" style="margin-bottom:1rem;font-size:.86rem">
          ตั้งได้สูงสุด <strong>30 วัน</strong> หลังได้รับการอนุมัติ — หากเกินกำหนด กวศ. จะนำเข้าคลังหรือจัดการทิ้ง
        </div>
        <ol style="padding-left:1.3rem;display:flex;flex-direction:column;gap:.65rem;font-size:.9rem;line-height:1.75;color:var(--text)">
          <li>กรอกใน sheet ตั้งอิสระ</li>
          <li>
            แจ้งเจ้าหน้าที่ กวศ. ใน Line OpenChat ตามรูปแบบ:
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.55rem .85rem;margin-top:.4rem;font-size:.82rem;font-family:monospace;line-height:2;color:var(--text)">
              ตั้งอิสระ<br>
              ชื่อโครงการ: [ชื่อ]<br>
              วันที่เริ่มตั้ง: [วัน ว/ด/ป เวลา]<br>
              วันคืน: [วัน ว/ด/ป เวลา]<br>
              รายการที่ตั้ง: [เลขที่รายการ]
            </div>
          </li>
          <li>ติดตาม Thread เรื่อง status และที่วางของ</li>
          <li>นำมาตั้งในที่ที่แจ้งไว้ใน Thread</li>
        </ol>
      </div>

    </div>`;
}

init();
