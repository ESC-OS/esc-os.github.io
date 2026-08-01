import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getItem, photoUrl } from '../../api/api';
import { formatDateTime } from '../../shared/utils/format';
import { showError } from '../../shared/ErrorToast';
import Spinner from '../../shared/Spinner';

export default function ItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) { navigate('/items'); return; }
    getItem(id)
      .then(res => {
        const it = res?.data ?? res?.item;
        if (!it) { setError('ไม่พบอุปกรณ์'); return; }
        setItem(it);
      })
      .catch(err => {
        showError(`โหลดอุปกรณ์ไม่สำเร็จ: ${err.message}`);
        setError('ไม่สามารถโหลดข้อมูลอุปกรณ์ได้');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!item) return null;

  const qty = item.available_quantity ?? 0;

  return (
    <>
      <button className="back-btn" onClick={() => navigate(-1)}>← อุปกรณ์</button>

      <div className="card item-detail-card" style={{ display: 'flex', flexDirection: 'row', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto' }}>
          {item.photo_r2_key
            ? <img
                className="item-detail-img"
                src={photoUrl(item.photo_r2_key)}
                alt={item.name}
                style={{ width: 280, height: 300, objectFit: 'cover', borderRadius: 8 }}
              />
            : <div className="item-detail-placeholder" style={{ width: 280, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2, #f3f4f6)', borderRadius: 8, fontSize: '5rem' }}>📦</div>
          }
        </div>

        <div className="item-detail-body" style={{ flex: 1, minWidth: 200 }}>
          <h2 className="item-detail-name">{item.name}</h2>

          {item.category_code && <span className="item-tag">{item.category_code}</span>}

          {item.description && <p className="item-description">{item.description}</p>}

          <div className="item-stats">
            <div className="item-stat">
              <span className="item-stat-label">ทั้งหมด</span>
              <span className="item-stat-value">{item.total_quantity ?? '-'}</span>
            </div>
            <div className="item-stat">
              <span className="item-stat-label">คงเหลือ</span>
              <span className={`item-stat-value ${qty > 0 ? 'stat-green' : 'stat-red'}`}>{qty}</span>
            </div>
            <div className="item-stat">
              <span className="item-stat-label">ซ่อม</span>
              <span className="item-stat-value">{item.repair_quantity ?? 0}</span>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            {item.location && (
              <div className="info-row">
                <span className="info-label">ที่ตั้ง</span>
                <span>{item.location}</span>
              </div>
            )}
            {item.unit && (
              <div className="info-row">
                <span className="info-label">หน่วย</span>
                <span>{item.unit}</span>
              </div>
            )}
            {item.updated_at && (
              <div className="info-row">
                <span className="info-label">แก้ไขล่าสุด</span>
                <span>{formatDateTime(item.updated_at)}</span>
              </div>
            )}
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <Link to="/requests/new" className="btn btn-primary">+ เพิ่มในคำขอยืม</Link>
          </div>
        </div>
      </div>
    </>
  );
}
