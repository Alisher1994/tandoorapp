import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();

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
    // Preserve token in URL when redirecting to login
    const token = searchParams.get('token');
    const loginUrl = token ? `/login?token=${token}` : '/login';
    return <Navigate to={loginUrl} replace />;
  }

  return children;
}

export default PrivateRoute;



