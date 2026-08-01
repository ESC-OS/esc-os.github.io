import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import {
  getItems, createItem, updateItem, deleteItem,
  getCategories, createCategory, updateCategory, deleteCategory,
  uploadPhoto, fetchPhotoUrl,
} from '../../../api/api';
import { showError } from '../../../shared/ErrorToast';
import Spinner from '../../../shared/Spinner';
import Modal from '../../../shared/Modal';
import ConfirmModal from '../../../shared/ConfirmModal';

const PAGE_SIZE = 20;

function PhotoImg({ photoKey, style }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!photoKey) return;
    fetchPhotoUrl(photoKey).then(url => { if (url) setSrc(url); });
  }, [photoKey]);
  if (!src) return <div style={{ ...style, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>📦</div>;
  return <img src={src} alt="" style={style} />;
}

export default function AdminItemsPage() {
  const { user } = useAuth();

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0 });
  const [page, setPage] = useState(1);
  const [filterCat, setFilterCat] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterLow, setFilterLow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  // Modals
  const [itemModal, setItemModal] = useState({ open: false, item: null });
  const [catModal, setCatModal] = useState({ open: false, cat: null });
  const [confirm, setConfirm] = useState({ open: false, message: '', onConfirm: null, confirmLabel: 'ยืนยัน', confirmClass: 'btn-primary' });

  const searchTimer = useRef(null);

  const loadCategories = useCallback(async () => {
    try {
      const res = await getCategories();
      setCategories(res.data ?? []);
    } catch (err) { showError(err.message); }
  }, []);

  const loadItems = useCallback(async (pg, cat, search, low) => {
    setTableLoading(true);
    try {
      const params = { page: pg, limit: PAGE_SIZE };
      if (cat) params.category_code = cat;
      if (search) params.search = search;
      if (low) params.low_stock = 'true';
      const res = await getItems(params);
      setItems(res.data ?? []);
      setPagination(res.pagination ?? { page: pg, limit: PAGE_SIZE, total: 0 });
    } catch (err) { showError(err.message); }
    finally { setTableLoading(false); }
  }, []);

  useEffect(() => {
    async function init() {
      await loadCategories();
      await loadItems(1, '', '', false);
      setLoading(false);
    }
    init();
  }, [loadCategories, loadItems]);

  function handleSearchChange(e) {
    const val = e.target.value;
    setFilterSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); loadItems(1, filterCat, val, filterLow); }, 300);
  }

  function handleCatChange(e) {
    const val = e.target.value;
    setFilterCat(val);
    setPage(1);
    loadItems(1, val, filterSearch, filterLow);
  }

  function handleLowChange(e) {
    const val = e.target.checked;
    setFilterLow(val);
    setPage(1);
    loadItems(1, filterCat, filterSearch, val);
  }

  function handlePageChange(pg) {
    setPage(pg);
    loadItems(pg, filterCat, filterSearch, filterLow);
  }

  function showConfirm(message, onConfirm, opts = {}) {
    setConfirm({ open: true, message, onConfirm, confirmLabel: opts.confirmLabel ?? 'ยืนยัน', confirmClass: opts.confirmClass ?? 'btn-primary', title: opts.title ?? 'ยืนยัน' });
  }

  function handleDeleteItem(id, name) {
    showConfirm(`ลบอุปกรณ์ "${name}"?`, async () => {
      try { await deleteItem(id); loadItems(page, filterCat, filterSearch, filterLow); }
      catch (err) { showError(err.message); }
    }, { title: 'ยืนยันการลบ', confirmLabel: 'ลบ', confirmClass: 'btn-danger' });
  }

  function handleDeleteCat(code, name) {
    showConfirm(`ลบหมวดหมู่ "${name}" (${code})?`, async () => {
      try {
        await deleteCategory(code);
        setCategories(prev => prev.filter(c => c.code !== code));
      } catch (err) { showError(err.message); }
    }, { title: 'ยืนยันการลบ', confirmLabel: 'ลบ', confirmClass: 'btn-danger' });
  }

  const { total } = pagination;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const delta = 2;
  const pgStart = Math.max(1, page - delta);
  const pgEnd = Math.min(totalPages, page + delta);

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">จัดการอุปกรณ์</h1>
        <button className="btn btn-primary" onClick={() => setItemModal({ open: true, item: null })}>+ เพิ่มอุปกรณ์</button>
      </div>

      {/* Categories */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.85rem' }}>
          <div className="card-title" style={{ margin: 0 }}>
            หมวดหมู่ <span style={{ fontSize: '.82rem', fontWeight: 400, color: 'var(--text-muted)' }}>({categories.length} หมวด)</span>
          </div>
          <button className="btn btn-outline-primary btn-sm" onClick={() => setCatModal({ open: true, cat: null })}>+ เพิ่มหมวดหมู่</button>
        </div>
        {categories.length === 0 ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '.88rem' }}>ยังไม่มีหมวดหมู่</span>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: '.45rem' }}>
            {categories.map(c => (
              <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.45rem .65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 0 }}>
                <span style={{ fontFamily: 'monospace', fontSize: '.78rem', fontWeight: 700, color: 'var(--primary)', background: '#fdf2f2', padding: '.15rem .4rem', borderRadius: 4, flexShrink: 0 }}>{c.code}</span>
                <span style={{ flex: 1, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</span>
                <button className="btn btn-outline-primary btn-sm" style={{ padding: '.2rem .45rem', flexShrink: 0 }} onClick={() => setCatModal({ open: true, cat: c })} title="แก้ไข">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button className="btn btn-danger btn-sm" style={{ padding: '.2rem .45rem', flexShrink: 0 }} onClick={() => handleDeleteCat(c.code, c.name)} title="ลบ">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', marginBottom: '1rem', alignItems: 'center' }}>
        <select className="filter-select" style={{ minWidth: 160 }} value={filterCat} onChange={handleCatChange}>
          <option value="">ทุกหมวดหมู่</option>
          {categories.map(c => <option key={c.code} value={c.code}>{c.code}: {c.name}</option>)}
        </select>
        <input
          className="form-input"
          placeholder="ค้นหาชื่ออุปกรณ์…"
          value={filterSearch}
          onChange={handleSearchChange}
          style={{ flex: 1, minWidth: 180, maxWidth: 320 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.88rem', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
          <input type="checkbox" checked={filterLow} onChange={handleLowChange} /> สต็อกใกล้หมด
        </label>
        <span style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>พบ {total} รายการ</span>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 56 }}></th>
              <th>ชื่ออุปกรณ์</th>
              <th>หมวดหมู่</th>
              <th style={{ textAlign: 'center' }}>ทั้งหมด</th>
              <th style={{ textAlign: 'center' }}>พร้อมใช้</th>
              <th style={{ textAlign: 'center' }}>ซ่อม</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}><Spinner /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>ไม่พบอุปกรณ์</td></tr>
            ) : items.map(item => {
              const cat = categories.find(c => c.code === item.category_code);
              const lowStock = item.total_quantity > 0 && (item.available_quantity / item.total_quantity) < 0.2;
              return (
                <tr key={item.id} className={item.is_active === 0 ? 'item-inactive' : ''}>
                  <td style={{ padding: '.4rem .5rem' }}>
                    <PhotoImg
                      photoKey={item.image_r2_key}
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                    />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '.9rem' }}>
                      {item.name}
                      {item.is_active === 0 && <span style={{ fontWeight: 400, fontSize: '.75rem', color: 'var(--text-muted)', marginLeft: '.3rem' }}>(ปิดใช้งาน)</span>}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '.05rem' }}>#{item.id}</div>
                    {item.description && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{item.description}</div>}
                    {item.stock_location && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>📍 {item.stock_location}</div>}
                  </td>
                  <td>
                    {cat ? (
                      <>
                        <span style={{ fontFamily: 'monospace', fontSize: '.77rem', fontWeight: 700, color: 'var(--primary)', background: '#fdf2f2', padding: '.1rem .3rem', borderRadius: 3 }}>{cat.code}</span>
                        <span style={{ fontSize: '.82rem', marginLeft: '.3rem' }}>{cat.name}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{item.category_code ?? '-'}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '.88rem' }}>{item.total_quantity ?? 0}</td>
                  <td style={{ textAlign: 'center', fontSize: '.88rem' }}>
                    <span style={lowStock ? { color: 'var(--error)', fontWeight: 700 } : {}}>{item.available_quantity ?? 0}</span>
                    {lowStock && <span style={{ fontSize: '.7rem', color: 'var(--error)', marginLeft: '.2rem' }} title="สต็อกใกล้หมด">⚠</span>}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '.88rem' }}>{item.repair_quantity ?? 0}</td>
                  <td>
                    <div className="actions-bar">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => setItemModal({ open: true, item })}>แก้ไข</button>
                      <Link to={`/admin/items/${item.id}/stock`} className="btn btn-sm" style={{ color: 'var(--info)', border: '1px solid var(--info)' }}>สต็อก</Link>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem(item.id, item.name)}>ลบ</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.75rem', marginTop: '1rem', fontSize: '.88rem', flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>‹</button>
          {pgStart > 1 && <><button className="btn btn-sm btn-secondary" onClick={() => handlePageChange(1)}>1</button>{pgStart > 2 && <span style={{ color: 'var(--text-muted)' }}>…</span>}</>}
          {Array.from({ length: pgEnd - pgStart + 1 }, (_, i) => pgStart + i).map(p => (
            <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handlePageChange(p)}>{p}</button>
          ))}
          {pgEnd < totalPages && <>{pgEnd < totalPages - 1 && <span style={{ color: 'var(--text-muted)' }}>…</span>}<button className="btn btn-sm btn-secondary" onClick={() => handlePageChange(totalPages)}>{totalPages}</button></>}
          <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>›</button>
          <span style={{ color: 'var(--text-muted)', marginLeft: '.25rem' }}>หน้า {page}/{totalPages} · {total} รายการ</span>
        </div>
      )}

      {/* Item Modal */}
      <ItemModal
        isOpen={itemModal.open}
        item={itemModal.item}
        categories={categories}
        onClose={() => setItemModal({ open: false, item: null })}
        onSaved={() => { loadItems(page, filterCat, filterSearch, filterLow); }}
      />

      {/* Category Modal */}
      <CategoryModal
        isOpen={catModal.open}
        cat={catModal.cat}
        onClose={() => setCatModal({ open: false, cat: null })}
        onSaved={(updated) => {
          if (catModal.cat) {
            setCategories(prev => prev.map(c => c.code === updated.code ? updated : c));
          } else {
            setCategories(prev => [...prev, updated].sort((a, b) => a.code.localeCompare(b.code)));
          }
        }}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirm.open}
        onClose={() => setConfirm(c => ({ ...c, open: false }))}
        message={confirm.message}
        onConfirm={confirm.onConfirm}
        title={confirm.title}
        confirmLabel={confirm.confirmLabel}
        confirmClass={confirm.confirmClass}
      />
    </>
  );
}

