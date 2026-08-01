import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getItems, getCategories, photoUrl } from '../../api/api';
import { showError } from '../../shared/ErrorToast';
import Spinner from '../../shared/Spinner';

export default function ItemsPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [catMap, setCatMap] = useState({});
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  // Initial load: categories + items
  useEffect(() => {
    async function load() {
      try {
        const [itemsRes, catsRes] = await Promise.all([
          getItems({ limit: 100 }).catch(err => { showError(`โหลดอุปกรณ์ไม่สำเร็จ: ${err.message}`); return null; }),
          getCategories().catch(() => null),
        ]);
        if (!itemsRes) { setError('ไม่สามารถโหลดข้อมูลอุปกรณ์ได้'); return; }
        const cats = catsRes?.data ?? [];
        const map = {};
        cats.forEach(c => { map[c.code] = c.name || c.code; });
        setCatMap(map);
        setCategories(cats);
        setItems(itemsRes?.data ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Fetch when search/cat changes (debounced on search)
  async function fetchFiltered(searchVal, catVal) {
    setListLoading(true);
    try {
      const params = { limit: 100 };
      if (searchVal) params.search = searchVal;
      if (catVal) params.category_code = catVal;
      const res = await getItems(params);
      setItems(res?.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setListLoading(false);
    }
  }

  function handleSearchChange(e) {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchFiltered(val, catFilter), 300);
  }

  function handleCatChange(e) {
    const val = e.target.value;
    setCatFilter(val);
    clearTimeout(debounceRef.current);
    fetchFiltered(search, val);
  }

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">อุปกรณ์</h1>
      </div>
      <div className="filter-row">
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
            const qty = item.available_quantity ?? 0;
            const catName = item.category_code ? (catMap[item.category_code] || item.category_code) : null;
            return (
              <Link key={item.id} to={`/items/${item.id}`} className="item-card">
                {item.photo_r2_key
                  ? <img className="item-card-img" src={photoUrl(item.photo_r2_key)} alt={item.name} />
                  : <div className="item-card-placeholder">📦</div>}
                <div className="item-card-body">
                  <div className="item-card-name">{item.name}</div>
                  {catName && <div className="item-card-cat">{catName}</div>}
                  <div className="item-card-qty">
                    คงเหลือ:{' '}
                    <span
                      className={qty > 0 ? 'qty-available' : ''}
                      style={qty <= 0 ? { color: 'var(--danger, #dc2626)' } : {}}
                    >
                      {qty}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
