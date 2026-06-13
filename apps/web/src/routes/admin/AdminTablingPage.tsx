import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  PackagePlus,
  Save,
  Search,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import {
  useActiveTablingBulkSaveJobStore,
  useCancelTablingBulkSave,
  useSaveTablingShop,
  useStartTablingBulkSave,
  useTablingBulkSaveJob,
  useTablingRegistered,
  useTablingSearch,
} from '@repo/shared';
import type {
  SaveTablingShopResultType,
  TablingBulkSaveJobItemType,
  TablingBulkSaveJobSnapshotType,
  TablingRegisteredEntryType,
  TablingSearchResultType,
  TablingSearchSortType,
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

// 테이블링 정식 크롤링 페이지. 테스트 페이지(/admin/tabling-test)와 검색은
// 동일하지만 운영 흐름에 맞춰 카드별 저장 + 자동매칭 결과 표시를 더했다.
// 저장은 카드별 단건(직렬 1건) 또는 다중 선택 후 일괄 저장(SSE 잡, 다이닝코드와
// 동일 인프라). 일괄 저장도 서버 안에서 직렬 + 리뷰 페이지 간 200ms 간격이라
// 부하는 단건과 동일한 페이스다.
//
// 검색은 search_after 커서라 이전/다음 대신 누적 + "더 보기". 누적은 더 보기
// 클릭 핸들러에서 직전 페이지를 스냅샷으로 쌓는다.

const SORT_OPTIONS: Array<{ value: TablingSearchSortType; label: string }> = [
  { value: 'RECOMMEND', label: '추천 (기본)' },
  { value: 'RATING', label: '평점순' },
];

const PAGE_SIZE = 20;

// 한 잡당 최대 idx 수 (스키마 max 와 일치). 더 필요하면 잡을 나눠 실행.
const MAX_BULK = 50;

const FLAG_LABELS: Array<{
  key: keyof TablingSearchResultType['flags'];
  label: string;
}> = [
  { key: 'useReservation', label: '예약' },
  { key: 'useWaiting', label: '웨이팅' },
  { key: 'useRemoteWaiting', label: '원격 웨이팅' },
  { key: 'useTakeOut', label: '포장' },
  { key: 'useOnSiteOrder', label: '현장주문' },
];

const Stars = ({ rating }: { rating: number | null }) => {
  if (rating === null || rating === 0) {
    return <span className="text-xs text-muted-foreground">평점 없음</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium">{rating.toFixed(1)}</span>
    </span>
  );
};

const formatWon = (n: number): string => `${n.toLocaleString()}원`;

interface ResultCardProps {
  item: TablingSearchResultType;
  registered: TablingRegisteredEntryType | null;
  saveResult: SaveTablingShopResultType | null;
  saveError: string | null;
  saving: boolean;
  // 다른 카드가 저장 중(단건)이거나 일괄 잡이 돌면 단건 저장 버튼 잠금.
  anySaving: boolean;
  // 일괄 저장 선택 — selectable 면 체크박스 노출. jobItem 은 진행 중 잡의 이 가게 상태.
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (idx: number) => void;
  jobItem: TablingBulkSaveJobItemType | null;
  onSave: (idx: number) => void;
}

const JobItemBadge = ({ item }: { item: TablingBulkSaveJobItemType }) => {
  if (item.state === 'running') {
    return (
      <Badge variant="outline" className="gap-1 font-normal">
        <Loader2 className="size-3 animate-spin" /> 저장 중…
      </Badge>
    );
  }
  if (item.state === 'done') {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-400/40 text-emerald-700">
        <CheckCircle2 className="size-3" /> 저장됨 (리뷰 {item.newReviewCount ?? 0})
        {item.autoMatched && <Link2 className="size-3" />}
      </Badge>
    );
  }
  if (item.state === 'failed') {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/50 text-destructive">
        <XCircle className="size-3" /> 실패
      </Badge>
    );
  }
  if (item.state === 'skipped') {
    return (
      <Badge variant="secondary" className="font-normal">
        건너뜀
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal text-muted-foreground">
      대기 중
    </Badge>
  );
};

