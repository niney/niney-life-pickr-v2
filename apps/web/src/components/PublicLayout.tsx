import { Suspense, useCallback, useMemo, useState } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { PublicSidebar } from './PublicSidebar';
import { PublicTopBar } from './PublicTopBar';

// 페이지가 PublicTopBar 아래에 sticky 로 한 몸인 두 번째 row 를 주입하고
// 통합된 header 의 실측 높이를 받기 위한 outlet context.
//   - setSubBar(node): subBar 컨텐츠 등록. unmount 시 null 로 cleanup.
//   - headerHeight: TopBar(h-14) + subBar 의 실측 px 합 (ResizeObserver).
//     시트의 topOffset 계산 등에 사용.
export interface PublicLayoutContext {
  setSubBar: (node: React.ReactNode) => void;
  headerHeight: number;
}

export const usePublicLayout = (): PublicLayoutContext =>
  useOutletContext<PublicLayoutContext>();

export const PublicLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subBar, setSubBarState] = useState<React.ReactNode>(null);
  // 초기값 56(h-14). PublicTopBar 의 useLayoutEffect 가 마운트 직후 실제값으로 덮어씀.
  const [headerHeight, setHeaderHeight] = useState(56);

  // useState setter 자체는 stable 하지만, outlet context 객체를 안정화하기
  // 위해 useCallback 한 번 더 감싸 deps 명확화.
  const setSubBar = useCallback((node: React.ReactNode) => {
    setSubBarState(node);
  }, []);

  // context 객체는 headerHeight 가 바뀔 때만 새로 — 자식이 불필요하게 re-render
  // 되지 않도록.
  const layoutCtx = useMemo<PublicLayoutContext>(
    () => ({ setSubBar, headerHeight }),
    [setSubBar, headerHeight],
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-pretendard">
      <PublicTopBar
        onMenuClick={() => setSidebarOpen(true)}
        subBar={subBar}
        onHeightChange={setHeaderHeight}
      />
      <PublicSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1">
        {/* lazy 라우트 로드 중에도 TopBar/Sidebar 셸은 유지 — 본문만 fallback. */}
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
          <Outlet context={layoutCtx} />
        </Suspense>
      </main>
    </div>
  );
};
