import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigationType,
  type Location,
} from 'react-router-dom';
import { useIsDesktopLg } from '~/lib/useMediaQuery';
import { MealHomePage } from './MealHomePage';
import { MealPageHeader } from './MealPageHeader';
import { MealLoading, MealShell } from './MealShell';
import { MealSurface } from './MealSurface';
import {
  MealFrameContext,
  MealPanelEnvContext,
  mealPanelStateOf,
  notifyMealLocationCommitted,
  type MealFrame,
} from './mealPanel';
import { MEAL_PATH, mealEntryIdOf, mealPanelKindOf } from './mealPaths';

// 식단 하위 사이트(/meal/*) — 어드민처럼 한 덩어리로 늦게 부르고(App.tsx), 그 안에서 셸 + 홈은 바로, 나머지 화면은
// 들어갈 때 부른다. 주소: 홈 /meal · 기록 /meal/records · 달력 /meal/calendar · 통계 /meal/stats · 영양 /meal/nutrition ·
// 추천 /meal/recommend · 설정 /meal/settings · 입력 /meal/new · 상세 /meal/:id · 수정 /meal/:id/edit.
//
// 데스크톱(1024px~)에서 상세·수정·새 기록을 배경 위치와 함께 열면(mealPanel) 배경 화면을 셸에 그대로 두고 그 위에 패널을
// 띄운다. 수정·새 기록 패널은 모달이라 뒤 화면을 inert 로 막는다.

const MealRecordsPage = lazy(() =>
  import('./MealPage').then((m) => ({ default: m.MealRecordsPage })),
);
const MealCalendarPage = lazy(() =>
  import('./MealPage').then((m) => ({ default: m.MealCalendarPage })),
);
const MealStatsPage = lazy(() => import('./MealPage').then((m) => ({ default: m.MealStatsPage })));
const MealNutritionTab = lazy(() =>
  import('./MealNutritionTab').then((m) => ({ default: m.MealNutritionTab })),
);
const MealRecommendTab = lazy(() =>
  import('./MealRecommendTab').then((m) => ({ default: m.MealRecommendTab })),
);
const MealPreferenceTab = lazy(() =>
  import('./MealPreferenceTab').then((m) => ({ default: m.MealPreferenceTab })),
);
const MealNewPage = lazy(() =>
  import('./MealEntryFormPage').then((m) => ({ default: m.MealNewPage })),
);
const MealEditPage = lazy(() =>
  import('./MealEntryFormPage').then((m) => ({ default: m.MealEditPage })),
);
const MealDetailPage = lazy(() =>
  import('./MealDetailPage').then((m) => ({ default: m.MealDetailPage })),
);

const MealNutritionPage = () => (
  <>
    <MealPageHeader title="영양" group="analysis" />
    <MealNutritionTab />
  </>
);

const MealRecommendPage = () => (
  <>
    <MealPageHeader title="추천" />
    <MealRecommendTab />
  </>
);

const MealSettingsPage = () => (
  <>
    <MealPageHeader title="설정" />
    <MealPreferenceTab />
  </>
);

const DETAIL_FRAME: MealFrame = { type: 'panel', kind: 'detail' };
const FORM_FRAME: MealFrame = { type: 'panel', kind: 'form' };

const MealPanelRoute = ({ kind, children }: { kind: 'detail' | 'form'; children: ReactNode }) => (
  <MealFrameContext.Provider value={kind === 'detail' ? DETAIL_FRAME : FORM_FRAME}>
    <Suspense
      fallback={
        <MealSurface title="불러오는 중" fallback={{ to: MEAL_PATH.home, label: '식단 홈' }}>
          <MealLoading />
        </MealSurface>
      }
    >
      {children}
    </Suspense>
  </MealFrameContext.Provider>
);

// 화면을 바꿀 때의 스크롤 — BrowserRouter 는 스크롤을 맞춰 주지 않는다(데이터 라우터의 ScrollRestoration 이 없다).
// 새 화면(밀어 넣기·바꾸기)은 맨 위에서, 뒤로·앞으로는 그 화면에서 보던 자리로. 패널을 열고 닫을 때는 뒤 화면을 그대로 둔다.
// 보던 자리는 스크롤할 때와 누르기 직전(이동하기 전)에 지금 그려진 화면의 키로 적는다 — 화면이 바뀐 뒤에 읽으면 짧아진
// 화면에 잘린 값이다. 브라우저의 자동 복원은 끈다(React 가 그리기 전에 짧은 화면에서 복원해 버린다).
const scrollMemory = new Map<string, number>();

