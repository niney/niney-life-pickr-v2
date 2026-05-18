import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { ApiError, useRestaurantPublic, useRestaurantPublicInsights } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { HomeTab } from './HomeTab';
import { InfoTab } from './InfoTab';
import { InsightsTab } from './InsightsTab';
import { MenuTab } from './MenuTab';
import { PhotosTab } from './PhotosTab';
import { ReviewsTab } from './ReviewsTab';
import { TAB_ORDER, type TabKey } from './tabs';

interface Props {
  placeId: string;
  onClose(): void;
  // 라우트 기반 사용처(공개 /restaurants/:placeId)에서 URL ?tab= 과 sync 하기
  // 위한 controlled 모드. 미지정 시 내부 state 로 동작 (admin 사이드 패널 등).
  tab?: TabKey;
  onChangeTab?(next: TabKey): void;
}

// 식당 상세 패널. 헤더 + sticky 탭 바 + 활성 탭 컨텐츠. 데이터 fetch 는 여기서
// 한 번씩 (detail + insights) — 탭 전환은 컨텐츠만 바뀌고 추가 호출 없음.
//
// 탭은 uncontrolled 기본: placeId 가 바뀌면 자동으로 'home' 으로 reset.
// controlled 모드(tab/onChangeTab 주입) 일 땐 부모가 URL 동기화·reset 책임.
export const PublicRestaurantDetail = ({
  placeId,
  onClose,
  tab: tabProp,
  onChangeTab: onChangeTabProp,
}: Props) => {
  const detail = useRestaurantPublic(placeId);
  const insights = useRestaurantPublicInsights(placeId);
  const [internalTab, setInternalTab] = useState<TabKey>('home');
  const tab = tabProp ?? internalTab;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (tabProp === undefined) setInternalTab('home');
  }, [placeId, tabProp]);

  // 탭 변경 시 스크롤을 맨 위로.
  // - admin 패널 / xl+ 컬럼: 본문 div 가 자체 scroll → scrollRef 안에서 top
  // - 모바일 라우트: 페이지(body) 스크롤 → window 로 top
  // scrollHeight 로 자체 scroll 여부 판단해 자동 분기.
  const handleChangeTab = useCallback(
    (next: TabKey) => {
      if (onChangeTabProp) onChangeTabProp(next);
      else setInternalTab(next);
      const el = scrollRef.current;
      if (el && el.scrollHeight > el.clientHeight + 1) {
        el.scrollTo({ top: 0 });
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
    },
    [onChangeTabProp],
  );

  const isNotFound =
    detail.isError &&
    detail.error instanceof ApiError &&
    detail.error.statusCode === 404;

  return (
    <div
      role="dialog"
      aria-label="식당 상세"
      className="flex h-full flex-col bg-background animate-in slide-in-from-left-4 fade-in duration-200"
    >
      {/* 식당명 헤더 + 탭바 묶음 sticky.
          본문 div 밖, detail 루트 직계 자식이라 containing block 이 detail
          루트(overflow:visible) → 모바일은 body 스크롤 기준 자연 sticky.
          top-0 으로 통일 — PublicLayout 이 모바일 상세에서 PublicTopBar 를
          숨기므로 화면 최상단에 stick. xl+/admin 은 부모 aside 가 이미
          헤더 아래 위치라 그 안에서 top-0 이 자연스럽게 그 시작점에 stick. */}
      <div className="sticky top-0 z-10 bg-background">
        <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="gap-1"
            aria-label="목록으로"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">목록</span>
          </Button>
          <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold">
            {detail.data?.name ?? '식당 상세'}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="size-4" />
          </Button>
        </header>

        {detail.data && (
          <nav
            role="tablist"
            aria-label="식당 정보 탭"
            className="flex border-b bg-background"
          >
            {TAB_ORDER.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleChangeTab(t.key)}
                  className={cn(
                    'relative flex-1 px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      'absolute inset-x-3 bottom-0 h-0.5 rounded-t bg-primary transition-opacity',
                      active ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </button>
              );
            })}
          </nav>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {detail.isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
          </div>
        ) : isNotFound ? (
          <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            요청한 식당을 찾을 수 없습니다.
          </div>
        ) : detail.isError ? (
          <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-destructive">
            상세 정보를 불러오지 못했습니다.
          </div>
        ) : detail.data ? (
          <ActiveTab
            tab={tab}
            placeId={placeId}
            detail={detail.data}
            insights={insights.data}
            insightsLoading={insights.isLoading}
            onChangeTab={handleChangeTab}
          />
        ) : null}
      </div>
    </div>
  );
};

const ActiveTab = ({
  tab,
  placeId,
  detail,
  insights,
  insightsLoading,
  onChangeTab,
}: {
  tab: TabKey;
  placeId: string;
  detail: NonNullable<ReturnType<typeof useRestaurantPublic>['data']>;
  insights: ReturnType<typeof useRestaurantPublicInsights>['data'];
  insightsLoading: boolean;
  onChangeTab(next: TabKey): void;
}) => {
  switch (tab) {
    case 'home':
      return (
        <HomeTab
          detail={detail}
          insights={insights}
          insightsLoading={insightsLoading}
          onChangeTab={onChangeTab}
        />
      );
    case 'menu':
      return <MenuTab detail={detail} insights={insights} />;
    case 'reviews':
      return <ReviewsTab placeId={placeId} detail={detail} />;
    case 'insights':
      return (
        <InsightsTab
          detail={detail}
          insights={insights}
          insightsLoading={insightsLoading}
        />
      );
    case 'photos':
      return <PhotosTab detail={detail} />;
    case 'info':
      return <InfoTab detail={detail} />;
  }
};
