import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore, useCurrentUser } from '@repo/shared';
import { AdminLayout } from './components/admin/AdminLayout';
import { PublicLayout } from './components/PublicLayout';
import { AdminAiKeysPage } from './routes/admin/AdminAiKeysPage';
import { AdminAiTestPage } from './routes/admin/AdminAiTestPage';
import { AdminAnalyticsPage } from './routes/admin/AdminAnalyticsPage';
import { AdminCatchtableShopPage } from './routes/admin/AdminCatchtableShopPage';
import { AdminCatchtableTestPage } from './routes/admin/AdminCatchtableTestPage';
import { AdminCrawlTestPage } from './routes/admin/AdminCrawlTestPage';
import { AdminDiningcodeShopPage } from './routes/admin/AdminDiningcodeShopPage';
import { AdminDiningcodeTestPage } from './routes/admin/AdminDiningcodeTestPage';
import { AdminDiscoverPage } from './routes/admin/AdminDiscoverPage';
import { AdminHomePage } from './routes/admin/AdminHomePage';
import { AdminMapKeysPage } from './routes/admin/AdminMapKeysPage';
import { AdminRestaurantDetailPage } from './routes/admin/AdminRestaurantDetailPage';
import { AdminRestaurantsPage } from './routes/admin/AdminRestaurantsPage';
import { AdminSettingsPage } from './routes/admin/AdminSettingsPage';
import { HomePage } from './routes/HomePage';
import { LoginPage } from './routes/LoginPage';
import { RestaurantDetailRoute } from './routes/RestaurantDetailRoute';
import { RestaurantsPage } from './routes/RestaurantsPage';

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
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/restaurants" element={<RestaurantsPage />}>
          <Route path=":placeId" element={<RestaurantDetailRoute />} />
        </Route>
      </Route>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminHomePage />} />
        <Route path="discover" element={<AdminDiscoverPage />} />
        <Route path="restaurants" element={<AdminRestaurantsPage />} />
        <Route path="restaurants/:placeId" element={<AdminRestaurantDetailPage />} />
        <Route path="crawl-test" element={<AdminCrawlTestPage />} />
        <Route path="crawl-test/:jobId" element={<AdminCrawlTestPage />} />
        <Route path="catchtable-test" element={<AdminCatchtableTestPage />} />
        <Route path="catchtable-test/:shopRef" element={<AdminCatchtableShopPage />} />
        <Route path="diningcode-test" element={<AdminDiningcodeTestPage />} />
        <Route path="diningcode-test/:vRid" element={<AdminDiningcodeShopPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="ai-test" element={<AdminAiTestPage />} />
        {/* /admin/ai-keys 로 들어와도 신규 위치로 보낸다 — 옛 북마크 호환. */}
        <Route path="ai-keys" element={<Navigate to="/admin/settings/ai-keys" replace />} />
        <Route path="settings" element={<AdminSettingsPage />}>
          <Route index element={<Navigate to="ai-keys" replace />} />
          <Route path="ai-keys" element={<AdminAiKeysPage />} />
          <Route path="map" element={<AdminMapKeysPage />} />
        </Route>
      </Route>
    </Routes>
  );
};
