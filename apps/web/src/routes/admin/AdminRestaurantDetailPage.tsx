import { useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import {
  ApiError,
  useActiveCrawlJobStore,
  useCancelCrawl,
  useCancelSummary,
  useDeleteRestaurant,
  useRestaurantByPlaceId,
  useRestaurantCanonicalSummaryEvents,
  useRestaurantPublic,
  useRestaurantPublicInsights,
  useResumeSummary,
  useStartCrawl,
} from '@repo/shared';
import type { CrawlModeType, RestaurantDetailType } from '@repo/api-contract';
import { Card, CardContent } from '~/components/ui/card';
import { ActiveJobPanel } from '~/components/restaurant/ActiveJobPanel';
import { MenuRankingSection } from '~/components/restaurant/MenuRankingSection';
import { RestaurantCrawlLogsSection } from '~/components/restaurant/RestaurantCrawlLogsSection';
import { SummaryProgressSection } from '~/components/restaurant/sections';
import { AskTab } from '~/components/restaurant/detail/AskTab';
import { HomeTab } from '~/components/restaurant/detail/HomeTab';
import { InfoTab } from '~/components/restaurant/detail/InfoTab';
import { InsightsTab } from '~/components/restaurant/detail/InsightsTab';
import { MenuTab } from '~/components/restaurant/detail/MenuTab';
import { PhotosTab } from '~/components/restaurant/detail/PhotosTab';
import { TourTab } from '~/components/restaurant/detail/TourTab';
import type { TabKey } from '~/components/restaurant/detail/tabs';
import { TourEvidenceSection } from '~/components/admin/tour/TourEvidencePanel';
import { AdminDetailHeader } from '~/components/admin/restaurant-detail/AdminDetailHeader';
import { AdminLocationAside } from '~/components/admin/restaurant-detail/AdminLocationAside';
import { AdminRawInfo } from '~/components/admin/restaurant-detail/AdminRawInfo';
import {
  AdminReviewsTab,
  type ReviewFilter,
} from '~/components/admin/restaurant-detail/AdminReviewsTab';
import {
  ADMIN_DETAIL_TABS,
  PUBLIC_TABS_IN_ADMIN,
  isAdminDetailTab,
  type AdminDetailTabKey,
} from '~/components/admin/restaurant-detail/tabs';
import { cn } from '~/lib/utils';

// 어드민 맛집 상세. 초기 상세의 운영 골격(진행 중 크롤·요약 카드 → 헤더의 업데이트/재크롤링/
// 삭제 → 우측 지도)은 그대로 두고, 본문을 공개 상세와 같은 탭 구성으로 바꿨다. 홈·분석·메뉴·
// 사진·정보·질문·여행자 탭은 공개 상세 탭 컴포넌트를 그대로 쓰고(사용자가 보는 화면 = 어드민이
// 보는 화면), 리뷰·로그는 어드민 전용이다. 리뷰·요약 진행은 같은 가게(canonical)의 모든 출처
// (네이버·다이닝코드·테이블링)를 합쳐 보여 준다. 탭은 URL ?tab= 로 유지된다.

export const AdminRestaurantDetailPage = () => {
  const { placeId } = useParams<{ placeId: string }>();
  if (!placeId) return <Navigate to="/admin/restaurants" replace />;
  // 식당이 바뀌면 탭 안 상태(팁/메뉴 필터·리뷰 필터·삭제 확인 등)를 통째로 초기화한다.
  return <AdminRestaurantDetail key={placeId} placeId={placeId} />;
};

const AdminRestaurantDetail = ({ placeId }: { placeId: string }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const detailQuery = useRestaurantByPlaceId(placeId);
  const detail = detailQuery.data ?? null;
  // 공개 탭들이 읽는 데이터 — 어드민 발견 화면처럼 공개 응답을 그대로 차용한다.
  const publicDetail = useRestaurantPublic(placeId);
  const insights = useRestaurantPublicInsights(placeId);
  // 출처 통합 요약 진행 — 리뷰 완료는 상세 캐시에 행 단위로 병합된다.
  const { progress } = useRestaurantCanonicalSummaryEvents(
    detail ? { placeId, canonicalId: detail.canonicalId } : null,
  );

  const startMutation = useStartCrawl();
  const cancelMutation = useCancelCrawl();
  const cancelSummaryMutation = useCancelSummary();
  const resumeSummaryMutation = useResumeSummary();
  const deleteMutation = useDeleteRestaurant();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 홈·분석·메뉴 탭에서 팁/메뉴를 누르면 리뷰 탭으로 넘기며 적용하는 필터(동시 1개).
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter | null>(null);
  // 탭 바로 앞 자리 — 탭을 바꿀 때 이미 그 아래로 내려가 있었으면 탭 바가 맨 위에 오게 되돌린다.
  const tabsAnchorRef = useRef<HTMLDivElement | null>(null);
  // Pull only the job whose placeId matches this page. Multiple jobs can be
  // running globally (different restaurants), but the detail page only cares
  // about its own. Returning the matched object directly keeps zustand's
  // default reference equality stable across unrelated job updates.
  const activeJob = useActiveCrawlJobStore((s) => {
    for (const j of Object.values(s.jobs)) {
      if (j.placeId === placeId) return j;
    }
    return null;
  });
  const addJob = useActiveCrawlJobStore((s) => s.add);
  const removeJob = useActiveCrawlJobStore((s) => s.remove);
  const markDoneJob = useActiveCrawlJobStore((s) => s.markDone);

  const hasTour = detail?.tour != null;
  const tabRaw = searchParams.get('tab');
  const requestedTab: AdminDetailTabKey = isAdminDetailTab(tabRaw) ? tabRaw : 'home';
  const tab: AdminDetailTabKey = requestedTab === 'tour' && !hasTour ? 'home' : requestedTab;

  const changeTab = (next: AdminDetailTabKey) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'home') params.delete('tab');
      else params.set('tab', next);
      return params;
    });
    const anchor = tabsAnchorRef.current;
    if (anchor) {
      // 어드민 상단바(h-14 = 56px) 아래에 탭 바가 붙는 위치.
      const top = anchor.getBoundingClientRect().top + window.scrollY - 56;
      if (window.scrollY > top) window.scrollTo({ top });
    }
  };

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
        </div>
      </div>
    );
  }
  if (detailQuery.isError || !detail) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          to="/admin/restaurants"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 목록
        </Link>
        <Card>
          <CardContent className="flex h-32 items-center justify-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            맛집을 찾을 수 없습니다.
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCrawl = async (mode: CrawlModeType) => {
    setError(null);
    try {
      const result = await startMutation.mutateAsync({ url: detail.rawSourceUrl, mode });
      if (result.ok) {
        // 재크롤은 네이버 행의 리뷰를 서버에서 cascade 삭제하므로 캐시의 네이버 리뷰 id 가
        // 전부 stale 해진다. 스트리밍 배치가 곧 사라질 행과 섞이지 않게 지금 비운다 — 같은
        // 가게의 다이닝코드·테이블링 리뷰는 그대로 둔다.
        if (mode === 'recrawl') {
          qc.setQueryData<RestaurantDetailType | null>(['restaurant', detail.placeId], (prev) =>
            prev ? { ...prev, reviews: prev.reviews.filter((r) => r.restaurantId !== prev.id) } : prev,
          );
        }
        addJob({
          jobId: result.jobId,
          placeId: detail.placeId,
          mode,
          source: 'list-row',
          name: detail.name,
        });
      } else {
        setError(`${result.error}: ${result.message}`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to start');
    }
  };

  const handleCancelJob = () => {
    if (activeJob) cancelMutation.mutate(activeJob.jobId);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    try {
      await deleteMutation.mutateAsync(detail.placeId);
      navigate('/admin/restaurants');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to delete');
      setConfirmDelete(false);
    }
  };

  const selectTip = (term: string) => {
    setReviewFilter({ kind: 'tip', value: term });
    changeTab('reviews');
  };
  const selectMenu = (name: string) => {
    setReviewFilter({ kind: 'menu', value: name });
    changeTab('reviews');
  };
  // 공개 홈 탭의 "○○ 전체 보기" — 어드민에 있는 탭이면 이동(가는 법은 홈 탭이 링크를 숨긴다).
  const openPublicTab = (next: TabKey) => {
    if (isAdminDetailTab(next)) changeTab(next);
  };

  const summaryInFlight = progress ? progress.queued + progress.pending + progress.running : 0;
  const failedCount =
    progress?.failed ?? detail.sources.reduce((sum, s) => sum + s.summaryFailed, 0);
  const tabs = ADMIN_DETAIL_TABS.filter((t) => t.key !== 'tour' || hasTour);

  // 공개 탭은 공개 상세 응답이 있어야 그린다 — 로딩·실패를 탭 자리에서 안내.
  const withPublic = (render: (d: NonNullable<typeof publicDetail.data>) => ReactNode): ReactNode => {
    if (publicDetail.data) return render(publicDetail.data);
    if (publicDetail.isError) {
      return (
        <div className="px-6 py-10 text-center text-sm text-destructive">
          공개 상세 정보를 불러오지 못했습니다.
        </div>
      );
    }
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  };

  const renderTab = (): ReactNode => {
    switch (tab) {
      case 'home':
        return withPublic((d) => (
          <HomeTab
            detail={d}
            insights={insights.data}
            insightsLoading={insights.isLoading}
            onChangeTab={openPublicTab}
            onSelectTip={selectTip}
            onSelectMenu={selectMenu}
            availableTabs={PUBLIC_TABS_IN_ADMIN}
          />
        ));
      case 'insights':
        return withPublic((d) => (
          <InsightsTab
            detail={d}
            insights={insights.data}
            insightsLoading={insights.isLoading}
            onSelectTip={selectTip}
            onSelectMenu={selectMenu}
          />
        ));
      case 'tour':
        return (
          <>
            {publicDetail.data?.tour && <TourTab placeId={placeId} detail={publicDetail.data} />}
            {detail.tour && (
              <div className={cn('p-4', publicDetail.data?.tour && 'border-t')}>
                <TourEvidenceSection tour={detail.tour} />
              </div>
            )}
          </>
        );
      case 'menu':
        return (
          <>
            {withPublic((d) => (
              <MenuTab placeId={placeId} detail={d} insights={insights.data} onSelectMenu={selectMenu} />
            ))}
            <div className="border-t p-4 sm:p-6">
              <MenuRankingSection placeId={placeId} />
            </div>
          </>
        );
      case 'reviews':
        return (
          <AdminReviewsTab
            placeId={placeId}
            canonicalId={detail.canonicalId}
            reviews={detail.reviews}
            filter={reviewFilter}
            onClearFilter={() => setReviewFilter(null)}
          />
        );
      case 'ask':
        return <AskTab placeId={placeId} restaurantName={detail.name} />;
      case 'photos':
        return withPublic((d) => <PhotosTab detail={d} />);
      case 'info':
        return (
          <>
            {withPublic((d) => (
              <InfoTab detail={d} />
            ))}
            <AdminRawInfo detail={detail} />
          </>
        );
      case 'logs':
        return (
          <div className="p-4 sm:p-6">
            <RestaurantCrawlLogsSection placeId={placeId} />
          </div>
        );
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-3 py-6 sm:px-6 sm:py-10 xl:max-w-7xl xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        {/* 진행 중 크롤 / 크롤 후에도 도는 AI 요약은 본문 정보(제목·별점·메타)
            보다 위로 — 들어오자마자 현재 상태가 가장 먼저 보이게.
            activeJob 이 있으면 ActiveJobPanel 내부에서 요약 진행도 함께 표시,
            크롤은 끝났는데 요약이 trailing 으로 도는 동안은 SummaryProgress 가
            이어받는다 (조건이 상호 배타라 둘이 동시에 뜨지 않음). 요약 진행은
            출처 통합(다이닝코드·테이블링 재수집으로 큐잉된 요약 포함). */}
        {activeJob && (
          <ActiveJobPanel
            // key=jobId — 재크롤로 jobId 가 바뀌면 패널을 새로 마운트 (내부
            // 완료 발화 ref / 로그 누적 리셋).
            key={activeJob.jobId}
            jobId={activeJob.jobId}
            placeId={detail.placeId}
            mode={activeJob.mode}
            onPlaceIdResolved={() => {}}
            onCancel={handleCancelJob}
            showInlineReviewList={false}
            // 종료 시 자동 제거 대신 'done' 표기 — 완료 카드를 유지하고 헤더
            // 버튼(업데이트/재크롤)을 다시 활성화한다. 상세 페이지라 "상세 보기"
            // 버튼은 두지 않고, X(onDismiss) 로 닫으면 trailing 요약 카드로 인계.
            onFinished={(result) => {
              if (result && !result.ok) {
                setError(`${result.error}: ${result.message}`);
              }
              markDoneJob(activeJob.jobId);
            }}
            onDismiss={() => removeJob(activeJob.jobId)}
            autoDismissOnSuccess
          />
        )}
        {!activeJob && progress && (summaryInFlight > 0 || progress.cancelled > 0) && (
          <Card>
            <CardContent className="py-4">
              <SummaryProgressSection
                status={progress}
                onCancel={() => {
                  if (
                    !window.confirm(
                      '이 가게(모든 출처)의 진행 중인 요약 작업을 중지하시겠습니까? 현재 청크는 끝까지 처리됩니다.',
                    )
                  ) {
                    return;
                  }
                  cancelSummaryMutation.mutate(detail.placeId);
                }}
                cancelPending={cancelSummaryMutation.isPending}
                onResume={() => {
                  if (!window.confirm('직전에 중지된 행만 다시 요약 큐에 올립니다. 진행하시겠습니까?')) {
                    return;
                  }
                  resumeSummaryMutation.mutate(detail.placeId);
                }}
                resumePending={resumeSummaryMutation.isPending}
              />
            </CardContent>
          </Card>
        )}

        <AdminDetailHeader
          detail={detail}
          failedCount={failedCount}
          crawlBusy={startMutation.isPending || (!!activeJob && activeJob.status === 'running')}
          confirmDelete={confirmDelete}
          deletePending={deleteMutation.isPending}
          error={error}
          onCrawl={(mode) => void handleCrawl(mode)}
          onDelete={() => void handleDelete()}
          onCancelDelete={() => setConfirmDelete(false)}
          onError={setError}
        />

        <div>
          <div ref={tabsAnchorRef} />
          {/* 탭 바 — 어드민 상단바(h-14) 아래에 붙는다. 탭이 많아 좁은 화면에선 가로 스크롤. */}
          <nav
            role="tablist"
            aria-label="맛집 상세 탭"
            className="sticky top-14 z-[5] flex overflow-x-auto rounded-t-xl border border-b-0 bg-background/95 backdrop-blur"
          >
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeTab(t.key)}
                  className={cn(
                    'relative flex-1 shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                  {t.key === 'reviews' && (
                    <span className="ml-1 text-xs tabular-nums text-muted-foreground">
                      {detail.reviews.length.toLocaleString()}
                    </span>
                  )}
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
          <Card className="overflow-hidden rounded-t-none" role="tabpanel">
            {renderTab()}
          </Card>
        </div>
      </div>

      <AdminLocationAside detail={detail} />
    </div>
  );
};
