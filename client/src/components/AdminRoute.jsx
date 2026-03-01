import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageSkeleton } from './SkeletonUI';

function AdminRoute({ children }) {
  const { user, loading, isOperator } = useAuth();

  if (loading) {
    return <PageSkeleton fullscreen label="Проверка прав администратора" cards={7} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Allow superadmin and operator roles
  if (!isOperator()) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default AdminRoute;
