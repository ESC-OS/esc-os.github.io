const STATUS_LABELS = {
  draft: 'ร่าง', pending: 'รอดำเนินการ', processing: 'กำลังดำเนินการ',
  ready_for_pickup: 'พร้อมรับ', in_lend: 'กำลังยืม',
  returned: 'คืนแล้ว', completed: 'เสร็จสิ้น', rejected: 'ถูกปฏิเสธ', cancelled: 'ยกเลิกแล้ว',
  approved: 'อนุมัติแล้ว', confirmed: 'ยืนยันแล้ว', deposited: 'รับฝากแล้ว',
  donated: 'บริจาคแล้ว', in_use: 'กำลังใช้งาน',
};

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] || status}</span>;
}
