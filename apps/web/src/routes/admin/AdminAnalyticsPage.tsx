import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  menuGroupingApi,
  useActiveGlobalMergeJobStore,
  useActiveGroupingJobStore,
  useAnalyticsOverview,
  useCategoryTree,
  useCreateGroupingJob,
  useGlobalMenus,
  useGlobalMergeJob,
  useGroupingJob,
  useGroupingRestaurantsStatus,
  useStartGlobalMerge,
} from '@repo/shared';
import type {
  CategoryTreeNodeType,
  GlobalMenuQuerySortType,
  GlobalMergeJobSnapshotType,
  MenuGroupingRestaurantSortType,
  MenuGroupingRestaurantStatusType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Pager } from '~/components/ui/pager';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { cn } from '~/lib/utils';

// 식당 표 정렬 키 — api-contract 의 MenuGroupingRestaurantSortType 과 같음.
const SORT_KEYS: MenuGroupingRestaurantSortType[] = ['unmapped', 'analyzed', 'name'];
const isSortKey = (v: string | null): v is MenuGroupingRestaurantSortType =>
  v !== null && (SORT_KEYS as string[]).includes(v);

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

const formatDate = (iso: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const AdminAnalyticsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL 이 진실의 원천. 컴포넌트 state 는 URL 파싱 결과로만 도출.
  const qParam = searchParams.get('q') ?? '';
  const sortParam = searchParams.get('sort');
  const sort: MenuGroupingRestaurantSortType = isSortKey(sortParam) ? sortParam : 'unmapped';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = (() => {
    const n = Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE);
    return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
  })();

  // 검색 입력은 디바운스 — 즉시 URL 동기화하면 글자마다 fetch 가 터진다.
  // 입력값과 URL(q) 의 의도적 분리: 입력값은 즉시 반영, URL 은 300ms 후.
  const [searchInput, setSearchInput] = useState(qParam);
  useEffect(() => {
    if (searchInput === qParam) return;
    const handle = setTimeout(() => {
      updateParams({ q: searchInput || null, page: null });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);
  // URL 이 외부에서 바뀐 경우(뒤로/앞으로) 입력 동기화.
  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  const updateParams = (
    patch: Record<string, string | number | null>,
    opts: { replace?: boolean } = {},
  ): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      },
      { replace: opts.replace ?? true },
    );
  };

  const status = useGroupingRestaurantsStatus({
    q: qParam || undefined,
    sort,
    page,
    pageSize,
  });
  const create = useCreateGroupingJob();
  // 진행 중인 잡 ID 는 store + localStorage 에 들고 다닌다 — 다른 어드민 페이지로
  // 이동했다 돌아오거나 새로고침해도 진행 카드가 유지되게. 잡 자체는 서버
  // in-memory 레지스트리에서 SSE 로 push 받으므로 클라는 jobId 만 알면 충분.
  const activeJobId = useActiveGroupingJobStore((s) => s.jobId);
  const setActiveJobId = useActiveGroupingJobStore((s) => s.setJobId);
  const clearActiveJob = useActiveGroupingJobStore((s) => s.clear);
  const job = useGroupingJob(activeJobId);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items = status.data?.items ?? [];
  const total = status.data?.total ?? 0;
  const totalRestaurants = status.data?.totalRestaurants ?? 0;
  const attentionCount = status.data?.attentionCount ?? 0;
  const cleanCount = Math.max(0, totalRestaurants - attentionCount);
  const currentVersion = status.data?.currentVersion ?? null;

  // 정규화 필요한 식당 = 미분류 메뉴가 있거나, 매핑이 옛 버전. UI 배지용.
  const needsAttention = (r: MenuGroupingRestaurantStatusType): boolean =>
    r.unmappedMenus > 0 ||
    (r.storedVersion !== null && currentVersion !== null && r.storedVersion < currentVersion);

  // 현재 페이지의 식당들만 — 헤더 체크박스는 페이지 단위 토글.
  const pageIds = items.map((r) => r.placeId);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  const toggleOne = (placeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const setSort = (next: MenuGroupingRestaurantSortType) => {
    updateParams({ sort: next, page: null });
  };

  const startJob = async () => {
    const placeIds = [...selected];
    if (placeIds.length === 0) return;
    const snap = await create.mutateAsync(placeIds);
    setActiveJobId(snap.jobId);
    setSelected(new Set()); // 잡 시작했으면 체크박스 초기화
  };

  // 처리 필요 식당을 페이지 가로질러 모두 수집한 뒤 잡 시작. 한 페이지(최대 200)
  // 안에서 끝나는 경우가 흔하지만 안전하게 페이지를 따라가며 모은다.
  const startAttention = async () => {
    if (attentionCount === 0) return;
    const allIds: string[] = [];
    const FETCH_SIZE = 200;
    let p = 1;
    while (true) {
      const res = await menuGroupingApi.getRestaurantsStatus({
        attention: true,
        sort: 'unmapped',
        page: p,
        pageSize: FETCH_SIZE,
      });
      for (const it of res.items) allIds.push(it.placeId);
      if (p * FETCH_SIZE >= res.total) break;
      p += 1;
    }
    if (allIds.length === 0) return;
    const snap = await create.mutateAsync(allIds);
    setActiveJobId(snap.jobId);
  };

  const mobileBarVisible = attentionCount > 0 || selected.size > 0;

  return (
    <div
      className={cn(
        'container mx-auto max-w-6xl space-y-6 px-4 py-6 sm:p-6',
        // 모바일 sticky 액션 바 노출 시 마지막 카드와 겹치지 않게 하단 여백 확보.
        mobileBarVisible && 'pb-24 xl:pb-6',
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI 분석 관리</h1>
          <p className="text-sm text-muted-foreground">
            식당별 메뉴 정규화 상태를 확인하고, 미분류 메뉴를 일괄 정규화합니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => status.refetch()}
          disabled={status.isFetching}
        >
          <RefreshCw className={cn('size-4', status.isFetching && 'animate-spin')} />
          새로고침
        </Button>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>전체 식당</CardDescription>
            <CardTitle className="text-3xl">{totalRestaurants}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>정규화 완료</CardDescription>
            <CardTitle className="text-3xl text-emerald-600 dark:text-emerald-400">
              {cleanCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>처리 필요</CardDescription>
            <CardTitle className="text-3xl text-amber-600 dark:text-amber-400">
              {attentionCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <GlobalMergeSection />
      <CategoryTreeSection />
      <GlobalMenusSection />

      {activeJobId && job.data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>정규화 진행</CardTitle>
                <CardDescription>
                  {job.data.doneCount + job.data.failedCount + job.data.skippedCount} / {job.data.total} 처리 ·
                  성공 {job.data.doneCount}, 실패 {job.data.failedCount}, 건너뜀 {job.data.skippedCount}
                </CardDescription>
              </div>
              <JobStateBadge state={job.data.state} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${
                    job.data.total === 0
                      ? 0
                      : Math.round(
                          ((job.data.doneCount +
                            job.data.failedCount +
                            job.data.skippedCount) /
                            job.data.total) *
                            100,
                        )
                  }%`,
                }}
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <ul className="divide-y text-sm">
                {job.data.items.map((it) => (
                  <li
                    key={it.placeId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ItemStateIcon state={it.state} />
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {it.placeId}
                      </span>
                    </div>
                    {it.state === 'done' && it.groupCount !== null ? (
                      <span className="text-xs text-muted-foreground">
                        그룹 {it.groupCount} / 매핑 {it.mappedCount}
                      </span>
                    ) : null}
                    {it.errorMessage ? (
                      <span className="break-words text-xs text-amber-600 dark:text-amber-400">
                        {it.errorMessage}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            {(job.data.state === 'done' || job.data.state === 'failed') && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearActiveJob}>
                  닫기
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle>식당별 정규화 상태</CardTitle>
            <CardDescription>
              체크해서 선택 정규화 또는 "처리 필요한 식당 일괄 정규화" 버튼을 사용하세요.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="식당 이름 검색"
                className="h-9 pl-8"
                aria-label="식당 이름 검색"
              />
            </div>
            {/* 모바일에선 page-level sticky 바로 이관 — xl+ 에서만 헤더 인라인. */}
            <div className="hidden items-center gap-2 xl:flex">
              <Button
                variant="outline"
                size="sm"
                onClick={startAttention}
                disabled={attentionCount === 0 || create.isPending}
              >
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                처리 필요 {attentionCount}개 일괄 정규화
              </Button>
              <Button
                size="sm"
                onClick={startJob}
                disabled={selected.size === 0 || create.isPending}
              >
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                선택 {selected.size}개 정규화
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {status.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 식당 목록 불러오는 중…
            </div>
          ) : totalRestaurants === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">등록된 식당이 없습니다.</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              검색 결과가 없습니다.
              {qParam && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="ml-2 underline hover:no-underline"
                >
                  검색어 지우기
                </button>
              )}
            </p>
          ) : (
            <>
              {/* 모바일 카드 — 정렬 컨트롤은 xl+ 표 컬럼 헤더 클릭으로만 동작.
                  카드 클릭(=label) 으로 체크박스 토글되도록 label 래핑. */}
              <ul className="space-y-2 xl:hidden">
                {items.map((r) => {
                  const attention = needsAttention(r);
                  const stale =
                    r.storedVersion !== null &&
                    currentVersion !== null &&
                    r.storedVersion < currentVersion;
                  const isChecked = selected.has(r.placeId);
                  return (
                    <li key={r.placeId}>
                      <label
                        className={cn(
                          'flex select-none flex-col gap-2 rounded-md border p-3 transition-colors',
                          'cursor-pointer hover:bg-muted/40',
                          isChecked && 'bg-muted/30 ring-1 ring-primary/30',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOne(r.placeId)}
                            className="mt-0.5 size-4 shrink-0"
                            aria-label={`${r.name} 선택`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium">{r.name}</span>
                              {!attention ? (
                                <Badge variant="secondary" className="shrink-0 gap-1">
                                  <CheckCircle2 className="size-3" /> 정상
                                </Badge>
                              ) : stale ? (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 gap-1 border-amber-300 text-amber-700 dark:text-amber-300"
                                >
                                  <AlertTriangle className="size-3" /> 재실행
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 gap-1 border-amber-300 text-amber-700 dark:text-amber-300"
                                >
                                  <AlertTriangle className="size-3" /> 미분류
                                </Badge>
                              )}
                            </div>
                            {r.category && (
                              <div className="truncate text-xs text-muted-foreground">
                                {r.category}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted-foreground">
                          <span>
                            분석{' '}
                            <span className="tabular-nums text-foreground">
                              {r.analyzedReviews}
                            </span>
                            /{r.totalReviews}
                          </span>
                          <span>
                            메뉴{' '}
                            <span className="tabular-nums text-foreground">{r.distinctMenus}</span>
                          </span>
                          <span>
                            매핑{' '}
                            <span className="tabular-nums text-foreground">{r.mappedMenus}</span>
                          </span>
                          <span
                            className={cn(
                              r.unmappedMenus > 0 && 'text-amber-600 dark:text-amber-400',
                            )}
                          >
                            미분류 <span className="tabular-nums">{r.unmappedMenus}</span>
                          </span>
                          <span>· {formatDate(r.lastGroupedAt)}</span>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {/* 데스크톱 표 — xl+ */}
              <div className="hidden xl:block">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={togglePage}
                      aria-label="현재 페이지 전체 선택"
                    />
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => setSort('name')}
                      className={cn(
                        'text-left',
                        sort === 'name' && 'text-foreground font-semibold',
                      )}
                    >
                      식당
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      onClick={() => setSort('analyzed')}
                      className={cn(
                        'text-right',
                        sort === 'analyzed' && 'text-foreground font-semibold',
                      )}
                    >
                      분석 리뷰
                    </button>
                  </TableHead>
                  <TableHead className="text-right">메뉴</TableHead>
                  <TableHead className="text-right">매핑</TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      onClick={() => setSort('unmapped')}
                      className={cn(
                        'text-right',
                        sort === 'unmapped' && 'text-foreground font-semibold',
                      )}
                    >
                      미분류
                    </button>
                  </TableHead>
                  <TableHead>마지막 정규화</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => {
                  const attention = needsAttention(r);
                  const stale =
                    r.storedVersion !== null &&
                    currentVersion !== null &&
                    r.storedVersion < currentVersion;
                  return (
                    <TableRow key={r.placeId}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(r.placeId)}
                          onChange={() => toggleOne(r.placeId)}
                          aria-label={`${r.name} 선택`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{r.name}</span>
                          {r.category && (
                            <span className="text-xs text-muted-foreground">{r.category}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.analyzedReviews}
                        <span className="text-xs text-muted-foreground"> / {r.totalReviews}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.distinctMenus}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.mappedMenus}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.unmappedMenus > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {r.unmappedMenus}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(r.lastGroupedAt)}
                      </TableCell>
                      <TableCell>
                        {!attention ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="size-3" /> 정상
                          </Badge>
                        ) : stale ? (
                          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="size-3" /> 재실행 권장
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="size-3" /> 미분류 있음
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
              </div>
              {/* 페이저 — 데스크탑은 풀, 모바일은 컴팩트. total=0 이어도 노출 시
                  레이아웃 점프 방지. selected 와 무관 — 페이지 전환에도 선택은 보존. */}
              <Pager
                className="mt-3"
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={(p) => updateParams({ page: p })}
                onPageSizeChange={(s) => updateParams({ pageSize: s, page: null })}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* 모바일 sticky 액션 바 — xl 미만 + 처리필요/선택 둘 중 하나라도 있을 때 노출.
          AdminDiscoverPage 의 모바일 토글 바와 동일 패턴(z-40, 가운데 fixed). */}
      {mobileBarVisible && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-2 py-1.5 shadow-md xl:hidden">
          {attentionCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startAttention}
              disabled={create.isPending}
              className="rounded-full"
            >
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlayCircle className="size-4" />
              )}
              처리 필요 {attentionCount}
            </Button>
          )}
          {selected.size > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={startJob}
              disabled={create.isPending}
              className="rounded-full"
            >
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlayCircle className="size-4" />
              )}
              선택 {selected.size} 정규화
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

const JobStateBadge = ({ state }: { state: 'pending' | 'running' | 'done' | 'failed' }) => {
  if (state === 'running' || state === 'pending') {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="size-3 animate-spin" /> 진행 중
      </Badge>
    );
  }
  if (state === 'done') {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="size-3" /> 완료
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="size-3" /> 실패
    </Badge>
  );
};

// ── 전역 머지 섹션 ──────────────────────────────────────────────────

const GlobalMergeSection = () => {
  const overview = useAnalyticsOverview();
  const start = useStartGlobalMerge();
  // 식당 정규화 잡과 동일 패턴 — 별도 store 인 이유는 두 잡이 동시 실행 가능한
  // 독립 슬롯이기 때문. [[active-grouping-job-store]] 참고.
  const activeJobId = useActiveGlobalMergeJobStore((s) => s.jobId);
  const setActiveJobId = useActiveGlobalMergeJobStore((s) => s.setJobId);
  const clearActiveJob = useActiveGlobalMergeJobStore((s) => s.clear);
  const job = useGlobalMergeJob(activeJobId);

  const o = overview.data;
  const linkedPct =
    o && o.globalLinkedRatio !== null ? Math.round(o.globalLinkedRatio * 100) : null;
  const stale =
    o && o.lastGlobalMergeAt === null && o.perRestaurantGroupCount > 0;

  const trigger = async (full: boolean) => {
    try {
      const snap = await start.mutateAsync({ full });
      setActiveJobId(snap.jobId);
    } catch (e) {
      // 409 = 이미 진행 중. 라우트가 응답 body 로 기존 잡 스냅샷을 그대로
      // 보내주므로 ApiError.body 에서 jobId 만 추출해 같은 진행 패널을 그대로
      // 마운트한다 — 사용자는 새로 시작한 것처럼 보인다.
      if (e instanceof ApiError && e.statusCode === 409) {
        const body = e.body as Partial<GlobalMergeJobSnapshotType> | null;
        if (body && typeof body.jobId === 'string') {
          setActiveJobId(body.jobId);
          return;
        }
      }
      throw e;
    }
  };

  return (
    <Card>
      <CardHeader className="flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>전역 메뉴 머지</CardTitle>
          <CardDescription>
            식당 가로지르기 통계용 — 식당별 그룹들을 묶어 전역 canonical 을 만듭니다.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => trigger(false)}
            disabled={start.isPending || (job.data?.state === 'running')}
          >
            {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
            증분 머지
          </Button>
          <Button
            size="sm"
            onClick={() => trigger(true)}
            disabled={start.isPending || (job.data?.state === 'running')}
          >
            {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            전체 재실행
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
          <Metric label="식당 그룹 합계" value={o?.perRestaurantGroupCount ?? 0} />
          <Metric label="전역 그룹" value={o?.globalGroupCount ?? 0} />
          <Metric label="매핑 비율" value={linkedPct === null ? '-' : `${linkedPct}%`} />
          <Metric label="마지막 머지" value={formatDate(o?.lastGlobalMergeAt ?? null)} />
        </div>
        {stale && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            아직 한 번도 전역 머지를 실행하지 않았습니다. 식당 가로지르기 통계가 비어 있습니다.
          </p>
        )}
        {activeJobId && job.data && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">잡 진행</span>
              <JobStateBadge state={job.data.state} />
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${
                    job.data.totalChunks === 0
                      ? 0
                      : Math.round((job.data.doneChunks / job.data.totalChunks) * 100)
                  }%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                청크 {job.data.doneChunks} / {job.data.totalChunks || '?'}
              </span>
              {job.data.state === 'done' && (
                <span>전역 그룹 {job.data.finalGroupCount}개</span>
              )}
              {job.data.state === 'failed' && job.data.errorMessage && (
                <span className="text-red-600 dark:text-red-400">
                  {job.data.errorMessage}
                </span>
              )}
            </div>
            {(job.data.state === 'done' || job.data.state === 'failed') && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearActiveJob}>
                  닫기
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Metric = ({ label, value }: { label: string; value: string | number }) => (
  <div className="space-y-1">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
  </div>
);

// ── 전역 메뉴 검색/통계 섹션 ────────────────────────────────────────

const GLOBAL_SORT_OPTIONS: { value: GlobalMenuQuerySortType; label: string }[] = [
  { value: 'mentions', label: '언급순' },
  { value: 'positive', label: '긍정순' },
  { value: 'positiveRatio', label: '긍정률' },
  { value: 'restaurants', label: '식당 수' },
];

const GlobalMenusSection = () => {
  // ?menu=김치찌개 deep-link 가 single source of truth — 별도 useState 두지 않고
  // searchParams 를 그대로 읽는다. 변경은 onChange 안에서 즉시 setSearchParams.
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('menu') ?? '';
  const setQ = (next: string): void => {
    const params = new URLSearchParams(searchParams);
    if (next.trim().length > 0) params.set('menu', next);
    else params.delete('menu');
    setSearchParams(params, { replace: true });
    setPage(1);
  };
  const [sort, setSort] = useState<GlobalMenuQuerySortType>('mentions');
  const [minMentions, setMinMentions] = useState(5);
  const [includeUnlinked, setIncludeUnlinked] = useState(false);
  // 모바일 필터 펼침 — 검색 외 컨트롤 4개를 접어두고 [필터 ▾] 로 토글. URL 동기화 X.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 페이지·페이지당은 로컬 state — URL 의 page/pageSize 는 메인 식당 표 가 점유.
  // 두 페이저가 같은 키 쓰면 충돌하니 분리. 페이지 떠났다 돌아오면 1로 리셋 OK.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const category = searchParams.get('category') ?? '';
  const setCategory = (next: string): void => {
    const params = new URLSearchParams(searchParams);
    if (next.trim().length > 0) params.set('category', next);
    else params.delete('category');
    setSearchParams(params, { replace: true });
    setPage(1);
  };

  // 필터/검색/정렬 변경 시 page 1 로 리셋 — 안 하면 빈 결과로 점프.
  // useEffect 회피: 변경 핸들러 안에서 page reset 호출.
  const resetPage = () => setPage(1);

  const menus = useGlobalMenus({ q, category, sort, minMentions, page, pageSize, includeUnlinked });
  const tree = useCategoryTree();
  // 자동완성용 path 후보 — 트리 노드 path 들 평탄화.
  const categoryPaths = (tree.data?.roots ?? []).flatMap(flattenPaths);

  return (
    <Card>
      <CardHeader>
        <CardTitle>전역 메뉴 통계</CardTitle>
        <CardDescription>
          식당 가로지르기 — 같은 메뉴를 모든 식당에서 합쳐 본다. 검색/필터 가능.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <datalist id="analytics-category-suggestions">
          {categoryPaths.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        {/* 데스크톱 — 기존 wrap 그대로 (xl+ 만 노출) */}
        <div className="hidden flex-wrap items-center gap-2 xl:flex">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="메뉴 검색 (예: 김치찌개)"
            className="flex-1 min-w-[200px] rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="카테고리 (예: 한식 > 찌개)"
            list="analytics-category-suggestions"
            className="min-w-[180px] rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value as GlobalMenuQuerySortType); resetPage(); }}
            className="rounded border bg-background px-2 py-1 text-sm"
          >
            {GLOBAL_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={minMentions}
            onChange={(e) => { setMinMentions(Number(e.target.value)); resetPage(); }}
            className="rounded border bg-background px-2 py-1 text-sm"
          >
            <option value={1}>최소 1회</option>
            <option value={3}>최소 3회</option>
            <option value={5}>최소 5회</option>
            <option value={10}>최소 10회</option>
          </select>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={includeUnlinked}
              onChange={(e) => { setIncludeUnlinked(e.target.checked); resetPage(); }}
            />
            미머지 포함
          </label>
        </div>

        {/* 모바일 — 검색 1줄 + [필터 ▾] 토글 + 펼침 영역 */}
        <div className="space-y-2 xl:hidden">
          <div className="flex gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="메뉴 검색 (예: 김치찌개)"
              className="min-w-0 flex-1 rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
              className="shrink-0"
            >
              필터 {filtersOpen ? '▴' : '▾'}
            </Button>
          </div>
          {filtersOpen && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="카테고리 (예: 한식 > 찌개)"
                list="analytics-category-suggestions"
                className="rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value as GlobalMenuQuerySortType); resetPage(); }}
                className="rounded border bg-background px-2 py-1.5 text-sm"
              >
                {GLOBAL_SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    정렬: {o.label}
                  </option>
                ))}
              </select>
              <select
                value={minMentions}
                onChange={(e) => { setMinMentions(Number(e.target.value)); resetPage(); }}
                className="rounded border bg-background px-2 py-1.5 text-sm"
              >
                <option value={1}>최소 1회 언급</option>
                <option value={3}>최소 3회 언급</option>
                <option value={5}>최소 5회 언급</option>
                <option value={10}>최소 10회 언급</option>
              </select>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeUnlinked}
                  onChange={(e) => { setIncludeUnlinked(e.target.checked); resetPage(); }}
                />
                미머지 포함
              </label>
            </div>
          )}
        </div>

        {menus.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 불러오는 중…
          </div>
        ) : !menus.data || menus.data.items.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">결과가 없습니다.</p>
        ) : (
          <>
            {/* 모바일 카드 */}
            <ul className="space-y-2 xl:hidden">
              {menus.data.items.map((m) => (
                <li key={m.globalKey} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {m.displayName}
                    </span>
                    {m.globalKey.startsWith('unlinked:') && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-amber-300 text-[10px] text-amber-700 dark:text-amber-300"
                      >
                        미머지
                      </Badge>
                    )}
                  </div>
                  {m.categoryPath && (
                    <button
                      type="button"
                      onClick={() => setCategory(m.categoryPath!)}
                      className="mt-1 block max-w-full truncate text-left text-xs text-muted-foreground hover:underline"
                      title="이 카테고리로 필터"
                    >
                      {m.categoryPath}
                    </button>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      언급{' '}
                      <span className="tabular-nums text-foreground">{m.totalMentions}</span>
                    </span>
                    <span>
                      식당{' '}
                      <span className="tabular-nums text-foreground">{m.restaurantCount}</span>
                    </span>
                    <span className="tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{m.positive}
                      </span>
                      <span className="mx-1">/</span>
                      <span className="text-rose-600 dark:text-rose-400">-{m.negative}</span>
                    </span>
                    <span className="tabular-nums">
                      {m.positiveRatio === null
                        ? '-'
                        : `${Math.round(m.positiveRatio * 100)}%`}
                    </span>
                  </div>
                  {m.topRestaurants.length > 0 && (
                    <div className="mt-2 space-y-0.5 text-xs">
                      {m.topRestaurants.slice(0, 2).map((r) => (
                        <div key={r.placeId} className="truncate">
                          <span>{r.name}</span>{' '}
                          <span className="text-muted-foreground">{r.mentionCount}회</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {/* 데스크톱 표 */}
            <div className="hidden xl:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>메뉴</TableHead>
                <TableHead>카테고리</TableHead>
                <TableHead className="text-right">언급</TableHead>
                <TableHead className="text-right">식당</TableHead>
                <TableHead className="text-right">긍정</TableHead>
                <TableHead className="text-right">긍정률</TableHead>
                <TableHead>대표 식당</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {menus.data.items.map((m) => (
                <TableRow key={m.globalKey}>
                  <TableCell className="font-medium">
                    <div>{m.displayName}</div>
                    {m.globalKey.startsWith('unlinked:') && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        미머지
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.categoryPath ? (
                      <button
                        type="button"
                        onClick={() => setCategory(m.categoryPath!)}
                        className="hover:underline"
                        title="이 카테고리로 필터"
                      >
                        {m.categoryPath}
                      </button>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.totalMentions}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.restaurantCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.positive}
                    <span className="text-xs text-muted-foreground"> / {m.negative}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.positiveRatio === null
                      ? '-'
                      : `${Math.round(m.positiveRatio * 100)}%`}
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.topRestaurants.slice(0, 2).map((r) => (
                      <div key={r.placeId} className="line-clamp-1">
                        <span>{r.name}</span>{' '}
                        <span className="text-muted-foreground">{r.mentionCount}회</span>
                      </div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            </div>
            <Pager
              className="mt-3"
              total={menus.data.total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); resetPage(); }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

// 트리에서 모든 path 평탄화 — datalist 자동완성 후보로 사용.
const flattenPaths = (node: CategoryTreeNodeType): string[] => {
  const out = [node.path];
  if (node.children) {
    for (const c of node.children) out.push(...flattenPaths(c));
  }
  return out;
};

// ── 카테고리 트리 섹션 ──────────────────────────────────────────────

const CategoryTreeSection = () => {
  const tree = useCategoryTree();
  const [, setSearchParams] = useSearchParams();
  const setCategory = (path: string): void => {
    const params = new URLSearchParams();
    params.set('category', path);
    setSearchParams(params, { replace: true });
    // 메뉴 통계 섹션이 같은 URL state 를 보고 있으므로 자동으로 필터링됨.
  };

  if (tree.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>카테고리 트리</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 불러오는 중…
          </div>
        </CardContent>
      </Card>
    );
  }

  const roots = tree.data?.roots ?? [];
  if (roots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>카테고리 트리</CardTitle>
          <CardDescription>
            전역 머지를 한 번 실행해야 카테고리 path 가 채워집니다.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>카테고리 트리</CardTitle>
        <CardDescription>
          전역 메뉴를 계층 카테고리로 묶어 본다. 노드 클릭 시 해당 카테고리로 메뉴 통계 필터.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm">
          {roots.map((n) => (
            <CategoryTreeRow key={n.path} node={n} depth={0} onPick={setCategory} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

const CategoryTreeRow = ({
  node,
  depth,
  onPick,
}: {
  node: CategoryTreeNodeType;
  depth: number;
  onPick: (path: string) => void;
}) => {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = !!node.children && node.children.length > 0;
  const ratio =
    node.positiveRatio === null ? '-' : `${Math.round(node.positiveRatio * 100)}%`;
  return (
    <li>
      <div
        className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="size-4 shrink-0 text-xs text-muted-foreground"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onPick(node.path)}
          className="min-w-0 flex-1 truncate text-left hover:underline"
          title={node.path}
        >
          {node.label}
        </button>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {node.totalMentions}회
        </span>
        <span className="w-12 shrink-0 text-right text-xs tabular-nums">{ratio}</span>
      </div>
      {hasChildren && open && (
        <ul className="space-y-1">
          {node.children!.map((c) => (
            <CategoryTreeRow key={c.path} node={c} depth={depth + 1} onPick={onPick} />
          ))}
        </ul>
      )}
    </li>
  );
};

const ItemStateIcon = ({
  state,
}: {
  state: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
}) => {
  switch (state) {
    case 'pending':
      return <span className="size-3 rounded-full border border-muted-foreground/40" />;
    case 'running':
      return <Loader2 className="size-3 animate-spin text-primary" />;
    case 'done':
      return <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />;
    case 'failed':
      return <XCircle className="size-3 text-red-600 dark:text-red-400" />;
    case 'skipped':
      return <AlertTriangle className="size-3 text-amber-500" />;
  }
};
