const repeat = (count) => Array.from({ length: count }, (_, index) => index);

export function SkeletonBlock({ className = '', style = {} }) {
  return <span className={`skeleton-block ${className}`.trim()} style={style} aria-hidden="true" />;
}

function PageSkeletonLayout({ label, cards = 6, fullscreen = false, headerWidth = '38%', subHeaderWidth = '22%' }) {
  return (
    <div
      className={`skeleton-shell ${fullscreen ? 'skeleton-shell-full' : 'skeleton-shell-section'}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-header">
        <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: headerWidth }} />
        <SkeletonBlock className="skeleton-line skeleton-line-subtitle" style={{ width: subHeaderWidth }} />
      </div>
      <div className="skeleton-grid">
        {repeat(Math.max(1, cards)).map((index) => (
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

function ListSkeletonLayout({ label, count = 4, dense = false }) {
  const rows = Math.max(1, count);
  return (
    <div className="skeleton-shell skeleton-shell-section" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-header">
        <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: '34%' }} />
        <SkeletonBlock className="skeleton-line skeleton-line-subtitle" style={{ width: '20%' }} />
      </div>
      <div className={`skeleton-list${dense ? ' is-dense' : ''}`}>
        {repeat(rows).map((index) => (
          <div key={`skeleton-list-row-${index}`} className="skeleton-list-item">
            <SkeletonBlock className="skeleton-avatar" />
            <div className="skeleton-list-text">
              <SkeletonBlock className="skeleton-line" style={{ width: `${58 + (index % 4) * 8}%` }} />
              <SkeletonBlock className="skeleton-line skeleton-line-small" style={{ width: `${36 + (index % 3) * 10}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSkeletonLayout({ label, rows = 6, columns = 5 }) {
  const normalizedRows = Math.max(1, rows);
  const normalizedColumns = Math.max(1, columns);
  return (
    <div className="skeleton-shell skeleton-shell-section" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-header">
        <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: '38%' }} />
        <SkeletonBlock className="skeleton-line skeleton-line-subtitle" style={{ width: '24%' }} />
      </div>
      <div className="skeleton-table">
        <div
          className="skeleton-table-row skeleton-table-head"
          style={{ gridTemplateColumns: `repeat(${normalizedColumns}, minmax(0, 1fr))` }}
        >
          {repeat(normalizedColumns).map((cellIndex) => (
            <SkeletonBlock key={`skeleton-table-head-${cellIndex}`} className="skeleton-line skeleton-line-small" style={{ width: '72%' }} />
          ))}
        </div>
        {repeat(normalizedRows).map((rowIndex) => (
          <div
            key={`skeleton-table-row-${rowIndex}`}
            className="skeleton-table-row"
            style={{ gridTemplateColumns: `repeat(${normalizedColumns}, minmax(0, 1fr))` }}
          >
            {repeat(normalizedColumns).map((cellIndex) => (
              <SkeletonBlock
                key={`skeleton-table-cell-${rowIndex}-${cellIndex}`}
                className="skeleton-line"
                style={{ width: `${58 + ((rowIndex + cellIndex) % 4) * 10}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminDashboardSkeleton({ label = 'Загрузка панели управления' }) {
  return (
    <div className="skeleton-admin-shell" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <aside className="skeleton-admin-sidebar">
        <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: '72%' }} />
        <div className="skeleton-admin-nav">
          {repeat(8).map((index) => (
            <SkeletonBlock key={`skeleton-admin-nav-${index}`} className="skeleton-line" style={{ width: `${78 - (index % 3) * 8}%` }} />
          ))}
        </div>
      </aside>
      <div className="skeleton-admin-main">
        <div className="skeleton-admin-topbar">
          <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: '24%' }} />
          <div className="skeleton-admin-topbar-actions">
            <SkeletonBlock className="skeleton-line" style={{ width: 96 }} />
            <SkeletonBlock className="skeleton-line" style={{ width: 96 }} />
          </div>
        </div>
        <div className="skeleton-admin-cards">
          {repeat(4).map((index) => (
            <div key={`skeleton-admin-card-${index}`} className="skeleton-card">
              <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: `${52 + index * 6}%` }} />
              <SkeletonBlock className="skeleton-line" style={{ width: `${42 + (index % 2) * 16}%` }} />
            </div>
          ))}
        </div>
        <div className="skeleton-admin-table-wrap">
          <TableSkeletonLayout label={label} rows={6} columns={6} />
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton({
  fullscreen = false,
  label = 'Загрузка',
  headerWidth = '38%',
  subHeaderWidth = '22%',
  cards = 6
}) {
  return <PageSkeletonLayout label={label} cards={cards} fullscreen={fullscreen} headerWidth={headerWidth} subHeaderWidth={subHeaderWidth} />;
}

export function ListSkeleton({ count = 4, label = 'Загрузка списка', dense = false }) {
  return <ListSkeletonLayout label={label} count={count} dense={dense} />;
}

export function TableSkeleton({ rows = 6, columns = 5, label = 'Загрузка таблицы' }) {
  return <TableSkeletonLayout label={label} rows={rows} columns={columns} />;
}
