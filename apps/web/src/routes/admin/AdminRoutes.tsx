import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';

// 페이지별 lazy — 어드민 URL 하나를 열 때 그 페이지 청크만 받는다. 전부 정적 import 였을 땐 어느
// 화면이든 어드민 전체 + 지도 라이브러리(ol)를 받았다(2026-10 실측 919kB → 셸 22kB, 로그 화면 +13kB,
// 지도를 쓰는 화면만 +330~520kB). 로딩 폴백은 AdminLayout·AdminSettingsPage 가 Outlet 을 Suspense 로
// 감싸 본문 영역에만 띄운다(사이드바·설정 탭은 유지).
const AdminAiKeysPage = lazy(() => import('./AdminAiKeysPage').then((m) => ({ default: m.AdminAiKeysPage })));
const AdminAiTestPage = lazy(() => import('./AdminAiTestPage').then((m) => ({ default: m.AdminAiTestPage })));
const AdminAiUsagePage = lazy(() => import('./AdminAiUsagePage').then((m) => ({ default: m.AdminAiUsagePage })));
const AdminAnalyticsPage = lazy(() =>
  import('./AdminAnalyticsPage').then((m) => ({ default: m.AdminAnalyticsPage })),
);
const AdminAutoDiscoverPage = lazy(() =>
  import('./AdminAutoDiscoverPage').then((m) => ({ default: m.AdminAutoDiscoverPage })),
);
const AdminCatchtableShopPage = lazy(() =>
  import('./AdminCatchtableShopPage').then((m) => ({ default: m.AdminCatchtableShopPage })),
);
const AdminCatchtableTestPage = lazy(() =>
  import('./AdminCatchtableTestPage').then((m) => ({ default: m.AdminCatchtableTestPage })),
);
const AdminCrawlTestPage = lazy(() =>
  import('./AdminCrawlTestPage').then((m) => ({ default: m.AdminCrawlTestPage })),
);
const AdminDiningcodePage = lazy(() =>
  import('./AdminDiningcodePage').then((m) => ({ default: m.AdminDiningcodePage })),
);
const AdminDiningcodeShopPage = lazy(() =>
  import('./AdminDiningcodeShopPage').then((m) => ({ default: m.AdminDiningcodeShopPage })),
);
const AdminDiningcodeTestPage = lazy(() =>
  import('./AdminDiningcodeTestPage').then((m) => ({ default: m.AdminDiningcodeTestPage })),
);
const AdminDiscoverPage = lazy(() =>
  import('./AdminDiscoverPage').then((m) => ({ default: m.AdminDiscoverPage })),
);
const AdminFoodPage = lazy(() => import('./AdminFoodPage').then((m) => ({ default: m.AdminFoodPage })));
const AdminHomePage = lazy(() => import('./AdminHomePage').then((m) => ({ default: m.AdminHomePage })));
const AdminLogRunDetailPage = lazy(() =>
  import('./AdminLogRunDetailPage').then((m) => ({ default: m.AdminLogRunDetailPage })),
);
const AdminLogSettingsPage = lazy(() =>
  import('./AdminLogSettingsPage').then((m) => ({ default: m.AdminLogSettingsPage })),
);
const AdminLogsPage = lazy(() => import('./AdminLogsPage').then((m) => ({ default: m.AdminLogsPage })));
const AdminMapKeysPage = lazy(() => import('./AdminMapKeysPage').then((m) => ({ default: m.AdminMapKeysPage })));
const AdminQuotasPage = lazy(() => import('./AdminQuotasPage').then((m) => ({ default: m.AdminQuotasPage })));
const AdminRestaurantDetailPage = lazy(() =>
  import('./AdminRestaurantDetailPage').then((m) => ({ default: m.AdminRestaurantDetailPage })),
);
const AdminRestaurantsPage = lazy(() =>
  import('./AdminRestaurantsPage').then((m) => ({ default: m.AdminRestaurantsPage })),
);
const AdminReviewSearchPage = lazy(() =>
  import('./AdminReviewSearchPage').then((m) => ({ default: m.AdminReviewSearchPage })),
);
const AdminSettingsPage = lazy(() =>
  import('./AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })),
);
const AdminMenuBoardPage = lazy(() =>
  import('./AdminMenuBoardPage').then((m) => ({ default: m.AdminMenuBoardPage })),
);
const AdminTablingPage = lazy(() => import('./AdminTablingPage').then((m) => ({ default: m.AdminTablingPage })));
const AdminTablingTestPage = lazy(() =>
  import('./AdminTablingTestPage').then((m) => ({ default: m.AdminTablingTestPage })),
);
const AdminTelegramPage = lazy(() =>
  import('./AdminTelegramPage').then((m) => ({ default: m.AdminTelegramPage })),
);
const AdminTourPage = lazy(() => import('./AdminTourPage').then((m) => ({ default: m.AdminTourPage })));

// 어드민 서브트리의 라우트 표 — App.tsx 가 React.lazy 로 1회 import 한다. 이 모듈에는 셸(AdminLayout)과
// 라우트 표만 남기고 페이지는 위처럼 각자 청크로 뺐다.
//
// App.tsx 에 path="/admin/*" 로 마운트되므로 여기 path 는 모두 /admin 기준 상대
// 경로다 (index === /admin). Navigate 의 target 만 절대 경로 유지(옛 북마크 호환).
const AdminRoutes = () => (
  <Routes>
    <Route element={<AdminLayout />}>
      <Route index element={<AdminHomePage />} />
      <Route path="discover" element={<AdminDiscoverPage />} />
      <Route path="auto-discover" element={<AdminAutoDiscoverPage />} />
      <Route path="tour" element={<AdminTourPage />} />
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
      <Route path="food" element={<AdminFoodPage />} />
      <Route path="ai-usage" element={<AdminAiUsagePage />} />
      <Route path="logs" element={<AdminLogsPage />} />
      <Route path="logs/:runId" element={<AdminLogRunDetailPage />} />
      <Route path="ai-test" element={<AdminAiTestPage />} />
      <Route path="menu-board" element={<AdminMenuBoardPage />} />
      {/* review-search 정식 도메인 (DB 영속) */}
      <Route path="review-search" element={<AdminReviewSearchPage />} />
      {/* /admin/ai-keys 로 들어와도 신규 위치로 보낸다 — 옛 북마크 호환. */}
      <Route path="ai-keys" element={<Navigate to="/admin/settings/ai-keys" replace />} />
      <Route path="settings" element={<AdminSettingsPage />}>
        <Route index element={<Navigate to="ai-keys" replace />} />
        <Route path="ai-keys" element={<AdminAiKeysPage />} />
        <Route path="map" element={<AdminMapKeysPage />} />
        <Route path="telegram" element={<AdminTelegramPage />} />
        <Route path="logs" element={<AdminLogSettingsPage />} />
        <Route path="quotas" element={<AdminQuotasPage />} />
      </Route>
    </Route>
  </Routes>
);

export default AdminRoutes;
