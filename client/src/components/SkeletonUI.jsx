const repeat = (count) => Array.from({ length: count }, (_, index) => index);

export function SkeletonBlock({ className = '', style = {} }) {
  return <span className={`skeleton-block ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function PageSkeleton({
  fullscreen = false,
  label = 'Загрузка',
  headerWidth = '38%',
  subHeaderWidth = '22%',
  cards = 6
}) {
  return (
    <div className={`skeleton-shell ${fullscreen ? 'skeleton-shell-full' : ''}`.trim()} role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-header">
        <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: headerWidth }} />
        <SkeletonBlock className="skeleton-line skeleton-line-subtitle" style={{ width: subHeaderWidth }} />
      </div>
      <div className="skeleton-grid">
        {repeat(cards).map((index) => (
          <div key={`skeleton-card-${index}`} className="skeleton-card">
            <SkeletonBlock className="skeleton-line" style={{ width: `${68 + (index % 3) * 8}%` }} />
            <SkeletonBlock className="skeleton-line" style={{ width: `${44 + (index % 2) * 10}%` }} />
            <SkeletonBlock className="skeleton-line skeleton-line-small" style={{ width: `${32 + (index % 2) * 8}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 4, label = 'Загрузка списка' }) {
  return (
    <div className="skeleton-list" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {repeat(count).map((index) => (
        <div key={`skeleton-list-item-${index}`} className="skeleton-list-item">
          <SkeletonBlock className="skeleton-avatar" />
          <div className="skeleton-list-text">
            <SkeletonBlock className="skeleton-line" style={{ width: `${72 - index * 7}%` }} />
            <SkeletonBlock className="skeleton-line skeleton-line-small" style={{ width: `${46 - index * 4}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5, label = 'Загрузка таблицы' }) {
  return (
    <div className="skeleton-table" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-table-row skeleton-table-head">
        {repeat(columns).map((columnIndex) => (
          <SkeletonBlock key={`skeleton-table-head-${columnIndex}`} className="skeleton-line skeleton-line-small" />
        ))}
      </div>
      {repeat(rows).map((rowIndex) => (
        <div key={`skeleton-table-row-${rowIndex}`} className="skeleton-table-row">
          {repeat(columns).map((columnIndex) => (
            <SkeletonBlock
              key={`skeleton-table-cell-${rowIndex}-${columnIndex}`}
              className="skeleton-line"
              style={{ width: `${70 - (columnIndex % 3) * 10}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
