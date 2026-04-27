import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@repo/shared';
import { HomePage } from './routes/HomePage';
import { LoginPage } from './routes/LoginPage';
import { PicksPage } from './routes/PicksPage';

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export const App = () => (
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route
      path="/picks"
      element={
        <RequireAuth>
          <PicksPage />
        </RequireAuth>
      }
    />
  </Routes>
);
