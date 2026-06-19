import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { AdminAiKeysPage } from './AdminAiKeysPage';
import { AdminAiTestPage } from './AdminAiTestPage';
import { AdminAiUsagePage } from './AdminAiUsagePage';
import { AdminAnalyticsPage } from './AdminAnalyticsPage';
import { AdminAutoDiscoverPage } from './AdminAutoDiscoverPage';
import { AdminCatchtableShopPage } from './AdminCatchtableShopPage';
import { AdminCatchtableTestPage } from './AdminCatchtableTestPage';
import { AdminCrawlTestPage } from './AdminCrawlTestPage';
import { AdminDiningcodePage } from './AdminDiningcodePage';
import { AdminDiningcodeShopPage } from './AdminDiningcodeShopPage';
import { AdminDiningcodeTestPage } from './AdminDiningcodeTestPage';
import { AdminDiscoverPage } from './AdminDiscoverPage';
import { AdminHomePage } from './AdminHomePage';
import { AdminLogRunDetailPage } from './AdminLogRunDetailPage';
import { AdminLogSettingsPage } from './AdminLogSettingsPage';
import { AdminLogsPage } from './AdminLogsPage';
import { AdminMapKeysPage } from './AdminMapKeysPage';
import { AdminRestaurantDetailPage } from './AdminRestaurantDetailPage';
import { AdminRestaurantsPage } from './AdminRestaurantsPage';
import { AdminSettingsPage } from './AdminSettingsPage';
import { AdminTablingPage } from './AdminTablingPage';
import { AdminTablingTestPage } from './AdminTablingTestPage';
import { AdminTelegramPage } from './AdminTelegramPage';

// 어드민 서브트리 전체를 한 모듈로 모아 App.tsx 에서 React.lazy 로 1회만 import
// 하기 위한 컴포넌트. 어드민 16개 페이지 + OpenLayers(지도) 코드가 메인 번들에서
// 빠져, 공개 진입(익명 사용자)이 받는 첫 청크가 대폭 작아진다.
//
// App.tsx 에 path="/admin/*" 로 마운트되므로 여기 path 는 모두 /admin 기준 상대
// 경로다 (index === /admin). Navigate 의 target 만 절대 경로 유지(옛 북마크 호환).
const AdminRoutes = () => (
  <Routes>
    <Route element={<AdminLayout />}>
      <Route index element={<AdminHomePage />} />
      <Route path="discover" element={<AdminDiscoverPage />} />
      <Route path="auto-discover" element={<AdminAutoDiscoverPage />} />
      <Route path="restaurants" element={<AdminRestaurantsPage />} />
      <Route path="restaurants/:placeId" element={<AdminRestaurantDetailPage />} />
      <Route path="crawl-test" element={<AdminCrawlTestPage />} />
      <Route path="crawl-test/:jobId" element={<AdminCrawlTestPage />} />
      <Route path="catchtable-test" element={<AdminCatchtableTestPage />} />
      <Route path="catchtable-test/:shopRef" element={<AdminCatchtableShopPage />} />
      <Route path="diningcode-test" element={<AdminDiningcodeTestPage />} />
      <Route path="diningcode-test/:vRid" element={<AdminDiningcodeShopPage />} />
      <Route path="tabling-test" element={<AdminTablingTestPage />} />
      <Route path="diningcode" element={<AdminDiningcodePage />} />
      <Route path="diningcode/:vRid" element={<AdminDiningcodeShopPage />} />
      <Route path="tabling" element={<AdminTablingPage />} />
      <Route path="analytics" element={<AdminAnalyticsPage />} />
      <Route path="ai-usage" element={<AdminAiUsagePage />} />
      <Route path="logs" element={<AdminLogsPage />} />
      <Route path="logs/:runId" element={<AdminLogRunDetailPage />} />
      <Route path="ai-test" element={<AdminAiTestPage />} />
      {/* /admin/ai-keys 로 들어와도 신규 위치로 보낸다 — 옛 북마크 호환. */}
      <Route path="ai-keys" element={<Navigate to="/admin/settings/ai-keys" replace />} />
      <Route path="settings" element={<AdminSettingsPage />}>
        <Route index element={<Navigate to="ai-keys" replace />} />
        <Route path="ai-keys" element={<AdminAiKeysPage />} />
        <Route path="map" element={<AdminMapKeysPage />} />
        <Route path="telegram" element={<AdminTelegramPage />} />
        <Route path="logs" element={<AdminLogSettingsPage />} />
      </Route>
    </Route>
  </Routes>
);

export default AdminRoutes;
