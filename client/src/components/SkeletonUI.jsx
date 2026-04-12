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

function SuperAdminTabSkeletonFrame({ label, filterWidthSet = [], children }) {
  return (
    <div className="skeleton-shell skeleton-shell-section" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-header">
        <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: '30%' }} />
        <SkeletonBlock className="skeleton-line skeleton-line-subtitle" style={{ width: '18%' }} />
      </div>
      <div className="skeleton-superadmin-tab-filters">
        {filterWidthSet.map((width, index) => (
          <SkeletonBlock key={`sa-filter-${index}`} className="skeleton-line" style={{ width }} />
        ))}
      </div>
      {children}
    </div>
  );
}

export function SuperAdminRestaurantsSkeleton({ label = 'Загрузка списка магазинов' }) {
  return (
    <SuperAdminTabSkeletonFrame
      label={label}
      filterWidthSet={['160px', '210px', '180px', '170px', '140px']}
    >
      <div className="skeleton-superadmin-status-pills">
        {repeat(7).map((index) => (
          <SkeletonBlock key={`sa-rest-status-${index}`} className="skeleton-line" style={{ width: `${88 + (index % 3) * 12}px` }} />
        ))}
      </div>
      <div className="skeleton-table">
        <div className="skeleton-table-row skeleton-table-head" style={{ gridTemplateColumns: '90px 90px 2fr 1fr 1fr 1fr 1fr' }}>
          {repeat(7).map((cell) => (
            <SkeletonBlock key={`sa-rest-head-${cell}`} className="skeleton-line skeleton-line-small" style={{ width: '68%' }} />
          ))}
        </div>
        {repeat(8).map((row) => (
          <div key={`sa-rest-row-${row}`} className="skeleton-table-row" style={{ gridTemplateColumns: '90px 90px 2fr 1fr 1fr 1fr 1fr' }}>
            {repeat(7).map((cell) => (
              <SkeletonBlock key={`sa-rest-cell-${row}-${cell}`} className="skeleton-line" style={{ width: `${50 + ((row + cell) % 4) * 12}%` }} />
            ))}
          </div>
        ))}
      </div>
    </SuperAdminTabSkeletonFrame>
  );
}

export function SuperAdminOperatorsSkeleton({ label = 'Загрузка операторов', telemetry = false }) {
  const columnTemplate = telemetry
    ? '80px 1fr 1.2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 120px 120px'
    : '80px 1fr 1.2fr 1fr 1fr 1fr 140px 140px';
  const columnCount = telemetry ? 13 : 8;
  return (
    <SuperAdminTabSkeletonFrame
      label={label}
      filterWidthSet={['200px', '220px', '180px', '180px']}
    >
      <div className="skeleton-table">
        <div className="skeleton-table-row skeleton-table-head" style={{ gridTemplateColumns: columnTemplate }}>
          {repeat(columnCount).map((cell) => (
            <SkeletonBlock key={`sa-op-head-${cell}`} className="skeleton-line skeleton-line-small" style={{ width: '66%' }} />
          ))}
        </div>
        {repeat(7).map((row) => (
          <div key={`sa-op-row-${row}`} className="skeleton-table-row" style={{ gridTemplateColumns: columnTemplate }}>
            {repeat(columnCount).map((cell) => (
              <SkeletonBlock key={`sa-op-cell-${row}-${cell}`} className="skeleton-line" style={{ width: `${52 + ((row + cell) % 3) * 14}%` }} />
            ))}
          </div>
        ))}
      </div>
    </SuperAdminTabSkeletonFrame>
  );
}

export function SuperAdminClientsSkeleton({ label = 'Загрузка клиентов', telemetry = false }) {
  const columnTemplate = telemetry
    ? '1.4fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 120px 120px'
    : '1.4fr 1fr 1fr 1fr 1fr 1fr 1fr 120px 120px';
  const columnCount = telemetry ? 14 : 9;
  return (
    <SuperAdminTabSkeletonFrame
      label={label}
      filterWidthSet={['220px', '200px', '160px', '180px']}
    >
      <div className="skeleton-table">
        <div className="skeleton-table-row skeleton-table-head" style={{ gridTemplateColumns: columnTemplate }}>
          {repeat(columnCount).map((cell) => (
            <SkeletonBlock key={`sa-cust-head-${cell}`} className="skeleton-line skeleton-line-small" style={{ width: '66%' }} />
          ))}
        </div>
        {repeat(7).map((row) => (
          <div key={`sa-cust-row-${row}`} className="skeleton-table-row" style={{ gridTemplateColumns: columnTemplate }}>
            {repeat(columnCount).map((cell) => (
              <SkeletonBlock key={`sa-cust-cell-${row}-${cell}`} className="skeleton-line" style={{ width: `${48 + ((row + cell) % 4) * 12}%` }} />
            ))}
          </div>
        ))}
      </div>
    </SuperAdminTabSkeletonFrame>
  );
}

export function SuperAdminLogsSkeleton({ label = 'Загрузка журнала действий' }) {
  return (
    <SuperAdminTabSkeletonFrame
      label={label}
      filterWidthSet={['220px', '190px', '170px', '170px', '150px']}
    >
      <div className="skeleton-table">
        <div className="skeleton-table-row skeleton-table-head" style={{ gridTemplateColumns: '1fr 1.1fr 0.8fr 1fr 1.2fr 1fr 0.9fr' }}>
          {repeat(7).map((cell) => (
            <SkeletonBlock key={`sa-log-head-${cell}`} className="skeleton-line skeleton-line-small" style={{ width: '66%' }} />
          ))}
        </div>
        {repeat(8).map((row) => (
          <div key={`sa-log-row-${row}`} className="skeleton-table-row" style={{ gridTemplateColumns: '1fr 1.1fr 0.8fr 1fr 1.2fr 1fr 0.9fr' }}>
            {repeat(7).map((cell) => (
              <SkeletonBlock key={`sa-log-cell-${row}-${cell}`} className="skeleton-line" style={{ width: `${52 + ((row + cell) % 3) * 14}%` }} />
            ))}
          </div>
        ))}
      </div>
    </SuperAdminTabSkeletonFrame>
  );
}

