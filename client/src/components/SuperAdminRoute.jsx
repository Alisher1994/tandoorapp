import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function SuperAdminRoute({ children }) {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Загрузка...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Only allow superadmin role
  if (!isSuperAdmin()) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

export default SuperAdminRoute;


