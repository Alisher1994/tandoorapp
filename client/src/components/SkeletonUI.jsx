const repeat = (count) => Array.from({ length: count }, (_, index) => index);

export function SkeletonBlock({ className = '', style = {} }) {
  return <span className={`skeleton-block ${className}`.trim()} style={style} aria-hidden="true" />;
}

function UnifiedSkeleton({ label, cards = 6, fullscreen = false, headerWidth = '38%', subHeaderWidth = '22%' }) {
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

export function PageSkeleton({
  fullscreen = false,
  label = 'Загрузка',
  headerWidth = '38%',
  subHeaderWidth = '22%',
  cards = 6
}) {
  return <UnifiedSkeleton label={label} cards={cards} fullscreen={fullscreen} headerWidth={headerWidth} subHeaderWidth={subHeaderWidth} />;
}

export function ListSkeleton({ count = 4, label = 'Загрузка списка' }) {
  const cards = Math.max(3, count);
  return <UnifiedSkeleton label={label} cards={cards} headerWidth="36%" subHeaderWidth="20%" />;
}

export function TableSkeleton({ rows = 6, columns = 5, label = 'Загрузка таблицы' }) {
  const cards = Math.max(4, Math.min(12, Math.ceil((rows * Math.max(1, columns)) / 5)));
  return <UnifiedSkeleton label={label} cards={cards} headerWidth="40%" subHeaderWidth="24%" />;
}