function ItemModal({ isOpen, item, categories, onClose, onSaved }) {
  const isEdit = Boolean(item);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [previewSrc, setPreviewSrc] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!isOpen) { setError(''); setSaving(false); setUploadStatus(''); setPreviewSrc(null); return; }
    if (item?.image_r2_key) {
      fetchPhotoUrl(item.image_r2_key).then(url => { if (url) setPreviewSrc(url); });
    }
  }, [isOpen, item]);

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setSaving(true); setError('');
    try {
      let image_r2_key = item?.image_r2_key ?? undefined;
      const imageFile = fd.get('image');
      if (imageFile?.size > 0) {
        setUploadStatus('กำลังอัปโหลดรูป…');
        image_r2_key = await uploadPhoto(imageFile);
        setUploadStatus('');
      }
      const data = {
        category_code:  fd.get('category_code') || undefined,
        name:           fd.get('name'),
        description:    fd.get('description') || undefined,
        stock_location: fd.get('stock_location') || undefined,
        unit:           fd.get('unit') || undefined,
        image_r2_key,
      };
      if (isEdit) await updateItem(item.id, data);
      else await createItem(data);
      onClose();
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false); setUploadStatus('');
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่'}>
      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      <form ref={formRef} className="form" style={{ padding: 0 }} onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">หมวดหมู่ <span className="form-required">*</span></label>
          <select className="form-select" name="category_code" required defaultValue={item?.category_code ?? ''}>
            <option value="">-- เลือกหมวดหมู่ --</option>
            {categories.map(c => <option key={c.code} value={c.code}>{c.code} – {c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">ชื่ออุปกรณ์ <span className="form-required">*</span></label>
          <input className="form-input" name="name" required defaultValue={item?.name ?? ''} />
        </div>
        <div className="form-group">
          <label className="form-label">คำอธิบาย</label>
          <textarea className="form-textarea" name="description" rows={2} defaultValue={item?.description ?? ''} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">สถานที่เก็บ</label>
            <input className="form-input" name="stock_location" placeholder="เช่น ชั้น A3" defaultValue={item?.stock_location ?? ''} />
          </div>
          <div className="form-group">
            <label className="form-label">หน่วย</label>
            <input className="form-input" name="unit" placeholder="เช่น ชิ้น, ชุด" defaultValue={item?.unit ?? ''} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">รูปภาพ</label>
          {previewSrc && <img src={previewSrc} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, display: 'block', marginBottom: '.5rem' }} />}
          <input className="form-input" type="file" name="image" accept="image/*" />
          {uploadStatus && <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: '.25rem' }}>{uploadStatus}</div>}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryModal({ isOpen, cat, onClose, onSaved }) {
  const isEdit = Boolean(cat);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!isOpen) { setError(''); setSaving(false); } }, [isOpen]);

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const code = fd.get('code').toUpperCase().trim();
    const name = fd.get('name').trim();
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await updateCategory(cat.code, { name });
        onSaved({ ...cat, name });
      } else {
        const res = await createCategory({ code, name });
        onSaved(res.data ?? { code, name });
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}>
      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      <form className="form" style={{ padding: 0 }} onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">รหัส (2 ตัวอักษร) <span className="form-required">*</span></label>
          <input
            className="form-input"
            name="code"
            maxLength={2}
            placeholder="เช่น AV"
            style={{ textTransform: 'uppercase', width: 100 }}
            defaultValue={isEdit ? cat.code : ''}
            readOnly={isEdit}
            required={!isEdit}
          />
        </div>
        <div className="form-group">
          <label className="form-label">ชื่อหมวดหมู่ <span className="form-required">*</span></label>
          <input className="form-input" name="name" required defaultValue={isEdit ? cat.name : ''} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        </div>
      </form>
    </Modal>
  );
}
