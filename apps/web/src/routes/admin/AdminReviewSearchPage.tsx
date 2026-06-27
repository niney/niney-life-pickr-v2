import { useState } from 'react';
import {
  AlertCircle,
  Database,
  FlaskConical,
  Layers,
  ListChecks,
  Loader2,
  MessageSquareText,
  Star,
} from 'lucide-react';
import {
  ApiError,
  useEnrichReviews,
  useReviewAsk,
  useReviewEnrichBg,
  useReviewEnrichEvents,
  useReviewEnrichPending,
  useReviewEnrichStatus,
  useReviewSearchRestaurants,
  useRunClustering,
  useClusterStatus,
  useClusterBg,
  useClusterPending,
} from '@repo/shared';
import type {
  ReviewAskResultType,
  ReviewClusterRunResultType,
  ReviewClusterStatusItemType,
  ReviewEnrichStatusItemType,
  ReviewSearchEnrichResultType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

// 리뷰 문맥검색 / RAG (정식 review-search 도메인). enrich(관점+문맥+임베딩 영속)
// → RAG 질문(근거 인용·확신도·검증 가드레일). standalone 시맨틱/관점 검색은 제거됨
// (검색 엔진은 RAG 내부에서만 사용). @repo/shared 훅 경유.
const errMsg = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : '실패';

export const AdminReviewSearchPage = () => {
  const restaurantsQuery = useReviewSearchRestaurants();
  const restaurants = restaurantsQuery.data?.restaurants ?? [];

  const [restaurantId, setRestaurantId] = useState('');
  const [enrichInfo, setEnrichInfo] = useState<ReviewSearchEnrichResultType | null>(null);
  const [askQuery, setAskQuery] = useState('');
  const [ask, setAsk] = useState<ReviewAskResultType | null>(null);
  const [clusterInfo, setClusterInfo] = useState<ReviewClusterRunResultType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enrichMut = useEnrichReviews();
  const askMut = useReviewAsk();
  const clusterMut = useRunClustering();

  const ready = (enrichInfo?.total ?? 0) > 0;

  const onPick = (id: string) => {
    setRestaurantId(id);
    setEnrichInfo(null);
    setAsk(null);
    setClusterInfo(null);
    setError(null);
  };

  const wrap = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const runEnrich = () =>
    wrap(async () => {
      setEnrichInfo(await enrichMut.mutateAsync(restaurantId));
    });
  const runAsk = () =>
    wrap(async () => {
      setAsk(await askMut.mutateAsync({ restaurantId, query: askQuery }));
    });
  const runCluster = () =>
    wrap(async () => {
      setClusterInfo(await clusterMut.mutateAsync(restaurantId));
    });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <FlaskConical className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">리뷰 문맥검색 / RAG</h1>
          <p className="text-sm text-muted-foreground">
            관점·문맥·임베딩을 영속화(enrich)하고 근거 기반 RAG 질문을 수행합니다.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* 식당 선택 + enrich */}
        <Card className="self-start">
          <CardHeader>
            <CardTitle>1. 식당 선택 · enrich</CardTitle>
            <CardDescription>리뷰의 관점/문맥/임베딩을 생성·저장합니다 (첫 1회, 이후 캐시).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={restaurantId}
              onChange={(e) => onPick(e.target.value)}
            >
              <option value="">식당 선택 ({restaurants.length})</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.reviewCount}건)
                </option>
              ))}
            </select>
            <Button onClick={runEnrich} disabled={!restaurantId || enrichMut.isPending} className="w-full">
              {enrichMut.isPending ? <Loader2 className="animate-spin" /> : <Database />}
              enrich {enrichMut.isPending ? '중…(LLM)' : ''}
            </Button>
            {enrichInfo && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge variant="secondary">신규 {enrichInfo.enriched}</Badge>
                <Badge variant="secondary">검색가능 {enrichInfo.total}건</Badge>
                <Badge variant="secondary">{enrichInfo.ms}ms</Badge>
              </div>
            )}
            <Button
              variant="outline"
              onClick={runCluster}
              disabled={!restaurantId || clusterMut.isPending}
              className="w-full"
            >
              {clusterMut.isPending ? <Loader2 className="animate-spin" /> : <Layers />}
              군집화 {clusterMut.isPending ? '중…(Python+LLM)' : '실행'}
            </Button>
            {clusterInfo && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {clusterInfo.skipped ? (
                  <Badge variant="secondary" className="text-destructive">
                    건너뜀: {clusterInfo.reason}
                  </Badge>
                ) : (
                  <>
                    <Badge variant="secondary">주제 {clusterInfo.clusters}개</Badge>
                    <Badge variant="secondary">노이즈 {clusterInfo.noise}건</Badge>
                    <Badge variant="secondary">대상 {clusterInfo.total}건</Badge>
                    <Badge variant="secondary">{clusterInfo.ms}ms</Badge>
                  </>
                )}
              </div>
            )}
            {error && (
              <p className="flex items-start gap-1 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
          </CardContent>
        </Card>

        {/* RAG 질문 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="size-4" /> 질문하기 (RAG)
            </CardTitle>
            <CardDescription>회수→리랭크→근거 기반 답변 (HyDE·인용·검증·"정보 없음").</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="예: 주차 돼? / 맛없다는 사람도 있어? / 양은 충분해?"
                value={askQuery}
                onChange={(e) => setAskQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ready && runAsk()}
                disabled={!ready}
              />
              <Button onClick={runAsk} disabled={!ready || !askQuery.trim() || askMut.isPending}>
                {askMut.isPending ? <Loader2 className="animate-spin" /> : <MessageSquareText />}
              </Button>
            </div>
            {!ready && <p className="text-xs text-muted-foreground">먼저 enrich 를 실행하세요.</p>}
            {ask && (
              <div className="space-y-2">
                <div className="rounded-md border bg-muted/30 p-3">
                  <Badge
                    variant="secondary"
                    className={`mb-1.5 ${ask.confidence === 'none' ? 'text-destructive' : ''}`}
                  >
                    확신도 {ask.confidence}
                  </Badge>
                  <p className="whitespace-pre-wrap text-sm">{ask.answer}</p>
                </div>
                {ask.verification?.applied &&
                  (ask.verification.dropped.length > 0 ? (
                    <details className="rounded-md border border-amber-300 bg-amber-50 p-2">
                      <summary className="cursor-pointer text-xs font-medium text-amber-700">
                        검증: 근거 부족 주장 {ask.verification.dropped.length}개 제거됨
                      </summary>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-amber-700">
                        {ask.verification.dropped.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <p className="text-[11px] text-emerald-600">검증 통과 — 모든 주장이 근거 리뷰로 뒷받침됨</p>
                  ))}
                {ask.hyde && <p className="text-[11px] text-muted-foreground">HyDE: {ask.hyde}</p>}
                {ask.citations.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      근거 리뷰 {ask.citations.length}건
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {ask.citations.map((c, i) => (
                        <div key={c.reviewId} className="rounded-md border p-2.5 text-xs">
                          <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                            <span className="tabular-nums">[{i + 1}]</span>
                            {c.rating != null && (
                              <span className="flex items-center gap-0.5 text-amber-600">
                                <Star className="size-3 fill-current" /> {c.rating}
                              </span>
                            )}
                          </div>
                          <p>{c.body}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <EnrichStatusSection />
      <ClusterStatusSection />
    </div>
  );
};

// 식당별 enrich 상태 관리 ("식당별 정규화 상태" 미러링). 신규는 요약 후 자동 enrich,
// 여기선 백로그를 식당별/일괄로 처리하고 진척을 폴링으로 본다.
const STATUS_PAGE_SIZE = 30;
const EnrichStatusSection = () => {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useReviewEnrichEvents(); // SSE — 진행률 라이브 push
  const statusQuery = useReviewEnrichStatus({ q: q || undefined, page, pageSize: STATUS_PAGE_SIZE });
  const enrichBg = useReviewEnrichBg();
  const enrichPending = useReviewEnrichPending();
  const data = statusQuery.data;

  const onEnrich = async (restaurantId: string) => {
    await enrichBg.mutateAsync(restaurantId);
    void statusQuery.refetch();
  };
  const onEnrichPending = async () => {
    await enrichPending.mutateAsync();
    void statusQuery.refetch();
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / STATUS_PAGE_SIZE)) : 1;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4" /> 식당별 enrich 상태
        </CardTitle>
        <CardDescription>
          검색가능(enrich됨) {data?.readyCount ?? 0} / 전체 {data?.totalRestaurants ?? 0}곳. 새로 크롤된 식당은
          요약 후 자동 enrich되며, 여기서 백로그를 처리합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="식당 검색"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="max-w-xs"
          />
          <Button variant="outline" onClick={onEnrichPending} disabled={enrichPending.isPending}>
            {enrichPending.isPending ? <Loader2 className="animate-spin" /> : <Database />}
            미완료 일괄 enrich
          </Button>
          {enrichPending.data && (
            <span className="self-center text-xs text-muted-foreground">
              {enrichPending.data.queued}곳 백그라운드 대기열에 추가됨
            </span>
          )}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">식당</th>
                <th className="px-3 py-2 text-right font-medium">리뷰</th>
                <th className="px-3 py-2 text-right font-medium">검색가능</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((it) => (
                <EnrichStatusRow key={it.restaurantId} item={it} onEnrich={onEnrich} />
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    식당이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > STATUS_PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 text-sm">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              이전
            </Button>
            <span className="tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              다음
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const EnrichStatusRow = ({
  item,
  onEnrich,
}: {
  item: ReviewEnrichStatusItemType;
  onEnrich(restaurantId: string): void;
}) => (
  <tr className="border-t">
    <td className="px-3 py-2">{item.name}</td>
    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{item.totalReviews}</td>
    <td className="px-3 py-2 text-right tabular-nums">{item.enrichedReviews}</td>
    <td className="px-3 py-2">
      {item.inProgress ? (
        <Badge variant="secondary" className="gap-1 text-blue-600">
          <Loader2 className="size-3 animate-spin" />
          {item.progress && item.progress.total > 0
            ? `${item.progress.processed}/${item.progress.total}`
            : '진행 중'}
        </Badge>
      ) : item.ready ? (
        <Badge variant="secondary" className="text-emerald-600">검색가능</Badge>
      ) : (
        <Badge variant="secondary" className="text-muted-foreground">미시작</Badge>
      )}
    </td>
    <td className="px-3 py-2 text-right">
      <Button
        size="sm"
        variant="outline"
        disabled={item.inProgress}
        onClick={() => onEnrich(item.restaurantId)}
        title={item.ready ? '새 리뷰만 보충 enrich' : 'enrich 실행'}
      >
        enrich
      </Button>
    </td>
  </tr>
);

// 식당별 군집 상태 관리 (enrich 상태 미러링). enrich 선행 후 식당별/일괄로 군집화하고
// 진척을 폴링으로 본다. 새로 크롤된 식당은 요약 후 조건부 자동 군집화.
const ClusterStatusSection = () => {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const statusQuery = useClusterStatus({ q: q || undefined, page, pageSize: STATUS_PAGE_SIZE });
  const clusterBg = useClusterBg();
  const clusterPending = useClusterPending();
  const data = statusQuery.data;

  const onCluster = async (restaurantId: string) => {
    await clusterBg.mutateAsync(restaurantId);
    void statusQuery.refetch();
  };
  const onClusterPending = async () => {
    await clusterPending.mutateAsync();
    void statusQuery.refetch();
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / STATUS_PAGE_SIZE)) : 1;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4" /> 식당별 군집 상태
        </CardTitle>
        <CardDescription>
          군집됨 {data?.clusteredCount ?? 0} / 군집가능(enrich≥30) {data?.eligibleCount ?? 0}곳. 새로 크롤된
          식당은 요약 후 조건부 자동 군집화되며, 여기서 백로그를 처리합니다(enrich 선행 필요).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="식당 검색"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="max-w-xs"
          />
          <Button variant="outline" onClick={onClusterPending} disabled={clusterPending.isPending}>
            {clusterPending.isPending ? <Loader2 className="animate-spin" /> : <Layers />}
            미군집 일괄 군집화
          </Button>
          {clusterPending.data && (
            <span className="self-center text-xs text-muted-foreground">
              {clusterPending.data.queued}곳 백그라운드 대기열에 추가됨
            </span>
          )}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">식당</th>
                <th className="px-3 py-2 text-right font-medium">검색가능</th>
                <th className="px-3 py-2 text-right font-medium">군집</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((it) => (
                <ClusterStatusRow key={it.restaurantId} item={it} onCluster={onCluster} />
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    식당이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > STATUS_PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 text-sm">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              이전
            </Button>
            <span className="tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              다음
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ClusterStatusRow = ({
  item,
  onCluster,
}: {
  item: ReviewClusterStatusItemType;
  onCluster(restaurantId: string): void;
}) => {
  // "전부 노이즈"는 실패가 아니라 정상 — 공개엔 관점집계 폴백으로 표시됨. 다른 사유
  // (계산 오류·리뷰 부족)는 실제 조치 필요 → 빨강.
  const noiseFallback = !item.clustered && !!item.lastReason && item.lastReason.includes('노이즈');
  return (
  <tr className="border-t">
    <td className="px-3 py-2">{item.name}</td>
    <td className="px-3 py-2 text-right tabular-nums">{item.enrichedReviews}</td>
    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
      {item.clustered ? `${item.clusterCount}개` : '-'}
    </td>
    <td className="px-3 py-2">
      {item.inProgress ? (
        <Badge variant="secondary" className="gap-1 text-blue-600">
          <Loader2 className="size-3 animate-spin" /> 진행 중
        </Badge>
      ) : item.clustered ? (
        <Badge variant="secondary" className="text-emerald-600">군집됨</Badge>
      ) : noiseFallback ? (
        <Badge variant="secondary" className="text-sky-600">관점집계</Badge>
      ) : item.eligible ? (
        <Badge variant="secondary" className="text-amber-600">대기</Badge>
      ) : (
        <Badge variant="secondary" className="text-muted-foreground">enrich 부족</Badge>
      )}
      {/* 노이즈=정상(공개 관점집계). 그 외 사유는 조치 필요 → 빨강. */}
      {!item.clustered && !item.inProgress && noiseFallback && (
        <p className="mt-1 text-[11px] text-sky-600 dark:text-sky-400">
          토픽 없음 — 공개는 관점집계로 표시
        </p>
      )}
      {!item.clustered && !item.inProgress && !noiseFallback && item.lastReason && (
        <p className="mt-1 text-[11px] text-destructive" title={item.lastReason}>
          {item.lastReason}
        </p>
      )}
    </td>
    <td className="px-3 py-2 text-right">
      <Button
        size="sm"
        variant="outline"
        disabled={item.inProgress || !item.eligible}
        onClick={() => onCluster(item.restaurantId)}
        title={item.eligible ? (item.clustered ? '재군집' : '군집화 실행') : 'enrich(검색가능 리뷰)가 30건 이상이어야 함'}
      >
        군집화
      </Button>
    </td>
  </tr>
  );
};
