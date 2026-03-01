import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageSkeleton } from './SkeletonUI';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageSkeleton fullscreen label="Проверка доступа" cards={6} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default PrivateRoute;


