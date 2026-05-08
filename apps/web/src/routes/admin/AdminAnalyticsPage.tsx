import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  useAnalyticsOverview,
  useCreateGroupingJob,
  useGlobalMenus,
  useGlobalMergeJob,
  useGroupingJob,
  useGroupingRestaurantsStatus,
  useStartGlobalMerge,
} from '@repo/shared';
import type { GlobalMenuQuerySortType } from '@repo/api-contract';
import type { MenuGroupingRestaurantStatusType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { cn } from '~/lib/utils';

type SortKey = 'unmapped' | 'analyzed' | 'name';

const formatDate = (iso: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const AdminAnalyticsPage = () => {
  const status = useGroupingRestaurantsStatus();
  const create = useCreateGroupingJob();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useGroupingJob(jobId);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('unmapped');

  const items = status.data?.items ?? [];
  const currentVersion = status.data?.currentVersion ?? null;

  const sortedItems = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'unmapped':
          return b.unmappedMenus - a.unmappedMenus || a.name.localeCompare(b.name);
        case 'analyzed':
          return b.analyzedReviews - a.analyzedReviews || a.name.localeCompare(b.name);
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
    return arr;
  }, [items, sortKey]);

  // 정규화 필요한 식당 = 미분류 메뉴가 있거나, 매핑이 옛 버전.
  const needsAttention = (r: MenuGroupingRestaurantStatusType): boolean =>
    r.unmappedMenus > 0 ||
    (r.storedVersion !== null && currentVersion !== null && r.storedVersion < currentVersion);

  const allSelectableIds = sortedItems.map((r) => r.placeId);
  const allSelected =
    allSelectableIds.length > 0 && allSelectableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) return new Set();
      return new Set(allSelectableIds);
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

  const startJob = async () => {
    const placeIds = [...selected];
    if (placeIds.length === 0) return;
    const snap = await create.mutateAsync(placeIds);
    setJobId(snap.jobId);
    setSelected(new Set()); // 잡 시작했으면 체크박스 초기화
  };

  const startAttention = async () => {
    const placeIds = sortedItems.filter(needsAttention).map((r) => r.placeId);
    if (placeIds.length === 0) return;
    const snap = await create.mutateAsync(placeIds);
    setJobId(snap.jobId);
  };

  const totalRestaurants = items.length;
  const cleanCount = items.filter((r) => !needsAttention(r)).length;
  const attentionCount = totalRestaurants - cleanCount;

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
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
      <GlobalMenusSection />

      {jobId && job.data && (
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
                  <li key={it.placeId} className="flex items-center gap-3 px-3 py-2">
                    <ItemStateIcon state={it.state} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {it.placeId}
                    </span>
                    {it.state === 'done' && it.groupCount !== null ? (
                      <span className="text-xs text-muted-foreground">
                        그룹 {it.groupCount} / 매핑 {it.mappedCount}
                      </span>
                    ) : null}
                    {it.errorMessage ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        {it.errorMessage}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            {(job.data.state === 'done' || job.data.state === 'failed') && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setJobId(null)}>
                  닫기
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>식당별 정규화 상태</CardTitle>
            <CardDescription>
              체크해서 선택 정규화 또는 "처리 필요한 식당 일괄 정규화" 버튼을 사용하세요.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
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
        </CardHeader>
        <CardContent>
          {status.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 식당 목록 불러오는 중…
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">등록된 식당이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="전체 선택"
                    />
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => setSortKey('name')}
                      className={cn(
                        'text-left',
                        sortKey === 'name' && 'text-foreground font-semibold',
                      )}
                    >
                      식당
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      onClick={() => setSortKey('analyzed')}
                      className={cn(
                        'text-right',
                        sortKey === 'analyzed' && 'text-foreground font-semibold',
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
                      onClick={() => setSortKey('unmapped')}
                      className={cn(
                        'text-right',
                        sortKey === 'unmapped' && 'text-foreground font-semibold',
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
                {sortedItems.map((r) => {
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
          )}
        </CardContent>
      </Card>
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
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useGlobalMergeJob(jobId);

  const o = overview.data;
  const linkedPct =
    o && o.globalLinkedRatio !== null ? Math.round(o.globalLinkedRatio * 100) : null;
  const stale =
    o && o.lastGlobalMergeAt === null && o.perRestaurantGroupCount > 0;

  const trigger = async (full: boolean) => {
    try {
      const snap = await start.mutateAsync({ full });
      setJobId(snap.jobId);
    } catch (e) {
      // 409 = 이미 진행 중 — 응답 body 에 기존 잡 스냅샷이 들어있다.
      if (e instanceof ApiError && e.statusCode === 409) {
        // ApiError 는 statusCode/error/message 만 들고 있어 body 복원이 어려움.
        // 단순화: overview 새로고침 시 사용자가 다른 화면에서 진행 중인 잡을
        // 확인하도록 안내. (drawer/dropdown 으로 inflight 잡 노출이 더 친절하지만
        // 이번 단계는 단순화.)
        // eslint-disable-next-line no-alert
        alert('이미 진행 중인 글로벌 머지 잡이 있습니다. 잠시 후 다시 시도하세요.');
        return;
      }
      throw e;
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
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
        {jobId && job.data && (
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
                <Button variant="ghost" size="sm" onClick={() => setJobId(null)}>
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
  };
  const [sort, setSort] = useState<GlobalMenuQuerySortType>('mentions');
  const [minMentions, setMinMentions] = useState(5);
  const [includeUnlinked, setIncludeUnlinked] = useState(false);

  const menus = useGlobalMenus({ q, sort, minMentions, limit: 50, includeUnlinked });

  return (
    <Card>
      <CardHeader>
        <CardTitle>전역 메뉴 통계</CardTitle>
        <CardDescription>
          식당 가로지르기 — 같은 메뉴를 모든 식당에서 합쳐 본다. 검색/필터 가능.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="메뉴 검색 (예: 김치찌개)"
            className="flex-1 min-w-[200px] rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as GlobalMenuQuerySortType)}
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
            onChange={(e) => setMinMentions(Number(e.target.value))}
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
              onChange={(e) => setIncludeUnlinked(e.target.checked)}
            />
            미머지 포함
          </label>
        </div>

        {menus.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 불러오는 중…
          </div>
        ) : !menus.data || menus.data.items.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">결과가 없습니다.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>메뉴</TableHead>
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
        )}
      </CardContent>
    </Card>
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
