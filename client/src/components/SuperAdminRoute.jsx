import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageSkeleton } from './SkeletonUI';

function SuperAdminRoute({ children }) {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return <PageSkeleton fullscreen label="Проверка прав супер-админа" cards={8} />;
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


