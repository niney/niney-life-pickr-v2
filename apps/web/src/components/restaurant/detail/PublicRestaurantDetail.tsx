import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { ApiError, useRestaurantPublic, useRestaurantPublicInsights } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { HomeTab } from './HomeTab';
import { InfoTab } from './InfoTab';
import { MenuTab } from './MenuTab';
import { PhotosTab } from './PhotosTab';
import { ReviewsTab } from './ReviewsTab';
import { TAB_ORDER, type TabKey } from './tabs';

interface Props {
  placeId: string;
  onClose(): void;
}

// 식당 상세 패널. 헤더 + sticky 탭 바 + 활성 탭 컨텐츠. 데이터 fetch 는 여기서
// 한 번씩 (detail + insights) — 탭 전환은 컨텐츠만 바뀌고 추가 호출 없음.
//
// 탭 상태는 내부 useState. URL 까지는 안 가지지만, placeId 가 바뀌면 (다른
// 식당 클릭) 자동으로 'home' 으로 reset — 어떤 식당이든 첫 인상은 홈 탭.
export const PublicRestaurantDetail = ({ placeId, onClose }: Props) => {
  const detail = useRestaurantPublic(placeId);
  const insights = useRestaurantPublicInsights(placeId);
  const [tab, setTab] = useState<TabKey>('home');

  useEffect(() => {
    setTab('home');
  }, [placeId]);

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
          className="flex shrink-0 border-b bg-background"
        >
          {TAB_ORDER.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
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

      <div className="flex-1 overflow-y-auto">
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
            detail={detail.data}
            insights={insights.data}
            insightsLoading={insights.isLoading}
            onChangeTab={setTab}
          />
        ) : null}
      </div>
    </div>
  );
};

const ActiveTab = ({
  tab,
  detail,
  insights,
  insightsLoading,
  onChangeTab,
}: {
  tab: TabKey;
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
      return <ReviewsTab detail={detail} />;
    case 'photos':
      return <PhotosTab detail={detail} />;
    case 'info':
      return <InfoTab detail={detail} />;
  }
};
