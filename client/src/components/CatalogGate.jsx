import React, { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Catalog = lazy(() => import('../pages/Catalog'));

function CatalogGate() {
  const { user, loading, isBlocked, supportUsername } = useAuth();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Загрузка...</span>
        </div>
      </div>
    );
  }

  // Show blocked page
  if (isBlocked) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '100vh', padding: '20px', backgroundColor: '#f8f9fa' }}>
        <div className="text-center" style={{ maxWidth: '400px' }}>
          <div style={{ fontSize: '80px', marginBottom: '20px' }}>🚫</div>
          <h2 className="mb-3" style={{ color: '#dc3545' }}>Аккаунт заблокирован</h2>
          <p className="text-muted mb-4">
            Ваш аккаунт был заблокирован. Для разблокировки обратитесь к администратору.
          </p>
          <div className="p-3 bg-white rounded shadow-sm">
            <p className="mb-2"><strong>Связаться с администратором:</strong></p>
            <a 
              href={`https://t.me/${supportUsername}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              📱 @{supportUsername}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Suspense fallback={(
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Загрузка...</span>
        </div>
      </div>
    )}
    >
      <Catalog />
    </Suspense>
  );
}

export default CatalogGate;


