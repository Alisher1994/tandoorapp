import React, { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function ServiceLockOverlay() {
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadState = async () => {
      try {
        const response = await fetch(`${API_URL}/service-control/state`, {
          headers: { 'Cache-Control': 'no-cache' },
          cache: 'no-store'
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) {
          setState(payload?.enabled === false ? payload : null);
        }
      } catch (error) {
        console.warn('Service lock state failed:', error);
      }
    };

    loadState();
    const intervalId = window.setInterval(loadState, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  if (!state) return null;

  return (
    <div className="service-lock-overlay" role="alertdialog" aria-modal="true">
      <div className="service-lock-modal">
        <div className="service-lock-badge">СЕРВИС ОГРАНИЧЕН</div>
        <h2>{state.title || 'Доступ временно ограничен'}</h2>
        <p>{state.message || 'Серверные услуги по проекту не оплачены.'}</p>
        {state.support_phone && (
          <div className="service-lock-phone">Контакт для оплаты: {state.support_phone}</div>
        )}
      </div>
    </div>
  );
}

export default ServiceLockOverlay;
