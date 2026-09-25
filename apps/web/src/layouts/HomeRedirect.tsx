import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

export function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/staff/order'} replace />;
}
