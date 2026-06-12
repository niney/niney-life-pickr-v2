import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Database,
  ExternalLink,
  Link as LinkIcon,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  Scissors,
  Trash2,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  useActiveCrawlJobStore,
  useCancelCrawl,
  useDeleteCanonical,
  useDismissCanonicalSuggestion,
  useRestaurantList,
  useRestaurantListSummaryEvents,
  useSaveDiningcodeShop,
  useSplitCanonical,
  useStartCrawl,
  type ActiveCrawlJob,
} from '@repo/shared';
import type {
  CanonicalListItemType,
  RestaurantSourceSummaryType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Pager } from '~/components/ui/pager';
import { ActiveJobPanel } from '~/components/restaurant/ActiveJobPanel';
import { CanonicalMergePanel } from '~/components/restaurant/CanonicalMergePanel';
import { MergeProposalQueue } from '~/components/restaurant/MergeProposalQueue';
import { ReanalyzeFailedBadge } from '~/components/restaurant/ReanalyzeFailedBadge';

const NAVER_PLACE_HOSTS = ['naver.com', 'naver.me'];

const isValidNaverPlaceUrl = (raw: string): boolean => {
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return NAVER_PLACE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

const summaryInFlight = (item: CanonicalListItemType): number =>
  item.summaryPending + item.summaryRunning;

const findNaverSource = (
  item: CanonicalListItemType,
): RestaurantSourceSummaryType | null =>
  item.sources.find((s) => s.source === 'naver') ?? null;

const findDiningcodeSource = (
  item: CanonicalListItemType,
): RestaurantSourceSummaryType | null =>
  item.sources.find((s) => s.source === 'diningcode') ?? null;

// 칩 라벨 — source 식별자를 사람용으로. 새 source 추가 시 여기에만 매핑.
const SOURCE_LABELS: Record<string, string> = {
  naver: 'Naver',
  diningcode: '다이닝코드',
  catchtable: '캐치테이블',
  tabling: '테이블링',
};
const sourceLabel = (s: string): string => SOURCE_LABELS[s] ?? s;

const RestaurantRow = ({
  item,
  busy,
  deleting,
  confirmingDelete,
  dcSaving,
  mergeOpen,
  splittingRestaurantId,
  onAction,
  onDelete,
  onCancelDelete,
  onSaveDiningcode,
  onToggleMerge,
  onSplitSource,
}: {
  item: CanonicalListItemType;
  busy: boolean;
  deleting: boolean;
  confirmingDelete: boolean;
  // 진행 중인 DC 재수집 — 같은 canonical 의 DC source 한 줄에 대해서만 true.
  dcSaving: boolean;
  mergeOpen: boolean;
  // split 진행 중인 restaurantId (해당 행만 disable). 없으면 null.
  splittingRestaurantId: string | null;
  onAction: (mode: 'recrawl' | 'update') => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  onSaveDiningcode: (vRid: string) => void;
  onToggleMerge: () => void;
  onSplitSource: (restaurantId: string) => void;
}) => {
  const navigate = useNavigate();
  const inFlight = summaryInFlight(item);
  const naverSource = findNaverSource(item);
  const dcSource = findDiningcodeSource(item);
  // 행 클릭 = 상세 페이지(=Naver placeId 라우트). Naver source 가 없는 canonical
  // (= DC 만 있는 가게) 은 네비게이션 비활성. 액션 버튼들도 마찬가지로 disabled.
  const handleRowClick = () => {
    if (busy || deleting || confirmingDelete || !naverSource) return;
    navigate(`/admin/restaurants/${naverSource.placeId}`);
  };
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const clickable = !busy && !deleting && !confirmingDelete && !!naverSource;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
      className={`flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:p-4 ${
        clickable ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{item.name}</span>
          {item.primaryCategory && (
            <span className="text-xs text-muted-foreground">{item.primaryCategory}</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {/* 출처 칩 — DC 칩은 클릭 시 어드민 다이닝코드 상세로 이동 (vRid 라우트).
              sources 가 2개 이상이면 칩 옆에 작은 "분리" 액션을 노출 — 잘못 묶인
              merge 를 되돌리는 용도. */}
          {item.sources.map((s) => {
            const splitting = splittingRestaurantId === s.restaurantId;
            const chip =
              s.source === 'diningcode' ? (
                <Link
                  to={`/admin/diningcode/${s.sourceId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex"
                >
                  <Badge
                    variant="violet"
                    className="cursor-pointer hover:bg-[var(--tonal-violet-bg-hover)]"
                  >
                    {sourceLabel(s.source)}
                    <ExternalLink className="ml-1 size-3" />
                  </Badge>
                </Link>
              ) : (
                <Badge variant={s.source === 'naver' ? 'green' : 'secondary'}>
                  {sourceLabel(s.source)}
                </Badge>
              );
            return (
              <span key={s.restaurantId} className="inline-flex items-center gap-1">
                {chip}
                {item.sources.length >= 2 && (
                  <button
                    type="button"
                    onClick={stop(() => onSplitSource(s.restaurantId))}
                    disabled={splitting}
                    className="inline-flex items-center text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                    aria-label={`${sourceLabel(s.source)} 분리`}
                    title="이 출처를 새 가게로 분리"
                  >
                    {splitting ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Scissors className="size-3" />
                    )}
                  </button>
                )}
              </span>
            );
          })}
          <Badge variant="outline">리뷰 {item.totalReviews}개</Badge>
          <Badge variant="outline">요약 {item.summaryDone}/{item.totalReviews}</Badge>
          {inFlight > 0 && (
            <Badge variant="secondary" className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> {inFlight}건 진행
            </Badge>
          )}
          {/* 재분석 배지는 Naver placeId 가 있을 때만 — backend reanalyze 가
              그 키로 묶여 있음 (DC 백필은 후속 PR). */}
          {item.summaryFailed > 0 && naverSource && (
            <ReanalyzeFailedBadge
              placeId={naverSource.placeId!}
              count={item.summaryFailed}
            />
          )}
          {item.avgSatisfactionScore !== null && (
            <Badge variant="outline">😊 {item.avgSatisfactionScore.toFixed(1)}/5</Badge>
          )}
          {item.positiveCount + item.negativeCount + item.neutralCount + item.mixedCount > 0 && (
            <span className="text-[11px]">
              <span className="text-emerald-600 dark:text-emerald-400">+{item.positiveCount}</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="text-rose-600 dark:text-rose-400">-{item.negativeCount}</span>
            </span>
          )}
          <span>· 마지막: {new Date(item.lastCrawledAt).toLocaleString('ko-KR')}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {/* Naver 액션 — Naver source 가 없으면 disabled */}
        <Button
          type="button"
          variant="blue"
          size="sm"
          onClick={stop(() => onAction('update'))}
          disabled={busy || !naverSource}
        >
          <ChevronRight />
          업데이트
        </Button>
        <Button
          type="button"
          variant="amber"
          size="sm"
          onClick={stop(() => onAction('recrawl'))}
          disabled={busy || !naverSource}
        >
          <RefreshCw />
          재크롤링
        </Button>
        {/* DC source 가 있을 때만 노출. saveDiningcodeShop 은 신규 리뷰만 추가
            +AI 분석 큐잉 — 네이버 "업데이트" 와 동일한 의미라 라벨도 일치. */}
        {dcSource && (
          <Button
            type="button"
            variant="violet"
            size="sm"
            onClick={stop(() => onSaveDiningcode(dcSource.sourceId))}
            disabled={dcSaving}
            title="다이닝코드 가게의 새 리뷰를 받아오고 AI 분석을 큐잉합니다"
          >
            {dcSaving ? <Loader2 className="animate-spin" /> : <Database />}
            DC 재수집
          </Button>
        )}
        {/* 후보 수 > 0 이면 outline 으로 강조 + 카운트 표시 — 어드민이 어느 행을
            먼저 열어볼지 한눈에. 0 이면 ghost 로 시각적 무게 낮춤. */}
        <Button
          type="button"
          variant={mergeOpen ? 'secondary' : 'teal'}
          size="sm"
          onClick={stop(onToggleMerge)}
          title={
            item.candidateCount > 0
              ? `같은 가게로 추정되는 후보 ${item.candidateCount}건`
              : '다른 출처의 같은 가게를 이 행에 묶기'
          }
        >
          <Link2 />
          {mergeOpen ? '닫기' : '병합'}
          {!mergeOpen && item.candidateCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
              {item.candidateCount}
            </Badge>
          )}
        </Button>
        {confirmingDelete ? (
          <>
            <Button
              type="button"
              variant="red"
              size="sm"
              onClick={stop(onDelete)}
              disabled={deleting}
              title={
                item.sources.length > 1
                  ? `${item.sources.length}개 출처 모두 삭제됩니다`
                  : undefined
              }
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {item.sources.length > 1
                ? `정말 삭제 (${item.sources.length}개 출처)`
                : '정말 삭제'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={stop(onCancelDelete)}
              disabled={deleting}
            >
              취소
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="red"
            size="sm"
            onClick={stop(onDelete)}
            disabled={busy}
            aria-label="삭제"
            title="삭제 — 매달린 모든 출처/리뷰가 함께 삭제됩니다"
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
};

type SortKey = 'recent' | 'satisfaction' | 'positive' | 'negativeRatio';
const SORT_KEYS: SortKey[] = ['recent', 'satisfaction', 'positive', 'negativeRatio'];
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

export const AdminRestaurantsPage = () => {
  const qc = useQueryClient();

  // URL 동기화 — 새로고침/뒤로가기/링크 공유 시 페이지·정렬 보존.
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get('sort');
  const sortBy: SortKey = (SORT_KEYS as string[]).includes(sortParam ?? '')
    ? (sortParam as SortKey)
    : 'recent';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = (() => {
    const n = Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE);
    return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
  })();

  const updateParams = (patch: Record<string, string | number | null>): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      },
      { replace: true },
    );
  };

  const listQuery = useRestaurantList({
    limit: pageSize,
    offset: (page - 1) * pageSize,
    sort: sortBy,
  });
  const startMutation = useStartCrawl();
  const cancelMutation = useCancelCrawl();
  // 행 = canonical 통째로 삭제 — DC만 등록된 행도 지울 수 있게 canonicalId 기반.
  // FK Cascade 로 매달린 Restaurant·review·summary·proposal 모두 같이 사라짐.
  const deleteMutation = useDeleteCanonical();
  // DC 가게 한 건 재수집(+AI 분석 큐잉). useMutation 한 인스턴스가 모든 행의
  // 클릭을 처리 — variables 가 vRid 이므로 어떤 행이 in-flight 인지 식별.
  const saveDcMutation = useSaveDiningcodeShop();
  // canonical 분리 — 같은 mutation 으로 여러 행에 작용. variables.input.restaurantId
  // 로 in-flight 행 식별.
  const splitMutation = useSplitCanonical();
  // suggestion 행 위 알림의 "무시" 클릭. variables 가 canonicalId 라 in-flight 행 식별.
  const dismissSuggestionMutation = useDismissCanonicalSuggestion();
  // 병합 패널 — 한 번에 한 행만 열림 (canonicalId 키). 다른 행 병합 버튼을 누르면
  // 그 행으로 이동.
  const [mergeOpenCanonicalId, setMergeOpenCanonicalId] = useState<string | null>(null);

  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const jobs = useActiveCrawlJobStore((s) => s.jobs);
  const addJob = useActiveCrawlJobStore((s) => s.add);
  const removeJob = useActiveCrawlJobStore((s) => s.remove);
  const resolveJobPlaceId = useActiveCrawlJobStore((s) => s.resolvePlaceId);
  // 삭제 확인 상태 — canonical 단위 삭제로 통일. sources 가 여러 개여도 한 번에 처리.
  const [confirmDeleteCanonicalId, setConfirmDeleteCanonicalId] =
    useState<string | null>(null);

  const handleDelete = async (canonicalId: string) => {
    if (confirmDeleteCanonicalId !== canonicalId) {
      setConfirmDeleteCanonicalId(canonicalId);
      return;
    }
    setError(null);
    try {
      await deleteMutation.mutateAsync(canonicalId);
      setConfirmDeleteCanonicalId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to delete');
    }
  };

  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('URL을 입력해 주세요.');
      return;
    }
    if (!isValidNaverPlaceUrl(trimmed)) {
      setError('네이버 플레이스 URL 형식이 아닙니다 (naver.com / naver.me).');
      return;
    }
    setError(null);
    try {
      const result = await startMutation.mutateAsync({ url: trimmed, mode: 'create' });
      if (result.ok) {
        addJob({
          jobId: result.jobId,
          placeId: null,
          source: 'new',
          mode: 'create',
        });
        setUrl('');
        // 신규 가게는 lastCrawledAt 가장 최근 — recent 정렬 1페이지에서 보이도록.
        updateParams({ sort: null, page: null });
      } else {
        setError(`${result.error}: ${result.message}`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to start');
    }
  };

  const handleSplitSource = (canonicalId: string, restaurantId: string) => {
    setError(null);
    splitMutation.mutate(
      { canonicalId, input: { restaurantId } },
      {
        onError: (e) => setError(e instanceof ApiError ? e.message : '분리 실패'),
      },
    );
  };

  const handleSaveDiningcode = async (vRid: string) => {
    setError(null);
    try {
      await saveDcMutation.mutateAsync(vRid);
      // 응답이 새 리뷰 수 + AI 분석 큐 사이즈를 반환하지만, 행 카운트는 list
      // 무효화로 새로 페치하면 자동으로 반영. AI 진행은 Naver source 의 SSE
      // 와 별도 채널(dc:<vRid>) — PR2c 에서 SSE 통합 시 라이브 반영.
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'DC 재수집 실패');
    }
  };

  const handleRowAction =
    (item: CanonicalListItemType) => async (mode: 'recrawl' | 'update') => {
      const naver = findNaverSource(item);
      if (!naver) return; // 버튼이 disabled 라 이론적으로 안 옴.
      setError(null);
      try {
        const result = await startMutation.mutateAsync({ url: naver.rawSourceUrl, mode });
        if (result.ok) {
          addJob({
            jobId: result.jobId,
            placeId: naver.placeId,
            source: 'list-row',
            mode,
          });
        } else {
          setError(`${result.error}: ${result.message}`);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'failed to start');
      }
    };

  const handlePlaceIdResolved = (jobId: string, placeId: string) => {
    const existing = jobs[jobId];
    if (existing && existing.placeId !== placeId) {
      // placeId 가 알려진 순간 list 의 해당 행이 정식 앵커가 된다 — 신규 URL
      // 추가 흐름이라면 행이 없을 수 있으니 list 무효화로 새로 페치.
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.invalidateQueries({ queryKey: ['restaurant', 'public', 'list'] });
    }
    resolveJobPlaceId(jobId, placeId);
  };

  const handleFinished =
    (jobId: string) =>
    (result: { ok: boolean; error?: string; message?: string }) => {
      if (!result.ok && result.error) {
        setError(`${result.error}: ${result.message ?? ''}`);
      }
      removeJob(jobId);
    };

  // 정렬은 서버 처리. 응답이 이미 정렬·페이지 분리된 상태로 옴.
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  // SSE 구독 — 현재 페이지의 canonicalId 만. 한 canonical 의 모든 source
  // (Naver+DC) 가 한 connection 으로 풀려 들어와 진행 배지가 출처 무관 라이브 갱신.
  useRestaurantListSummaryEvents(items.map((it) => it.canonicalId));
  // 활성 잡 — placeId 가 list 의 어느 행의 Naver source 와도 매칭 안 되면
  // 상단 newJobs 로. 매칭되면 그 행 밑에 panel 마운트. 페이징 후로는 현재
  // 페이지 행만 검사 — 다른 페이지의 잡은 상단으로 떠 사라지지 않음.
  const placeIdToCanonical = new Map<string, CanonicalListItemType>();
  for (const it of items) {
    for (const s of it.sources) {
      if (s.placeId) placeIdToCanonical.set(s.placeId, it);
    }
  }
  const jobByCanonical = new Map<string, ActiveCrawlJob>();
  const newJobs: ActiveCrawlJob[] = [];
  for (const j of Object.values(jobs)) {
    if (j.placeId === null) {
      newJobs.push(j);
      continue;
    }
    const canonical = placeIdToCanonical.get(j.placeId);
    if (canonical) jobByCanonical.set(canonical.canonicalId, j);
    else newJobs.push(j);
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <UtensilsCrossed className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">맛집</h1>
          <p className="text-sm text-muted-foreground">
            네이버 플레이스 URL로 맛집을 등록하고, 등록된 가게를 재크롤링/업데이트합니다.
          </p>
        </div>
      </header>

      <div className="mb-6">
        <MergeProposalQueue />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>가게 추가</CardTitle>
          <CardDescription>
            네이버 플레이스 URL 을 붙여넣어 즉시 크롤링하거나, 다이닝코드에서 검색해
            저장합니다. 같은 가게라면 두 출처에 모두 등록한 뒤 어드민에서 한 행으로
            병합하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <div className="relative">
                <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  inputMode="url"
                  placeholder="https://naver.me/..."
                  className="pl-9"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (error) setError(null);
                  }}
                  aria-invalid={!!error || undefined}
                  disabled={startMutation.isPending}
                />
              </div>
              {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
            </div>
            <Button type="submit" disabled={!url.trim() || startMutation.isPending}>
              {startMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
              추가 + 크롤링
            </Button>
          </form>
          {/* 다이닝코드는 URL 이 아니라 검색 기반 — 별도 페이지에서 키워드 입력
              후 검증·저장. 클릭 시 새 탭으로 띄워 등록 작업을 잃지 않게 한다. */}
          <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <span>다이닝코드에서 가게 찾기 — 키워드 검색 후 "DB에 저장"</span>
            <Link
              to="/admin/diningcode-test"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              다이닝코드 페이지 열기 <ExternalLink className="size-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      {newJobs.length > 0 && (
        <div className="mb-6 space-y-3">
          {newJobs.map((j) => (
            <ActiveJobPanel
              key={j.jobId}
              jobId={j.jobId}
              placeId={j.placeId}
              onPlaceIdResolved={(placeId) => handlePlaceIdResolved(j.jobId, placeId)}
              onCancel={() => cancelMutation.mutate(j.jobId)}
              onFinished={handleFinished(j.jobId)}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>등록된 맛집 ({total})</CardTitle>
              <CardDescription>
                업데이트는 새 리뷰만 추가하고, 재크롤링은 리뷰 전체를 다시 수집·요약합니다.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              정렬
              <select
                value={sortBy}
                onChange={(e) =>
                  // 정렬 변경은 페이지를 1로 리셋 — 다른 페이지에 있던 채로
                  // 정렬을 바꾸면 결과가 어색하게 어긋남.
                  updateParams({
                    sort: e.target.value === 'recent' ? null : e.target.value,
                    page: null,
                  })
                }
                className="h-8 rounded border bg-background px-2 text-xs"
              >
                <option value="recent">최근 크롤링순</option>
                <option value="satisfaction">만족도 높은 순</option>
                <option value="positive">긍정 점수 높은 순</option>
                <option value="negativeRatio">부정 비율 낮은 순</option>
              </select>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
            </div>
          ) : listQuery.isError ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-destructive">
              <XCircle className="size-4" /> 목록을 불러올 수 없습니다.
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              아직 등록된 맛집이 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const dcSource = findDiningcodeSource(item);
                const rowJob = jobByCanonical.get(item.canonicalId) ?? null;
                const dcSaving =
                  saveDcMutation.isPending &&
                  dcSource !== null &&
                  saveDcMutation.variables === dcSource.sourceId;
                const splittingRestaurantId =
                  splitMutation.isPending &&
                  splitMutation.variables?.canonicalId === item.canonicalId
                    ? splitMutation.variables.input.restaurantId
                    : null;
                const mergeOpen = mergeOpenCanonicalId === item.canonicalId;
                const suggestion = item.suggestion;
                const dismissing =
                  dismissSuggestionMutation.isPending &&
                  dismissSuggestionMutation.variables === item.canonicalId;
                return (
                  <li key={item.canonicalId} className="space-y-3">
                    {suggestion && !mergeOpen && (
                      <div className="flex flex-col gap-2 rounded-md border border-dashed bg-amber-50 px-3 py-2 text-xs dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
                          <LinkIcon className="size-3 shrink-0 text-amber-700 dark:text-amber-400" />
                          <span className="text-muted-foreground">같은 가게일 수 있음:</span>
                          <span className="truncate font-medium">{suggestion.name}</span>
                          {suggestion.primaryCategory && (
                            <span className="text-muted-foreground">
                              · {suggestion.primaryCategory}
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            · 점수 {(suggestion.score * 100).toFixed(0)}%
                          </span>
                          {suggestion.distanceM !== null && (
                            <span className="text-muted-foreground">
                              · {suggestion.distanceM.toFixed(0)}m
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="teal"
                            onClick={() => setMergeOpenCanonicalId(item.canonicalId)}
                          >
                            <Link2 />
                            병합
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={dismissing}
                            onClick={() => dismissSuggestionMutation.mutate(item.canonicalId)}
                            title="이 알림을 영구히 닫기"
                          >
                            {dismissing ? <Loader2 className="animate-spin" /> : <XCircle />}
                            무시
                          </Button>
                        </div>
                      </div>
                    )}
                    <RestaurantRow
                      item={item}
                      busy={!!rowJob}
                      deleting={
                        deleteMutation.isPending &&
                        deleteMutation.variables === item.canonicalId
                      }
                      confirmingDelete={confirmDeleteCanonicalId === item.canonicalId}
                      dcSaving={dcSaving}
                      mergeOpen={mergeOpen}
                      splittingRestaurantId={splittingRestaurantId}
                      onAction={handleRowAction(item)}
                      onDelete={() => handleDelete(item.canonicalId)}
                      onCancelDelete={() => setConfirmDeleteCanonicalId(null)}
                      onSaveDiningcode={handleSaveDiningcode}
                      onToggleMerge={() =>
                        setMergeOpenCanonicalId(mergeOpen ? null : item.canonicalId)
                      }
                      onSplitSource={(rid) => handleSplitSource(item.canonicalId, rid)}
                    />
                    {mergeOpen && (
                      <CanonicalMergePanel
                        canonicalId={item.canonicalId}
                        onClose={() => setMergeOpenCanonicalId(null)}
                      />
                    )}
                    {rowJob && (
                      <ActiveJobPanel
                        jobId={rowJob.jobId}
                        placeId={rowJob.placeId}
                        onPlaceIdResolved={(placeId) =>
                          handlePlaceIdResolved(rowJob.jobId, placeId)
                        }
                        onCancel={() => cancelMutation.mutate(rowJob.jobId)}
                        onFinished={handleFinished(rowJob.jobId)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* 페이저 — 로딩/에러 중에는 숨김. xl 이상은 풀, 그 미만(모바일 반응형)은
              컴팩트(prev/next + n/total) 자동. */}
          {!listQuery.isLoading && !listQuery.isError && (
            <Pager
              className="mt-3"
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={(p) => updateParams({ page: p === 1 ? null : p })}
              onPageSizeChange={(s) =>
                updateParams({
                  pageSize: s === DEFAULT_PAGE_SIZE ? null : s,
                  page: null,
                })
              }
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
