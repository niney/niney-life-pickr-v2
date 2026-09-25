import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Database, Eye, ExternalLink, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  useInvalidateRestaurantDetailCaches,
  useSaveDiningcodeShop,
  useSaveTablingShop,
} from '@repo/shared';
import type { RestaurantDetailType, RestaurantSourceSummaryType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ReanalyzeFailedBadge } from '~/components/restaurant/ReanalyzeFailedBadge';
import { StoreInfoBadges } from '~/components/restaurant/detail/StoreInfoBadges';
import { TourMatchBadge } from '~/components/restaurant/detail/TourMatchBadge';
import { safeExternalHref } from '~/lib/utils';

// 어드민 상세 헤더 — 예전 상세의 헤더(목록 링크·이름·배지·별점/리뷰수/DB수·마지막 크롤·원본
// 링크·업데이트/재크롤링/삭제)를 그대로 두고, 출처 통합에 맞춰 출처 행(출처별 수치·재수집)과
// 요약 실패 재분석 배지, 공개 화면 링크를 더했다. 네이버 액션(업데이트·재크롤링)은 크롤 잡
// 흐름을 쓰는 페이지가 소유하고, 다이닝코드·테이블링 재수집은 동기 저장이라 여기서 처리한다.

const SOURCE_LABEL: Record<string, string> = {
  naver: '네이버',
  diningcode: '다이닝코드',
  tabling: '테이블링',
};
const SOURCE_BADGE_VARIANT: Record<string, 'green' | 'violet' | 'blue'> = {
  naver: 'green',
  diningcode: 'violet',
  tabling: 'blue',
};

const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

interface Props {
  detail: RestaurantDetailType;
  // 출처 통합 요약 실패 수 — SSE 진행이 있으면 그 값, 없으면 상세 응답의 출처 합.
  failedCount: number;
  // 크롤 잡이 도는 중이거나 시작 요청 중 — 업데이트/재크롤링 잠금.
  crawlBusy: boolean;
  confirmDelete: boolean;
  deletePending: boolean;
  error: string | null;
  onCrawl(mode: 'update' | 'recrawl'): void;
  onDelete(): void;
  onCancelDelete(): void;
  onError(message: string | null): void;
}