const ResultCard = ({
  item,
  registered,
  saveResult,
  saveError,
  saving,
  anySaving,
  selectable,
  selected,
  onToggleSelect,
  jobItem,
  onSave,
}: ResultCardProps) => {
  const isRegistered = !!registered || !!saveResult || jobItem?.state === 'done';
  const activeFlags = FLAG_LABELS.filter((f) => item.flags[f.key]);
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
        {selectable && (
          <label className="flex shrink-0 items-start pt-1" title="일괄 저장 선택">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.idx)}
              className="size-4 cursor-pointer"
            />
          </label>
        )}
        <div className="size-24 shrink-0 overflow-hidden rounded-md bg-muted sm:size-28">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              No Image
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold leading-tight">
                {item.name}
                {item.isNew && (
                  <Badge variant="outline" className="ml-1.5 border-primary/50 text-[10px] text-primary">
                    NEW
                  </Badge>
                )}
              </h3>
            </div>
            <a
              href={item.rawSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="테이블링에서 열기"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {item.category && (
              <Badge variant="secondary" className="font-normal">
                {item.category}
              </Badge>
            )}
            {item.summaryAddress && (
              <span className="truncate">{item.summaryAddress}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Stars rating={item.rating} />
            {item.reviewCount !== null && item.reviewCount > 0 && (
              <span>리뷰 {item.reviewCount.toLocaleString()}</span>
            )}
            {item.waitingCount !== null && item.waitingCount > 0 && (
              <Badge variant="outline" className="font-normal">
                웨이팅 {item.waitingCount}팀
              </Badge>
            )}
            {item.distance && (
              <Badge variant="outline" className="font-normal">
                {item.distance}
              </Badge>
            )}
          </div>
          {activeFlags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {activeFlags.map((f) => (
                <Badge
                  key={f.key}
                  variant="outline"
                  className="bg-[var(--tonal-blue-bg)] text-[10px] font-normal text-[var(--tonal-blue-fg)]"
                >
                  {f.label}
                </Badge>
              ))}
            </div>
          )}
          {item.recommendedMenus.length > 0 && (
            <div className="truncate text-xs text-muted-foreground">
              {item.recommendedMenus
                .slice(0, 3)
                .map((m) => (m.price !== null ? `${m.name} ${formatWon(m.price)}` : m.name))
                .join(' · ')}
            </div>
          )}
          {item.excerpt && (
            <blockquote className="line-clamp-2 border-l-2 border-muted pl-2 text-xs italic text-muted-foreground">
              {item.excerpt}
            </blockquote>
          )}
          {/* 저장 결과 — 자동매칭이 머지 테스트의 핵심 신호라 카드에 바로 노출. */}
          {saveResult && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {saveResult.autoMatched ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-400/40 text-emerald-700"
                >
                  <Link2 className="size-3" />
                  기존 가게에 자동 병합됨
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-400/50 text-amber-700">
                  <AlertCircle className="size-3" />
                  자동매칭 안 됨 —{' '}
                  <Link to="/admin/restaurants" className="underline underline-offset-2">
                    맛집 페이지 제안 큐
                  </Link>{' '}
                  확인
                </Badge>
              )}
              <span className="text-muted-foreground">
                리뷰 {saveResult.newReviewCount}건 수집
              </span>
            </div>
          )}
          {saveError && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <XCircle className="size-3" />
              저장 실패: {saveError}
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {isRegistered && !jobItem && (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-400/40 text-emerald-700"
                >
                  <CheckCircle2 className="size-3" />
                  등록됨
                </Badge>
              )}
              {jobItem && jobItem.state !== 'pending' && <JobItemBadge item={jobItem} />}
            </div>
            {!isRegistered && !jobItem && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1 px-2 text-xs"
                disabled={anySaving}
                onClick={() => onSave(item.idx)}
                title="DB 저장 + 리뷰 수집 + 좌표 자동매칭"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {saving ? '저장 중 (리뷰 수집)' : '저장'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export const AdminTablingPage = () => {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TablingSearchSortType>('RECOMMEND');
  // 커서 누적 — prevItems 는 "더 보기" 시점에 직전 페이지를 쌓은 스냅샷.
  const [prevItems, setPrevItems] = useState<TablingSearchResultType[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const search = useTablingSearch({
    q: query,
    cursor,
    pageSize: PAGE_SIZE,
    sort,
  });
  const isLoading = search.isFetching;
  const items = useMemo(
    () => [...prevItems, ...(search.data?.items ?? [])],
    [prevItems, search.data],
  );

  const allIdxs = useMemo(() => items.map((it) => it.idx), [items]);
  const registered = useTablingRegistered(allIdxs);
  const registeredMap = useMemo(() => {
    const m = new Map<number, TablingRegisteredEntryType>();
    for (const e of registered.data?.items ?? []) m.set(e.idx, e);
    return m;
  }, [registered.data]);

  // 저장은 한 번에 1건 직렬. 결과/에러는 idx 별로 보관해 카드에 잔존 표시.
  const save = useSaveTablingShop();
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [saveResults, setSaveResults] = useState<
    Map<number, SaveTablingShopResultType>
  >(new Map());
  const [saveErrors, setSaveErrors] = useState<Map<number, string>>(new Map());

  // ── 일괄 저장 (SSE 잡) ─────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const activeJobId = useActiveTablingBulkSaveJobStore((s) => s.jobId);
  const clearActiveJob = useActiveTablingBulkSaveJobStore((s) => s.clear);
  const job = useTablingBulkSaveJob(activeJobId);
  const startBulk = useStartTablingBulkSave();
  const cancelBulk = useCancelTablingBulkSave();

  const jobItemByIdx = useMemo(() => {
    const m = new Map<number, TablingBulkSaveJobItemType>();
    for (const it of job.data?.items ?? []) m.set(it.idx, it);
    return m;
  }, [job.data]);

  const isJobRunning =
    job.data?.state === 'pending' || job.data?.state === 'running';

  // 선택 가능한(=미등록 + 잡에서 처리되지 않은) idx 들.
  const selectableIdxs = useMemo(
    () =>
      items
        .map((it) => it.idx)
        .filter((idx) => {
          if (registeredMap.has(idx)) return false;
          const ji = jobItemByIdx.get(idx);
          if (ji && ji.state !== 'pending') return false;
          return true;
        }),
    [items, registeredMap, jobItemByIdx],
  );
  const selectableSet = useMemo(() => new Set(selectableIdxs), [selectableIdxs]);
  const allSelectableSelected =
    selectableIdxs.length > 0 && selectableIdxs.every((idx) => selected.has(idx));

  const toggleOne = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectableSelected) {
        for (const idx of selectableIdxs) next.delete(idx);
      } else {
        for (const idx of selectableIdxs) next.add(idx);
      }
      return next;
    });
  };

  const handleStartBulk = () => {
    const idxs = Array.from(selected).slice(0, MAX_BULK);
    if (idxs.length === 0) return;
    startBulk.mutate({ idxs }, { onSuccess: () => setSelected(new Set()) });
  };

  // 새 검색/정렬 시 선택 초기화.
  useEffect(() => {
    setSelected(new Set());
  }, [query, sort]);

  // 잡 종료 후 60초 뒤 자동 정리(결과 확인 시간). "닫기"는 즉시 clear.
  const jobState = job.data?.state ?? null;
  useEffect(() => {
    if (jobState !== 'done' && jobState !== 'failed') return undefined;
    const t = setTimeout(() => clearActiveJob(), 60_000);
    return () => clearTimeout(t);
  }, [jobState, clearActiveJob]);

  const handleSave = (idx: number) => {
    if (savingIdx !== null || isJobRunning) return;
    setSavingIdx(idx);
    setSaveErrors((prev) => {
      const next = new Map(prev);
      next.delete(idx);
      return next;
    });
    save.mutate(idx, {
      onSuccess: (result) => {
        setSaveResults((prev) => new Map(prev).set(idx, result));
      },
      onError: (err) => {
        setSaveErrors((prev) =>
          new Map(prev).set(idx, err instanceof Error ? err.message : '알 수 없는 오류'),
        );
      },
      onSettled: () => setSavingIdx(null),
    });
  };

  const resetPaging = () => {
    setPrevItems([]);
    setCursor(null);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    resetPaging();
    setQuery(trimmed);
  };

  const handleMore = () => {
    const data = search.data;
    if (!data?.nextCursor) return;
    setPrevItems((prev) => [...prev, ...data.items]);
    setCursor(data.nextCursor);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CalendarClock className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">테이블링 크롤링</h1>
          <p className="text-sm text-muted-foreground">
            키워드로 가게를 찾아 DB 에 등록합니다. 저장 시 리뷰 전체를 수집하고
            좌표 기준으로 기존 네이버/다이닝코드 가게에 자동 병합됩니다.
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>검색 조건</CardTitle>
          <CardDescription>
            이름·지역·메뉴 키워드 검색 (테이블링 입점 가게만). 결과는 추천/평점
            정렬을 지원합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="예: 강남 스시, 성수 베이커리, 런던베이글"
                  className="pl-9"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={!input.trim() || isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
                검색
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">정렬</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as TablingSearchSortType);
                    resetPaging();
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </form>
        </CardContent>
      </Card>

      {search.isError && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              검색 실패
            </CardTitle>
            <CardDescription>
              {(search.error as Error | null)?.message ?? '알 수 없는 오류'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {activeJobId && job.data && (
        <BulkSaveJobCard
          snapshot={job.data}
          canCancel={!cancelBulk.isPending}
          onCancel={() => cancelBulk.mutate(activeJobId)}
          onClose={clearActiveJob}
        />
      )}

      {search.data && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="font-normal">
            총 {search.data.total.toLocaleString()}건
          </Badge>
          <Badge variant="outline" className="font-normal">
            불러옴 {items.length}건
          </Badge>
        </div>
      )}

      {items.length > 0 && selectableIdxs.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allSelectableSelected}
              onChange={toggleAll}
              disabled={isJobRunning}
              className="size-4"
            />
            <span className="text-muted-foreground">
              미등록 전체 선택 ({selectableIdxs.length})
            </span>
          </label>
          <span className="text-muted-foreground">
            선택 {selected.size}
            {selected.size > MAX_BULK ? ` / 최대 ${MAX_BULK}` : ''}
          </span>
          {selected.size > MAX_BULK && (
            <span className="text-xs text-amber-600">
              최대 {MAX_BULK}개까지만 저장됩니다
            </span>
          )}
          <Button
            type="button"
            size="sm"
            className="ml-auto gap-1.5"
            disabled={selected.size === 0 || isJobRunning || startBulk.isPending}
            onClick={handleStartBulk}
          >
            {startBulk.isPending || isJobRunning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackagePlus className="size-4" />
            )}
            선택 {Math.min(selected.size, MAX_BULK)}개 일괄 저장
          </Button>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((it) => (
            <ResultCard
              key={it.idx}
              item={it}
              registered={registeredMap.get(it.idx) ?? null}
              saveResult={saveResults.get(it.idx) ?? null}
              saveError={saveErrors.get(it.idx) ?? null}
              saving={savingIdx === it.idx}
              anySaving={savingIdx !== null || isJobRunning}
              selectable={selectableSet.has(it.idx)}
              selected={selected.has(it.idx)}
              onToggleSelect={toggleOne}
              jobItem={jobItemByIdx.get(it.idx) ?? null}
              onSave={handleSave}
            />
          ))}
        </div>
      )}

      {search.data && items.length === 0 && !isLoading && (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            결과 없음
          </CardContent>
        </Card>
      )}

      {search.data?.nextCursor && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" size="sm" onClick={handleMore} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            더 보기
          </Button>
        </div>
      )}

      {!query && (
        <Card className="border-dashed">
          <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            검색어를 입력하고 검색을 눌러 시작하세요.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

interface BulkSaveJobCardProps {
  snapshot: TablingBulkSaveJobSnapshotType;
  onCancel: () => void;
  onClose: () => void;
  canCancel: boolean;
}

const BulkSaveJobCard = ({
  snapshot,
  onCancel,
  onClose,
  canCancel,
}: BulkSaveJobCardProps) => {
  const running = snapshot.state === 'pending' || snapshot.state === 'running';
  const currentItem = snapshot.items.find((i) => i.state === 'running') ?? null;
  const processed =
    snapshot.doneCount + snapshot.failedCount + snapshot.skippedCount;
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {running ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : snapshot.state === 'failed' ? (
              <XCircle className="size-4 text-destructive" />
            ) : (
              <CheckCircle2 className="size-4 text-emerald-600" />
            )}
            <CardTitle className="text-base">
              {running
                ? `일괄 저장 진행 중 (${processed}/${snapshot.total})`
                : snapshot.state === 'failed'
                ? '일괄 저장 실패'
                : '일괄 저장 완료'}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {running && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={!canCancel}
                className="h-7 gap-1 px-2 text-xs"
              >
                <X className="size-3.5" />
                취소
              </Button>
            )}
            {!running && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-7 gap-1 px-2 text-xs"
              >
                닫기
              </Button>
            )}
          </div>
        </div>
        <CardDescription className="text-xs">
          성공 {snapshot.doneCount} · 실패 {snapshot.failedCount}
          {snapshot.skippedCount > 0 && ` · 건너뜀 ${snapshot.skippedCount}`}
          {currentItem && (
            <span className="ml-1 text-muted-foreground">
              · 현재: <code className="font-mono">idx {currentItem.idx}</code>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`absolute inset-y-0 left-0 transition-[width] ${
              snapshot.state === 'failed' ? 'bg-destructive' : 'bg-primary'
            }`}
            style={{
              width: `${
                snapshot.total === 0 ? 0 : (processed / snapshot.total) * 100
              }%`,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};
