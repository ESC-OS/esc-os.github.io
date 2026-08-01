export function h(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STATUS_LABELS = {
  draft: 'ร่าง', pending: 'รอดำเนินการ', processing: 'กำลังดำเนินการ',
  ready_for_pickup: 'พร้อมรับ', in_lend: 'กำลังยืม',
  returned: 'คืนแล้ว', completed: 'เสร็จสิ้น', rejected: 'ถูกปฏิเสธ', cancelled: 'ยกเลิกแล้ว',
  approved: 'อนุมัติแล้ว', confirmed: 'ยืนยันแล้ว', deposited: 'รับฝากแล้ว', donated: 'บริจาคแล้ว', in_use: 'กำลังใช้งาน',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatCountdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'หมดเวลา';
  const days = Math.floor(ms / 864e5);
  const hours = Math.floor((ms % 864e5) / 36e5);
  const mins = Math.floor((ms % 36e5) / 6e4);
  if (days > 0) return `เหลือ ${days} วัน ${hours} ชั่วโมง`;
  return `เหลือ ${hours} ชั่วโมง ${mins} นาที`;
}