export const AdminDetailHeader = ({
  detail,
  failedCount,
  crawlBusy,
  confirmDelete,
  deletePending,
  error,
  onCrawl,
  onDelete,
  onCancelDelete,
  onError,
}: Props) => (
  <div>
    <Link
      to="/admin/restaurants"
      className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> 목록
    </Link>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{detail.name}</h1>
          {detail.category && (
            <span className="text-sm text-muted-foreground">{detail.category}</span>
          )}
          <StoreInfoBadges store={detail.store} />
          <TourMatchBadge tour={detail.tour} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {detail.rating !== null && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
              <Star className="size-3.5 fill-current text-amber-500" />
              {detail.rating}
            </span>
          )}
          {detail.reviewCount !== null && (
            <span className="text-sm text-foreground/80">
              리뷰 <span className="font-medium">{detail.reviewCount.toLocaleString()}</span>
            </span>
          )}
          <span className="text-sm text-foreground/80" title="출처 통합 저장 리뷰 수">
            DB <span className="font-medium">{detail.reviews.length.toLocaleString()}</span>
          </span>
          {failedCount > 0 && <ReanalyzeFailedBadge placeId={detail.placeId} count={failedCount} />}
          <span className="text-muted-foreground">
            마지막 크롤 {new Date(detail.lastCrawledAt).toLocaleString('ko-KR')}
          </span>
          <a
            href={safeExternalHref(detail.rawSourceUrl)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" /> 원본
          </a>
          <Link
            to={`/r/${encodeURIComponent(detail.placeId)}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            title="사용자에게 보이는 공개 상세를 새 탭으로"
          >
            <Eye className="size-3" /> 공개 화면
          </Link>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" variant="blue" size="sm" onClick={() => onCrawl('update')} disabled={crawlBusy}>
          업데이트
        </Button>
        <Button type="button" variant="amber" size="sm" onClick={() => onCrawl('recrawl')} disabled={crawlBusy}>
          <RefreshCw />
          재크롤링
        </Button>
        {confirmDelete ? (
          <>
            <Button type="button" variant="red" size="sm" onClick={onDelete} disabled={deletePending}>
              {deletePending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              정말 삭제
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelDelete}
              disabled={deletePending}
            >
              취소
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="red"
            size="sm"
            onClick={onDelete}
            aria-label="삭제"
            title="삭제"
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
    {detail.sources.length >= 2 && (
      <SourceRow placeId={detail.placeId} sources={detail.sources} onError={onError} />
    )}
    {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
  </div>
);

// 출처 행 — 같은 canonical 에 묶인 출처마다 별점·사이트 리뷰수·DB 리뷰수·요약 완료·수집일과
// 원본 링크. 다이닝코드·테이블링은 새 리뷰를 받아 AI 분석을 큐잉하는 재수집 버튼(목록 화면의
// "DC 재수집" 과 같은 API). 테이블링 미입점(place:) 행은 리뷰가 없어 재수집 대상이 아니다.
const SourceRow = ({
  placeId,
  sources,
  onError,
}: {
  placeId: string;
  sources: RestaurantSourceSummaryType[];
  onError(message: string | null): void;
}) => {
  const qc = useQueryClient();
  const invalidateDetailCaches = useInvalidateRestaurantDetailCaches();
  const saveDc = useSaveDiningcodeShop();
  const saveTabling = useSaveTablingShop();

  const afterRecollect = (label: string, newReviewCount: number) => {
    toast.success(`${label} 재수집 완료`, {
      description:
        newReviewCount > 0 ? `새 리뷰 ${newReviewCount}건 — AI 분석을 큐에 올렸어요.` : '새 리뷰가 없어요.',
    });
    // 새 리뷰가 상세 목록·출처 카운트·공개 탭 집계에 들어오게.
    void qc.invalidateQueries({ queryKey: ['restaurant', placeId], exact: true });
    void qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
    invalidateDetailCaches(placeId);
  };

  const recollect = async (s: RestaurantSourceSummaryType) => {
    onError(null);
    try {
      if (s.source === 'diningcode') {
        const res = await saveDc.mutateAsync(s.sourceId);
        afterRecollect('다이닝코드', res.newReviewCount);
      } else if (s.source === 'tabling') {
        const res = await saveTabling.mutateAsync(Number(s.sourceId));
        afterRecollect('테이블링', res.newReviewCount);
      }
    } catch (e) {
      onError(e instanceof ApiError ? e.message : `${SOURCE_LABEL[s.source] ?? s.source} 재수집 실패`);
    }
  };

  const busyFor = (s: RestaurantSourceSummaryType): boolean =>
    (s.source === 'diningcode' && saveDc.isPending && saveDc.variables === s.sourceId) ||
    (s.source === 'tabling' && saveTabling.isPending && saveTabling.variables === Number(s.sourceId));

  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="출처">
      {sources.map((s) => {
        const canRecollect =
          s.source === 'diningcode' || (s.source === 'tabling' && /^\d+$/.test(s.sourceId));
        const busy = busyFor(s);
        return (
          <li
            key={s.restaurantId}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-xs"
          >
            <Badge variant={SOURCE_BADGE_VARIANT[s.source] ?? 'secondary'}>
              {SOURCE_LABEL[s.source] ?? s.source}
            </Badge>
            {s.rating !== null && (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <Star className="size-3 fill-current text-amber-500" />
                {s.rating}
              </span>
            )}
            {s.reviewCount !== null && (
              <span className="tabular-nums text-muted-foreground">
                리뷰 {s.reviewCount.toLocaleString()}
              </span>
            )}
            <span className="tabular-nums text-muted-foreground">
              DB {s.totalReviews.toLocaleString()} · 요약 {s.summaryDone.toLocaleString()}
              {s.summaryFailed > 0 && (
                <span className="text-destructive"> · 실패 {s.summaryFailed.toLocaleString()}</span>
              )}
            </span>
            <span className="text-muted-foreground" title={new Date(s.lastCrawledAt).toLocaleString('ko-KR')}>
              {shortDate(s.lastCrawledAt)} 수집
            </span>
            {s.source === 'diningcode' && (
              <Link
                to={`/admin/diningcode/${encodeURIComponent(s.sourceId)}`}
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                어드민 상세
              </Link>
            )}
            <a
              href={safeExternalHref(s.rawSourceUrl)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-muted-foreground hover:text-foreground"
              aria-label={`${SOURCE_LABEL[s.source] ?? s.source} 원본 열기`}
            >
              <ExternalLink className="size-3" />
            </a>
            {canRecollect && (
              <Button
                type="button"
                variant={s.source === 'diningcode' ? 'violet' : 'blue'}
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => void recollect(s)}
                disabled={busy}
                title="새 리뷰를 받아오고 AI 분석을 큐에 올립니다"
              >
                {busy ? <Loader2 className="animate-spin" /> : <Database />}
                재수집
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
};
