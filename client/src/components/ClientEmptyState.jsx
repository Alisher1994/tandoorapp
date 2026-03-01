function ClientEmptyState({ emoji = '📦', message, subMessage = '' }) {
  return (
    <div className="client-empty-state text-center py-5">
      <div className="client-empty-state-emoji" aria-hidden="true">{emoji}</div>
      <p className="text-muted mt-3 mb-0 client-empty-state-message">{message}</p>
      {subMessage ? <p className="text-muted mt-2 mb-0 client-empty-state-submessage">{subMessage}</p> : null}
    </div>
  );
}

export default ClientEmptyState;
