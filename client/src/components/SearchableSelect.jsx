import { useState, useRef, useEffect, useMemo } from 'react';

// Lightweight searchable dropdown styled to match the admin form fields.
// Props: value, onChange(value), options [{ value, label }], placeholder, searchPlaceholder.
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Выберите',
  searchPlaceholder = 'Поиск...',
  className = '',
  disabled = false
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value)) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={rootRef} className={`searchable-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}>
      <button
        type="button"
        className="searchable-select-trigger"
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        disabled={disabled}
      >
        <span className={`searchable-select-value${selected ? '' : ' is-placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className={`searchable-select-chevron${open ? ' is-open' : ''}`} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="searchable-select-menu">
          <div className="searchable-select-search">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
          <div className="searchable-select-list" role="listbox">
            {filtered.length === 0 ? (
              <div className="searchable-select-empty">Ничего не найдено</div>
            ) : (
              filtered.map((o) => (
                <button
                  type="button"
                  key={String(o.value)}
                  className={`searchable-select-item${String(o.value) === String(value) ? ' is-active' : ''}`}
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
