import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore, useCurrentUser } from '@repo/shared';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminCrawlTestPage } from './routes/admin/AdminCrawlTestPage';
import { AdminHomePage } from './routes/admin/AdminHomePage';
import { AdminRestaurantsPage } from './routes/admin/AdminRestaurantsPage';
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

export const App = () => {
  // Hydrate user (incl. role) on mount when only token was restored from
  // localStorage — keeps HomePage's admin-link gate honest after reload.
  useCurrentUser();

  return (
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
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminHomePage />} />
        <Route path="restaurants" element={<AdminRestaurantsPage />} />
        <Route path="crawl-test" element={<AdminCrawlTestPage />} />
      </Route>
    </Routes>
  );
};
