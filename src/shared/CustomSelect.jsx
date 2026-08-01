import { useState, useRef, useEffect } from 'react';

export default function CustomSelect({ value, onChange, options = [], placeholder = '-- เลือก --', disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);
  const searchable = options.length > 6;

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function pick(val) {
    onChange(val);
    setIsOpen(false);
    setSearch('');
  }

  function handleTriggerKey(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) setIsOpen(o => !o); }
    else if (e.key === 'Escape') setIsOpen(false);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = options.findIndex(o => o.value === value);
      const next = e.key === 'ArrowDown' ? Math.min(idx + 1, options.length - 1) : Math.max(idx - 1, 0);
      if (next !== idx) pick(options[next].value);
    }
  }

  const filtered = searchable ? options.filter(o => !search || o.label.toLowerCase().includes(search.toLowerCase())) : options;

  return (
    <div ref={wrapRef} className={`cs-wrap${isOpen ? ' cs-open' : ''}${disabled ? ' cs-disabled' : ''}`}>
      <div
        className="cs-trigger"
        tabIndex={disabled ? -1 : 0}
        onClick={() => { if (!disabled) setIsOpen(o => !o); }}
        onKeyDown={handleTriggerKey}
      >
        <span className={selected ? 'cs-value' : 'cs-value cs-ph'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="cs-arrow">▼</span>
      </div>
      {isOpen && (
        <div className="cs-dropdown">
          {searchable && (
            <input
              type="text"
              className="cs-search"
              placeholder="ค้นหา…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setIsOpen(false); }}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
          )}
          <div className="cs-opts">
            {filtered.map(o => (
              <div
                key={o.value}
                className={`cs-opt${o.value === '' ? ' cs-ph-opt' : ''}${o.value === value ? ' cs-sel' : ''}`}
                onMouseDown={e => { e.preventDefault(); pick(o.value); }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