export function SuperAdminAdsSkeleton({ label = 'Загрузка рекламных баннеров' }) {
  return (
    <SuperAdminTabSkeletonFrame
      label={label}
      filterWidthSet={['220px', '260px', '140px']}
    >
      <div className="skeleton-table">
        <div className="skeleton-table-row skeleton-table-head" style={{ gridTemplateColumns: '90px 1.4fr 1.1fr 1.2fr 0.9fr 0.9fr 1fr 120px' }}>
          {repeat(8).map((cell) => (
            <SkeletonBlock key={`sa-ads-head-${cell}`} className="skeleton-line skeleton-line-small" style={{ width: '66%' }} />
          ))}
        </div>
        {repeat(7).map((row) => (
          <div key={`sa-ads-row-${row}`} className="skeleton-table-row" style={{ gridTemplateColumns: '90px 1.4fr 1.1fr 1.2fr 0.9fr 0.9fr 1fr 120px' }}>
            {repeat(8).map((cell) => (
              <SkeletonBlock key={`sa-ads-cell-${row}-${cell}`} className="skeleton-line" style={{ width: `${52 + ((row + cell) % 3) * 14}%` }} />
            ))}
          </div>
        ))}
      </div>
    </SuperAdminTabSkeletonFrame>
  );
}

export function SuperAdminSecurityStatsSkeleton({ label = 'Загрузка статистики безопасности' }) {
  return (
    <SuperAdminTabSkeletonFrame
      label={label}
      filterWidthSet={['180px', '180px', '160px', '160px', '150px']}
    >
      <div className="skeleton-superadmin-stat-grid" style={{ marginBottom: 0 }}>
        {repeat(4).map((index) => (
          <div key={`sa-security-stat-${index}`} className="skeleton-card">
            <SkeletonBlock className="skeleton-line skeleton-line-small" style={{ width: `${46 + (index % 3) * 10}%` }} />
            <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: `${40 + (index % 2) * 18}%` }} />
            <SkeletonBlock className="skeleton-line" style={{ width: '58%' }} />
          </div>
        ))}
      </div>
    </SuperAdminTabSkeletonFrame>
  );
}

export function SuperAdminSecurityEventsSkeleton({ label = 'Загрузка событий безопасности' }) {
  return (
    <SuperAdminTabSkeletonFrame
      label={label}
      filterWidthSet={['180px', '180px', '180px', '170px', '150px', '150px']}
    >
      <div className="skeleton-table">
        <div className="skeleton-table-row skeleton-table-head" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 0.7fr 0.8fr 1.2fr 1.2fr 120px' }}>
          {repeat(9).map((cell) => (
            <SkeletonBlock key={`sa-security-head-${cell}`} className="skeleton-line skeleton-line-small" style={{ width: '66%' }} />
          ))}
        </div>
        {repeat(8).map((row) => (
          <div key={`sa-security-row-${row}`} className="skeleton-table-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 0.7fr 0.8fr 1.2fr 1.2fr 120px' }}>
            {repeat(9).map((cell) => (
              <SkeletonBlock key={`sa-security-cell-${row}-${cell}`} className="skeleton-line" style={{ width: `${50 + ((row + cell) % 4) * 12}%` }} />
            ))}
          </div>
        ))}
      </div>
    </SuperAdminTabSkeletonFrame>
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

export function SuperAdminDashboardSkeleton({ label = 'Загрузка панели супер-админа' }) {
  return (
    <div className="skeleton-superadmin-shell" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <aside className="skeleton-superadmin-sidebar">
        <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: '68%' }} />
        <div className="skeleton-superadmin-nav">
          {repeat(9).map((index) => (
            <SkeletonBlock key={`skeleton-superadmin-nav-${index}`} className="skeleton-line" style={{ width: `${80 - (index % 4) * 8}%` }} />
          ))}
        </div>
      </aside>
      <div className="skeleton-superadmin-main">
        <div className="skeleton-superadmin-topbar">
          <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: '28%' }} />
          <div className="skeleton-superadmin-topbar-actions">
            <SkeletonBlock className="skeleton-line" style={{ width: 86 }} />
            <SkeletonBlock className="skeleton-line" style={{ width: 86 }} />
            <SkeletonBlock className="skeleton-line" style={{ width: 120 }} />
          </div>
        </div>
        <div className="skeleton-superadmin-stat-grid">
          {repeat(6).map((index) => (
            <div key={`skeleton-superadmin-stat-${index}`} className="skeleton-card">
              <SkeletonBlock className="skeleton-line skeleton-line-title" style={{ width: `${46 + (index % 3) * 11}%` }} />
              <SkeletonBlock className="skeleton-line" style={{ width: `${34 + (index % 2) * 20}%` }} />
              <SkeletonBlock className="skeleton-line skeleton-line-small" style={{ width: '30%' }} />
            </div>
          ))}
        </div>
        <div className="skeleton-superadmin-table-wrap">
          <TableSkeletonLayout label={label} rows={7} columns={8} />
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