const useMealScroll = (location: Location, background: Location | null): void => {
  const navigationType = useNavigationType();
  const shownKey = useRef(location.key);
  const shownBackgroundKey = useRef<string | null>(null);
  useEffect(() => {
    const before = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const save = () => scrollMemory.set(shownKey.current, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('click', save, { capture: true });
    return () => {
      window.history.scrollRestoration = before;
      window.removeEventListener('scroll', save);
      window.removeEventListener('click', save, { capture: true });
    };
  }, []);
  useLayoutEffect(() => {
    // 패널이 떠 있는 동안 스크롤하는 건 뒤 화면이다 — 그 화면의 키로 적는다.
    shownKey.current = background?.key ?? location.key;
    // 패널을 닫아 그 배경으로 돌아온 것이면 뒤 화면은 그대로다(패널이 떠 있는 동안 스크롤했을 수도 있다).
    const closedPanel = shownBackgroundKey.current === location.key;
    shownBackgroundKey.current = background?.key ?? null;
    notifyMealLocationCommitted();
    if (background || closedPanel) return;
    const saved = navigationType === 'POP' ? scrollMemory.get(location.key) : 0;
    if (saved !== undefined) window.scrollTo(0, saved);
    // 위치가 바뀔 때만 — 배경·이동 방식은 그 위치에 딸린 값이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
};

// 처음 여는 상세·입력 화면이 조각을 받느라 늦지 않게, 식단에 들어오면 한가할 때 미리 받아 둔다(화면 전환·패널이 바로 열린다).
const usePrefetchEntryScreens = (): void => {
  useEffect(() => {
    const load = () => {
      void import('./MealDetailPage');
      void import('./MealEntryFormPage');
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(load, 1500);
    return () => window.clearTimeout(id);
  }, []);
};

export default function MealApp() {
  const location = useLocation();
  const panelsOn = useIsDesktopLg();
  const kind = mealPanelKindOf(location.pathname);
  const panelState = mealPanelStateOf(location);
  const background = panelsOn && kind && panelState ? panelState.mealBackground : null;
  const openEntryId = background ? mealEntryIdOf(location.pathname) : null;
  const env = useMemo(
    () => ({ panelsOn, background, openEntryId }),
    [panelsOn, background, openEntryId],
  );
  useMealScroll(location, background);
  usePrefetchEntryScreens();

  return (
    <MealPanelEnvContext.Provider value={env}>
      <div className="meal-app meal-page">
        <div inert={background !== null && kind === 'form'}>
          <Routes location={background ?? location}>
            <Route element={<MealShell />}>
              <Route index element={<MealHomePage />} />
              <Route path="records" element={<MealRecordsPage />} />
              <Route path="calendar" element={<MealCalendarPage />} />
              <Route path="stats" element={<MealStatsPage />} />
              <Route path="nutrition" element={<MealNutritionPage />} />
              <Route path="recommend" element={<MealRecommendPage />} />
              <Route path="settings" element={<MealSettingsPage />} />
              <Route path="new" element={<MealNewPage />} />
              <Route path=":id" element={<MealDetailPage />} />
              <Route path=":id/edit" element={<MealEditPage />} />
              <Route path="*" element={<Navigate to="/meal" replace />} />
            </Route>
          </Routes>
        </div>
        {background ? (
          <Routes>
            <Route
              path="new"
              element={
                <MealPanelRoute kind="form">
                  <MealNewPage />
                </MealPanelRoute>
              }
            />
            <Route
              path=":id/edit"
              element={
                <MealPanelRoute kind="form">
                  <MealEditPage />
                </MealPanelRoute>
              }
            />
            <Route
              path=":id"
              element={
                <MealPanelRoute kind="detail">
                  <MealDetailPage />
                </MealPanelRoute>
              }
            />
          </Routes>
        ) : null}
      </div>
    </MealPanelEnvContext.Provider>
  );
}
