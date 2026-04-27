import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@repo/shared';
import { HomePage } from './routes/HomePage';
import { LoginPage } from './routes/LoginPage';
import { PicksPage } from './routes/PicksPage';

const RequireSession = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((s) => s.token);
  const isGuest = useAuthStore((s) => s.isGuest);
  if (!token && !isGuest) return <Navigate to="/login" replace />;
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
  </Routes>
);
