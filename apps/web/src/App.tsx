import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { useAuthStore, useCurrentUser } from '@repo/shared';
import { useThemeStore } from './stores/theme';
import { ResummarizeToaster } from './components/ResummarizeToaster';
import { PublicLayout } from './components/PublicLayout';
import { HomePage } from './routes/HomePage';
import { LoginPage } from './routes/LoginPage';

// 코드 스플리팅 — 공개 진입(/, /login)과 레이아웃 셸만 메인 번들에 두고, 무거운
// 라우트는 React.lazy 로 분할한다. 어드민 서브트리 16개 페이지와 OpenLayers(ol)
// 지도를 끌어오는 식당/정산 페이지가 메인 청크에서 빠져, 익명 사용자가 받는 첫
// 청크가 대폭 작아진다. RestaurantDetailRoute 의 상세 탭 묶음(PublicRestaurantDetail
// → 8개 탭 + Lightbox)도 lazy — 부모(식당 목록 페이지)의 Outlet 을 자체 Suspense 로
// 감싸 목록을 깜빡이지 않고 상세 패널만 로딩 표시한다.
const RestaurantDetailRoute = lazy(() =>
  import('./routes/RestaurantDetailRoute').then((m) => ({ default: m.RestaurantDetailRoute })),
);
const RestaurantsPage = lazy(() =>
  import('./routes/RestaurantsPage').then((m) => ({ default: m.RestaurantsPage })),
);
const RestaurantsV2Page = lazy(() =>
  import('./routes/RestaurantsV2Page').then((m) => ({ default: m.RestaurantsV2Page })),
);
const SettlementHistoryPage = lazy(() =>
  import('./routes/settlement/SettlementHistoryPage').then((m) => ({
    default: m.SettlementHistoryPage,
  })),
);
const ContactsPage = lazy(() =>
  import('./routes/settlement/ContactsPage').then((m) => ({ default: m.ContactsPage })),
);
const SettlementNewPage = lazy(() =>
  import('./routes/settlement/SettlementNewPage').then((m) => ({ default: m.SettlementNewPage })),
);
const SettlementResultPage = lazy(() =>
  import('./routes/settlement/SettlementResultPage').then((m) => ({
    default: m.SettlementResultPage,
  })),
);
const SharedSettlementPage = lazy(() =>
  import('./routes/settlement/SharedSettlementPage').then((m) => ({
    default: m.SharedSettlementPage,
  })),
);
// 어드민 전체를 단일 lazy 청크로 — 진입 전엔 0바이트, 진입 시 한 번에 로드.
const AdminRoutes = lazy(() => import('./routes/admin/AdminRoutes'));

// lazy 청크 로딩 폴백 — 중앙 스피너. 페이지 자체 로딩 상태(예: SharedSettlementPage)와
// 같은 모양으로 맞춰, 청크 로드 → 데이터 로드 전환 시 화면이 튀지 않게 한다.
const PageFallback = () => (
  <main className="flex min-h-screen items-center justify-center">
    <Loader2 className="size-5 animate-spin text-muted-foreground" />
  </main>
);

// 인증된 사용자만 — 비로그인은 /login 으로 리다이렉트. role 검사는 안 함.
// (정산하기는 USER 도 사용 가능)
const RequireUser = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((s) => s.token);
  const cachedUser = useAuthStore((s) => s.user);
  const me = useCurrentUser();
  const role = me.data?.role ?? cachedUser?.role;

  if (!token) return <Navigate to="/login" replace />;
  if (me.isLoading && !cachedUser)
    return (
      <main className="container">
        <p>Loading…</p>
      </main>
    );
  if (role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
};

export const App = () => {
  // Hydrate user (incl. role) on mount when only token was restored from
  // localStorage — keeps HomePage's admin-link gate honest after reload.
  useCurrentUser();
  // 앱 테마(.dark 클래스 토글과 동일 소스)를 토스트에도 전달 — sonner 가
  // 다크/라이트 배경·텍스트를 맞춘다.
  const themeMode = useThemeStore((s) => s.mode);

  return (
    <>
      {/* 전역 토스트 — 단건 재요약 결과 등 일시적 피드백. richColors 로
          성공/에러 색 구분, 화면 하단 중앙. theme 로 다크/라이트 동기화. */}
      <Toaster position="bottom-center" richColors closeButton theme={themeMode} />
      {/* 진행 중 단건 재요약을 전역에서 지켜보다 완료 시 토스트 — 탭/페이지를
          떠나도 동작하도록 App 레벨에 상주. */}
      <ResummarizeToaster />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/restaurants" element={<RestaurantsPage />}>
              <Route path=":placeId" element={<RestaurantDetailRoute />} />
            </Route>
            {/* 모바일 시트 패턴 v2 — 데스크톱은 기존 3-column 동일, 모바일은 BottomSheet. */}
            <Route path="/restaurants-v2" element={<RestaurantsV2Page />}>
              <Route path=":placeId" element={<RestaurantDetailRoute />} />
            </Route>
            {/* 공유/SEO 대표 URL — 리스트/지도 없이 상세부터 바로 보여준다. */}
            <Route path="/r/:placeId" element={<RestaurantDetailRoute />} />
            <Route
              path="/me/settlements"
              element={
                <RequireUser>
                  <SettlementHistoryPage />
                </RequireUser>
              }
            />
            <Route
              path="/me/contacts"
              element={
                <RequireUser>
                  <ContactsPage />
                </RequireUser>
              }
            />
          </Route>
          <Route
            path="/restaurants/:placeId/settle/new"
            element={
              <RequireUser>
                <SettlementNewPage />
              </RequireUser>
            }
          />
          {/* 식당 없이 독립 진입 — Step2 의 차수 카드에서 1차 식당 검색 강제. */}
          <Route
            path="/me/settlements/new"
            element={
              <RequireUser>
                <SettlementNewPage />
              </RequireUser>
            }
          />
          <Route
            path="/restaurants/:placeId/settle/:id"
            element={
              <RequireUser>
                <SettlementResultPage />
              </RequireUser>
            }
          />
          {/* 저장된 정산 편집 — 같은 SettlementNewPage 가 id 받으면 edit 모드. */}
          <Route
            path="/restaurants/:placeId/settle/:id/edit"
            element={
              <RequireUser>
                <SettlementNewPage />
              </RequireUser>
            }
          />
          {/* 공유 토큰 read-only 보기 — 인증 불필요. PublicLayout 의 TopBar 도 띄우지
            않아 받는 사람이 단순히 결과만 보게 한다. 짧은 /s/:token 경로. */}
          <Route path="/s/:token" element={<SharedSettlementPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin/*"
            element={
              <RequireAdmin>
                <AdminRoutes />
              </RequireAdmin>
            }
          />
        </Routes>
      </Suspense>
    </>
  );
};
