import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';

// Small (i) info badge with a popover, used next to form labels to replace
// always-visible hint text. Reuses the unified ".admin-printer-info-btn" style.
export default function FieldInfo({ text, placement = 'top', ariaLabel = 'Подсказка' }) {
  if (!text) return null;
  return (
    <OverlayTrigger
      trigger={['hover', 'focus', 'click']}
      rootClose
      placement={placement}
      overlay={(
        <Popover className="admin-printer-hint-popover">
          <Popover.Body className="small mb-0">{text}</Popover.Body>
        </Popover>
      )}
    >
      <button type="button" className="admin-printer-info-btn" aria-label={ariaLabel}>i</button>
    </OverlayTrigger>
  );
}
