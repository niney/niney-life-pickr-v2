import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Beaker,
  CheckCircle2,
  ChevronRight,
  Link as LinkIcon,
  Loader2,
  Play,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  useCancelCrawl,
  useCrawlJobs,
  useCrawlJobStream,
  useRestaurantByPlaceId,
  useRestaurantSummaryEvents,
  useStartCrawl,
} from '@repo/shared';
import type {
  BlogReviewType,
  CrawlJobType,
  CrawlModeType,
  CrawlNaverPlaceResultType,
  CrawlStageType,
  MenuItemType,
  NaverPlaceDataType,
  RestaurantSummaryProgressType,
  ReviewStatsType,
  VisitorReviewType,
  VisitorReviewWithSummaryType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

const STAGE_ORDER: CrawlStageType[] = [
  'queued',
  'normalizing',
  'launching',
  'loading_main',
  'parsing_main',
  'loading_visitor',
  'paginating_visitor',
  'finalizing',
  'done',
];

const STAGE_LABEL: Record<CrawlStageType, string> = {
  queued: '대기',
  normalizing: 'URL 정규화',
  launching: '브라우저 준비',
  loading_main: '메인 페이지 로드',
  parsing_main: '데이터 파싱',
  loading_visitor: '방문자 페이지 로드',
  paginating_visitor: '리뷰 페이지네이션',
  finalizing: '마무리',
  done: '완료',
};

const formatField = (v: string | number | null): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toString();
  return v.length ? v : '—';
};

const FieldRow = ({ label, value }: { label: string; value: string | number | null }) => (
  <div className="grid grid-cols-[8rem_1fr] gap-3 py-2 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="break-all">{formatField(value)}</span>
  </div>
);

