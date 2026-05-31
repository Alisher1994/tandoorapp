import { useState, useRef, useEffect, useMemo } from 'react';
import * as Flags from 'country-flag-icons/react/3x2';

// Lightweight searchable dropdown (combobox) styled to match the admin form fields.
// The trigger itself is the search input — typing filters the list inline.
// Props: value, onChange(value), options [{ value, label, code? }], placeholder,
//        searchPlaceholder, disabled, dropUp (open the list upward).
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Выберите',
  searchPlaceholder = 'Поиск...',
  className = '',
  disabled = false,
  dropUp = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value)) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur(); } };
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

  const Flag = ({ code }) => {
    if (!code) return null;
    const F = Flags[String(code).toUpperCase()];
    return F ? <F className="searchable-select-flag" /> : null;
  };

  const openMenu = () => { if (!disabled) { setOpen(true); setQuery(''); } };

  return (
    <div
      ref={rootRef}
      className={`searchable-select ${open ? 'is-open' : ''} ${dropUp ? 'is-up' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
    >
      <div
        className="searchable-select-control"
        onClick={() => { if (!open) openMenu(); inputRef.current?.focus(); }}
      >
        {selected && <Flag code={selected.code} />}
        <input
          ref={inputRef}
          type="text"
          className="searchable-select-input"
          disabled={disabled}
          autoComplete="off"
          value={open ? query : (selected ? selected.label : '')}
          placeholder={selected ? selected.label : placeholder}
          onFocus={openMenu}
          onChange={(e) => { setOpen(true); setQuery(e.target.value); }}
        />
        <span
          className={`searchable-select-chevron${open ? ' is-open' : ''}`}
          aria-hidden="true"
          onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); setQuery(''); }}
        >
          ▾
        </span>
      </div>
      {open && (
        <div className="searchable-select-menu">
          <div className="searchable-select-list" role="listbox">
            {filtered.length === 0 ? (
              <div className="searchable-select-empty">Ничего не найдено</div>
            ) : (
              filtered.map((o) => (
                <button
                  type="button"
                  key={String(o.value)}
                  className={`searchable-select-item${String(o.value) === String(value) ? ' is-active' : ''}`}
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(''); inputRef.current?.blur(); }}
                >
                  <Flag code={o.code} />
                  <span className="searchable-select-item-label">{o.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
