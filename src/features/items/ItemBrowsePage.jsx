import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getItems, getCategories, getRequest, addRequestItem, photoUrl } from '../../api/api';
import Spinner from '../../shared/Spinner';

const PAGE_SIZE = 30;

export default function ItemBrowsePage() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('request_id');

  const [request, setRequest] = useState(null);
  const [categories, setCategories] = useState([]);
  const [catMap, setCatMap] = useState({});
  const [items, setItems] = useState([]);
  const [cartItems, setCartItems] = useState({});
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [addStatus, setAddStatus] = useState({}); // itemId -> { msg, warn, loading }
  const [qtyMap, setQtyMap] = useState({});        // itemId -> quantity
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!requestId) return;
    async function init() {
      try {
        const [reqRes, catsRes] = await Promise.all([
          getRequest(requestId),
          getCategories().catch(() => ({ data: [] })),
        ]);
        const req = reqRes?.data;
        const cats = catsRes?.data ?? [];
        const map = {};
        cats.forEach(c => { map[c.code] = c.name || c.code; });
        setCatMap(map);
        setCategories(cats);
        setRequest(req);
        // Build cart from existing request items
        const cart = {};
        (req?.items ?? []).forEach(it => {
          cart[String(it.item_id || it.id)] = it.quantity_requested ?? 0;
        });
        setCartItems(cart);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [requestId]);

  const fetchItems = useCallback(async (searchVal, catVal, pg) => {
    setListLoading(true);
    try {
      const p = { limit: PAGE_SIZE, page: pg };
      if (searchVal) p.search = searchVal;
      if (catVal) p.category_code = catVal;
      const res = await getItems(p);
      setItems(res?.data ?? []);
      const pagination = res?.pagination ?? {};
      const total = pagination.total ?? (res?.data?.length ?? 0);
      setTotalPages(Math.ceil(total / PAGE_SIZE) || 1);
      setPage(pagination.page ?? pg);
    } catch (err) {
      setError(err.message);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) fetchItems(search, catFilter, 1);
  }, [loading]); // eslint-disable-line

  function handleSearchChange(e) {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); fetchItems(val, catFilter, 1); }, 300);
  }

  function handleCatChange(e) {
    const val = e.target.value;
    setCatFilter(val);
    setPage(1);
    fetchItems(search, val, 1);
  }

  function handlePageChange(p) {
    setPage(p);
    fetchItems(search, catFilter, p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleAdd(item) {
    const iid = String(item.id);
    const qty = qtyMap[iid] ?? 1;
    setAddStatus(prev => ({ ...prev, [iid]: { loading: true, msg: '', warn: [] } }));
    try {
      const res = await addRequestItem(requestId, { item_id: iid, quantity_requested: qty });
      const warn = res?.warnings ?? [];
      setCartItems(prev => ({ ...prev, [iid]: (prev[iid] ?? 0) + qty }));
      setAddStatus(prev => ({ ...prev, [iid]: { loading: false, msg: 'เพิ่มแล้ว ✓', warn } }));
      setTimeout(() => setAddStatus(prev => ({ ...prev, [iid]: { loading: false, msg: '', warn: [] } })), 2500);
    } catch (err) {
      setAddStatus(prev => ({ ...prev, [iid]: { loading: false, msg: '', warn: [], error: err.message } }));
    }
  }

  const cartCount = Object.keys(cartItems).length;
  const backUrl = `/requests/${requestId}`;

  if (!requestId) return <div className="alert alert-error">ไม่พบ request_id</div>;
  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;

  // Pagination helper
  function pageNums() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set([1, totalPages]);
    for (let d = -2; d <= 2; d++) {
      const p = page + d;
      if (p >= 1 && p <= totalPages) pages.add(p);
    }
    const sorted = [...pages].sort((a, b) => a - b);
    const result = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
      result.push(sorted[i]);
    }
    return result;
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <Link to={backUrl} className="back-btn" style={{ marginBottom: 0 }}>
          ← {request?.name || 'คำขอยืม'}
        </Link>
        <Link to={backUrl} className="btn btn-primary" style={{ fontSize: '.9em' }}>
          ตะกร้า ({cartCount})
        </Link>
      </div>

      <div className="filter-row" style={{ marginBottom: '1rem' }}>
        <input
          className="filter-select"
          type="search"
          placeholder="ค้นหาอุปกรณ์…"
          value={search}
          onChange={handleSearchChange}
          style={{ minWidth: 200 }}
        />
        <select className="filter-select" value={catFilter} onChange={handleCatChange}>
          <option value="">ทุกหมวดหมู่</option>
          {categories.map(c => (
            <option key={c.code} value={c.code}>{c.name || c.code}</option>
          ))}
        </select>
      </div>

      {listLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="empty-text">ไม่พบอุปกรณ์</p>
      ) : (
        <div className="items-grid">
          {items.map(item => {
            const avail = item.available_quantity ?? 0;
            const catName = item.category_code ? (catMap[item.category_code] || item.category_code) : null;
            const iid = String(item.id);
            const inCart = cartItems[iid];
            const unit = item.item_unit || item.unit || 'ชิ้น';
            const status = addStatus[iid] ?? {};

            return (
              <div key={item.id} className="item-card" style={{ cursor: 'default' }}>
                {item.photo_r2_key
                  ? <img className="item-card-img" src={photoUrl(item.photo_r2_key)} alt={item.name} />
                  : <div className="item-card-placeholder">📦</div>}
                <div className="item-card-body">
                  <div className="item-card-name">{item.name}</div>
                  {catName && <div className="item-card-cat">{catName}</div>}
                  <div className="item-card-qty">
                    คงเหลือ:{' '}
                    <span style={avail > 0 ? { color: 'var(--success)' } : { color: 'var(--danger, #dc2626)' }}>
                      {avail}
                    </span>{' '}{unit}
                  </div>
                  {inCart != null && (
                    <div style={{ fontSize: '.78em', color: 'var(--primary)', fontWeight: 600, margin: '.3rem 0' }}>
                      ✓ ในตะกร้า {inCart} {unit}
                    </div>
                  )}
                  {avail > 0 ? (
                    <>
                      <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', marginTop: '.4rem' }}>
                        <input
                          type="number"
                          className="form-input"
                          min={1}
                          max={avail}
                          value={qtyMap[iid] ?? 1}
                          onChange={e => setQtyMap(prev => ({ ...prev, [iid]: parseInt(e.target.value) || 1 }))}
                          style={{ width: 52, fontSize: '.82em', padding: '.2rem .3rem', textAlign: 'center', flexShrink: 0 }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ flex: 1, fontSize: '.82em' }}
                          disabled={status.loading}
                          onClick={() => handleAdd(item)}
                        >
                          {inCart != null ? '+ เพิ่มเติม' : '+ เพิ่ม'}
                        </button>
                      </div>
                      <div style={{ fontSize: '.78em', minHeight: '1em', marginTop: '.2rem' }}>
                        {status.error && <span style={{ color: 'var(--error, #dc2626)' }}>{status.error}</span>}
                        {status.msg && <span style={{ color: 'green' }}>{status.msg}</span>}
                        {(status.warn ?? []).map((w, i) => (
                          <div key={i} style={{ color: 'orange' }}>{w}</div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '.82em', color: 'var(--text-muted)', marginTop: '.5rem' }}>หมดชั่วคราว</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.35rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          >‹</button>
          {pageNums().map((p, i) =>
            p === '…'
              ? <span key={`e${i}`} style={{ padding: '0 .25rem', color: 'var(--text-muted)' }}>…</span>
              : <button
                  key={p}
                  className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => p !== page && handlePageChange(p)}
                  disabled={p === page}
                >{p}</button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            disabled={page >= totalPages}
            onClick={() => handlePageChange(page + 1)}
          >›</button>
        </div>
      )}
    </>
  );
}