const MenuList = ({ menus }: { menus: MenuItemType[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>메뉴 ({menus.length})</CardTitle>
    </CardHeader>
    <CardContent>
      {menus.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          메뉴 정보 없음
        </div>
      ) : (
        <ul className="divide-y">
          {menus.map((m, i) => (
            <li key={`${m.name}-${i}`} className="flex items-start gap-3 py-3">
              {m.imageUrls[0] ? (
                <img
                  src={m.imageUrls[0]}
                  alt=""
                  className="size-16 shrink-0 rounded object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="size-16 shrink-0 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{m.name}</span>
                  {m.recommend && <Badge variant="secondary" className="shrink-0">추천</Badge>}
                </div>
                {m.price && <div className="text-sm text-muted-foreground">{m.price}</div>}
                {m.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

const ReviewStatsCard = ({ stats }: { stats: ReviewStatsType }) => (
  <Card>
    <CardHeader>
      <CardTitle>리뷰 통계</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">평균 평점</div>
          <div className="text-lg font-semibold">{stats.averageRating ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">총 리뷰</div>
          <div className="text-lg font-semibold">{stats.totalCount ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">이미지 리뷰</div>
          <div className="text-lg font-semibold">{stats.imageReviewCount ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">작성자 수</div>
          <div className="text-lg font-semibold">{stats.authorCount ?? '—'}</div>
        </div>
      </div>
      {stats.themeKeywords.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">테마 키워드</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.themeKeywords.map((t) => (
              <Badge key={t.code} variant="secondary">
                {t.label} {t.count}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

const BlogReviewList = ({ reviews }: { reviews: BlogReviewType[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>블로그 리뷰 ({reviews.length})</CardTitle>
    </CardHeader>
    <CardContent>
      {reviews.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          리뷰 없음
        </div>
      ) : (
        <ul className="divide-y">
          {reviews.map((r) => (
            <li key={r.url} className="flex items-start gap-3 py-3">
              {r.thumbnailUrls[0] ? (
                <img
                  src={r.thumbnailUrls[0]}
                  alt=""
                  className="size-16 shrink-0 rounded object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="size-16 shrink-0 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{r.type}</Badge>
                  {r.authorName && <span>{r.authorName}</span>}
                  {r.date && <span>· {r.date}</span>}
                </div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-0.5 line-clamp-1 text-sm font-medium hover:underline"
                >
                  {r.title}
                </a>
                {r.excerpt && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.excerpt}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

const VisitorReviewList = ({
  reviews,
  liveCount,
  isStreaming,
}: {
  reviews: VisitorReviewType[];
  liveCount: number;
  isStreaming: boolean;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>
        방문자 리뷰{' '}
        <span className="text-muted-foreground">
          ({reviews.length}
          {isStreaming && liveCount > reviews.length ? ` · 진행 중 ${liveCount}` : ''})
        </span>
      </CardTitle>
    </CardHeader>
    <CardContent>
      {reviews.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          {isStreaming
            ? `방문자 리뷰 수집 중… ${liveCount > 0 ? `${liveCount}개 받음` : ''}`
            : '방문자 리뷰 없음'}
        </div>
      ) : (
        <ul className="divide-y">
          {reviews.map((r, i) => (
            <li key={i} className="py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {r.authorName && <span className="font-medium">{r.authorName}</span>}
                {r.rating !== null && <Badge variant="secondary">★ {r.rating}</Badge>}
                {r.visitedAt && <span>· {r.visitedAt}</span>}
              </div>
              <p className="mt-1 line-clamp-3 text-sm">{r.body}</p>
              {r.imageUrls.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {r.imageUrls.slice(0, 4).map((u) => (
                    <img
                      key={u}
                      src={u}
                      alt=""
                      className="size-12 rounded object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

const ParsedDataCard = ({ data }: { data: NaverPlaceDataType }) => (
  <Card>
    <CardHeader>
      <CardTitle>파싱된 데이터</CardTitle>
      <CardDescription>placeId: {data.placeId}</CardDescription>
    </CardHeader>
    <CardContent className="divide-y">
      <FieldRow label="이름" value={data.name} />
      <FieldRow label="카테고리" value={data.category} />
      <FieldRow label="주소" value={data.address} />
      <FieldRow label="도로명주소" value={data.roadAddress} />
      <FieldRow label="전화" value={data.phone} />
      <FieldRow label="영업시간" value={data.businessHours} />
      <FieldRow label="위도" value={data.latitude} />
      <FieldRow label="경도" value={data.longitude} />
      <FieldRow label="평점" value={data.rating} />
      <FieldRow label="리뷰 수" value={data.reviewCount} />
      <div className="grid grid-cols-[8rem_1fr] gap-3 py-2 text-sm">
        <span className="text-muted-foreground">이미지 ({data.imageUrls.length})</span>
        <div className="flex flex-wrap gap-2">
          {data.imageUrls.length === 0
            ? '—'
            : data.imageUrls.slice(0, 6).map((u) => (
                <img
                  key={u}
                  src={u}
                  alt=""
                  className="h-16 w-16 rounded object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ))}
        </div>
      </div>
    </CardContent>
  </Card>
);

const StageStepper = ({
  stage,
  isRunning,
}: {
  stage: CrawlStageType | null;
  isRunning: boolean;
}) => {
  const currentIdx = stage ? STAGE_ORDER.indexOf(stage) : -1;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">진행 단계</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-wrap items-center gap-1.5">
          {STAGE_ORDER.map((s, i) => {
            const isPast = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <li key={s} className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                    isCurrent && isRunning
                      ? 'bg-primary text-primary-foreground'
                      : isPast || (isCurrent && !isRunning)
                        ? 'bg-muted text-foreground'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCurrent && isRunning && <Loader2 className="size-3 animate-spin" />}
                  {isPast && <CheckCircle2 className="size-3" />}
                  {STAGE_LABEL[s]}
                </span>
                {i < STAGE_ORDER.length - 1 && (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
};

const JobListPanel = ({
  jobs,
  activeJobId,
  onSelect,
}: {
  jobs: CrawlJobType[];
  activeJobId: string | null;
  onSelect: (jobId: string) => void;
}) => {
  if (jobs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">최근 작업</CardTitle>
        <CardDescription>최근 5분간 진행/완료된 작업</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {jobs.map((j) => {
            const Icon =
              j.status === 'running'
                ? Loader2
                : j.status === 'done'
                  ? CheckCircle2
                  : XCircle;
            return (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => onSelect(j.id)}
                  className={`flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-muted/50 ${
                    activeJobId === j.id ? 'bg-muted/50' : ''
                  }`}
                >
                  <Icon
                    className={`size-4 shrink-0 ${
                      j.status === 'running' ? 'animate-spin text-primary' : ''
                    } ${j.status === 'failed' || j.status === 'cancelled' ? 'text-destructive' : ''}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs">{j.url}</div>
                    <div className="text-xs text-muted-foreground">
                      {STAGE_LABEL[j.stage]} · {new Date(j.startedAt).toLocaleTimeString('ko-KR')}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {j.status}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

const MODE_OPTIONS: { value: CrawlModeType; label: string; hint: string }[] = [
  { value: 'create', label: '신규', hint: '캐시 활용, 처음 수집' },
  { value: 'recrawl', label: '재크롤링', hint: '리뷰 전부 재수집/재요약' },
  { value: 'update', label: '업데이트', hint: '새 리뷰만 추가' },
];

const SummaryProgressCard = ({
  status,
}: {
  status: RestaurantSummaryProgressType;
}) => {
  const inFlight = status.pending + status.running;
  const total = inFlight + status.done + status.failed;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> AI 요약 진행률
        </CardTitle>
        <CardDescription>
          저장된 리뷰 {status.totalReviews}개 · 요약 {status.done}/{total} 완료
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">대기 {status.pending}</Badge>
          <Badge variant="secondary">진행 {status.running}</Badge>
          <Badge variant="secondary">완료 {status.done}</Badge>
          {status.failed > 0 && <Badge variant="destructive">실패 {status.failed}</Badge>}
        </div>
        {status.recentDone.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {status.recentDone.map((s) => (
              <li key={s.reviewId} className="rounded border bg-muted/40 p-2">
                <div className="line-clamp-3 leading-relaxed">{s.text}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

const ReviewSummaryList = ({
  reviews,
}: {
  reviews: VisitorReviewWithSummaryType[];
}) => (
  <Card>
    <CardHeader>
      <CardTitle>저장된 리뷰 + 요약 ({reviews.length})</CardTitle>
      <CardDescription>DB에 저장된 리뷰. 요약은 비동기로 채워집니다.</CardDescription>
    </CardHeader>
    <CardContent>
      {reviews.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          저장된 리뷰가 없습니다
        </div>
      ) : (
        <ul className="divide-y">
          {reviews.slice(0, 50).map((r) => (
            <li key={r.id} className="space-y-1.5 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {r.authorName && <span className="font-medium">{r.authorName}</span>}
                {r.rating !== null && <Badge variant="secondary">★ {r.rating}</Badge>}
                {r.visitedAt && <span>· {r.visitedAt}</span>}
              </div>
              <p className="line-clamp-3 text-sm">{r.body}</p>
              <div className="rounded border-l-2 border-primary/40 bg-muted/40 p-2 text-xs">
                {!r.summary && <span className="text-muted-foreground">요약 없음</span>}
                {r.summary?.status === 'pending' && (
                  <span className="text-muted-foreground">요약 대기 중…</span>
                )}
                {r.summary?.status === 'running' && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> 요약 중…
                  </span>
                )}
                {r.summary?.status === 'done' && (
                  <span>{r.summary.text}</span>
                )}
                {r.summary?.status === 'failed' && (
                  <span className="text-destructive">
                    실패: {r.summary.errorMessage ?? r.summary.errorCode ?? 'unknown'}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

const renderResultBlock = (result: CrawlNaverPlaceResultType) => {
  if (!result.ok) {
    return (
      <Card className="mb-6 border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" />
            크롤링 실패
          </CardTitle>
          <CardDescription className="space-y-1">
            <div>
              <Badge variant="outline" className="mr-2">
                {result.error}
              </Badge>
              {result.message}
            </div>
            {result.triedUrl && (
              <div className="break-all text-xs">tried: {result.triedUrl}</div>
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <Badge variant="secondary">{result.durationMs} ms</Badge>
      <span>fetched: {new Date(result.fetchedAt).toLocaleString('ko-KR')}</span>
      <span className="break-all">final: {result.data.rawSourceUrl}</span>
    </div>
  );
};

export const AdminCrawlTestPage = () => {
  const { jobId } = useParams<{ jobId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<CrawlModeType>('create');
  const startMutation = useStartCrawl();
  const cancelMutation = useCancelCrawl();
  const jobsQuery = useCrawlJobs();
  const stream = useCrawlJobStream(jobId ?? null);

  // Pull the placeId out of the stream as soon as it arrives (partial event)
  // so we can start polling summary status while the crawl is still going.
  const placeId =
    (stream.result?.ok ? stream.result.data.placeId : null) ??
    stream.partial?.placeId ??
    null;
  const restaurantQuery = useRestaurantByPlaceId(placeId);
  const summaryStatusQuery = useRestaurantSummaryEvents(placeId);

  // The jobs list is fetched once on mount and re-fetched only on meaningful
  // transitions: start/cancel mutations (handled inside the mutation hooks),
  // and when the active job finishes. We deliberately do NOT poll — the
  // whole point of SSE was to avoid that. The sidebar may briefly lag for
  // *other* jobs' stage changes; that's acceptable for an admin tool.
  useEffect(() => {
    if (stream.result !== null) {
      qc.invalidateQueries({ queryKey: ['crawl', 'jobs'] });
      if (placeId) {
        qc.invalidateQueries({ queryKey: ['restaurant', placeId] });
      }
    }
  }, [stream.result, placeId, qc]);

  // Each new visitor_batch means new rows in the DB — refresh the
  // restaurant detail so the freshly-saved reviews show up below.
  useEffect(() => {
    if (stream.persistedCount > 0 && placeId) {
      qc.invalidateQueries({ queryKey: ['restaurant', placeId] });
    }
  }, [stream.persistedCount, placeId, qc]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const result = await startMutation.mutateAsync({ url: trimmed, mode });
    if (result.ok) {
      navigate(`/admin/crawl-test/${result.jobId}`);
    }
  };

  const startError = startMutation.error instanceof ApiError ? startMutation.error : null;
  const startResult = startMutation.data;
  const startInlineError = startResult && !startResult.ok ? startResult : null;

  const isRunning = stream.status === 'connecting' || stream.status === 'open';
  const result = stream.result;

  // Choose the best place data to render: final result wins, else partial.
  const placeData: NaverPlaceDataType | null =
    result && result.ok ? result.data : stream.partial;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Beaker className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">크롤링 테스트</h1>
          <p className="text-sm text-muted-foreground">
            네이버 플레이스 URL을 넣고 추출 결과를 실시간으로 확인합니다.
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>URL</CardTitle>
          <CardDescription>
            <code>https://map.naver.com/...</code> 또는 <code>https://naver.me/...</code> 형태
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="relative flex-1">
                <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  inputMode="url"
                  placeholder="https://naver.me/..."
                  className="pl-9"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={startMutation.isPending}
                />
              </div>
              <Button type="submit" disabled={!url.trim() || startMutation.isPending}>
                {startMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                크롤링 시작
              </Button>
            </div>
            <div role="radiogroup" aria-label="모드" className="flex flex-wrap gap-2">
              {MODE_OPTIONS.map((opt) => {
                const checked = mode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
                      checked
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-input hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="crawl-mode"
                      value={opt.value}
                      checked={checked}
                      onChange={() => setMode(opt.value)}
                      className="sr-only"
                      disabled={startMutation.isPending}
                    />
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </label>
                );
              })}
            </div>
          </form>
        </CardContent>
      </Card>

      {startError && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              요청 실패 ({startError.statusCode})
            </CardTitle>
            <CardDescription>{startError.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {startInlineError && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              시작 거부됨
            </CardTitle>
            <CardDescription>
              <Badge variant="outline" className="mr-2">{startInlineError.error}</Badge>
              {startInlineError.message}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {jobId ? (
            <>
              <div className="mb-6 flex items-center justify-between gap-3">
                <StageStepper stage={stream.stage} isRunning={isRunning} />
              </div>

              {isRunning && (
                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">
                    {stream.status === 'connecting' ? '연결 중…' : '진행 중'}
                  </Badge>
                  {stream.visitorCount > 0 && (
                    <span className="text-sm text-muted-foreground">
                      방문자 리뷰 {stream.visitorCount}개 수집
                    </span>
                  )}
                  {stream.persistedCount > 0 && (
                    <span className="text-sm text-muted-foreground">
                      · DB 저장 {stream.persistedCount}개
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => cancelMutation.mutate(jobId)}
                    disabled={cancelMutation.isPending}
                  >
                    취소
                  </Button>
                </div>
              )}

              {stream.transportError && (
                <Card className="mb-6 border-destructive/50">
                  <CardHeader>
                    <CardTitle className="text-destructive">연결 오류</CardTitle>
                    <CardDescription>{stream.transportError}</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {result && renderResultBlock(result)}

              {placeData && (
                <>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <ParsedDataCard data={placeData} />
                    <Card>
                      <CardHeader>
                        <CardTitle>원본 응답</CardTitle>
                        <CardDescription>NaverPlaceData JSON</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <pre className="max-h-[600px] overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                          {JSON.stringify(placeData, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="mt-6">
                    <MenuList menus={placeData.menus} />
                  </div>

                  {placeData.reviewStats && (
                    <div className="mt-6">
                      <ReviewStatsCard stats={placeData.reviewStats} />
                    </div>
                  )}

                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <BlogReviewList reviews={placeData.blogReviews} />
                    <VisitorReviewList
                      reviews={placeData.visitorReviews}
                      liveCount={stream.visitorCount}
                      isStreaming={isRunning}
                    />
                  </div>

                  {summaryStatusQuery.data && (
                    <div className="mt-6">
                      <SummaryProgressCard status={summaryStatusQuery.data} />
                    </div>
                  )}

                  {restaurantQuery.data && (
                    <div className="mt-6">
                      <ReviewSummaryList reviews={restaurantQuery.data.reviews} />
                    </div>
                  )}
                </>
              )}

              {!placeData && !isRunning && !result && (
                <Card>
                  <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    이 작업은 더이상 추적되지 않습니다 (TTL 만료 또는 서버 재시작).
                  </CardContent>
                </Card>
              )}

              {!placeData && isRunning && (
                <Card>
                  <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    데이터 수집 중…
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                URL을 입력하고 시작 버튼을 눌러주세요.
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <JobListPanel
            jobs={jobsQuery.data?.jobs ?? []}
            activeJobId={jobId ?? null}
            onSelect={(id) => navigate(`/admin/crawl-test/${id}`)}
          />
        </aside>
      </div>
    </div>
  );
};
