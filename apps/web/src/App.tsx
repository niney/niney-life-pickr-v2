import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore, useCurrentUser } from '@repo/shared';
import { AdminPage } from './routes/AdminPage';
import { HomePage } from './routes/HomePage';
import { LoginPage } from './routes/LoginPage';
import { PicksPage } from './routes/PicksPage';

const RequireSession = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((s) => s.token);
  const isGuest = useAuthStore((s) => s.isGuest);
  if (!token && !isGuest) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((s) => s.token);
  const cachedUser = useAuthStore((s) => s.user);
  const me = useCurrentUser();
  const role = me.data?.role ?? cachedUser?.role;

  if (!token) return <Navigate to="/login" replace />;
  if (me.isLoading && !cachedUser) return <main className="container"><p>Loading…</p></main>;
  if (role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
};

export const App = () => (
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route
      path="/picks"
      element={
        <RequireSession>
          <PicksPage />
        </RequireSession>
      }
    />
    <Route
      path="/admin"
      element={
        <RequireAdmin>
          <AdminPage />
        </RequireAdmin>
      }
    />
  </Routes>
);
