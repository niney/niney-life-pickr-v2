import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  Save,
  Search,
  Star,
  Utensils,
  X,
  XCircle,
} from 'lucide-react';
import {
  useActiveDiningcodeBulkSaveJobStore,
  useCancelDiningcodeBulkSave,
  useDiningcodeBulkSaveJob,
  useDiningcodeRegistered,
  useDiningcodeSearch,
  useMapProviderSecret,
  useStartDiningcodeBulkSave,
} from '@repo/shared';
import type {
  DiningcodeBulkSaveJobItemType,
  DiningcodeRegisteredEntryType,
  DiningcodeSearchResultType,
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
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
} from '~/components/restaurant/MapCanvas';

// 다이닝코드 정식 크롤링 페이지. 테스트 페이지(/admin/diningcode-test)와 검색·
// 상세는 동일하지만 운영 흐름에 맞춰 카드 다중 선택 + SSE 일괄 저장을 더했다.
// 테스트 페이지에 있던 원본 JSON 패널/vRid 노출/source 메타 배지 등 검증용
// 요소는 제거.

const ORDER_OPTIONS: Array<{
  value: 'r_score' | 'score' | 'review' | 'distance';
  label: string;
}> = [
  { value: 'r_score', label: '추천 (기본)' },
  { value: 'score', label: '다이닝코드 점수' },
  { value: 'review', label: '리뷰 많은 순' },
  { value: 'distance', label: '거리순 (좌표 필요)' },
];

const formatScore = (score: number | null): string => {
  if (score === null || score === 0) return '—';
  return score.toFixed(1);
};

const Stars = ({ score }: { score: number | null }) => {
  if (score === null || score === 0) {
    return <span className="text-xs text-muted-foreground">평점 없음</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium">{formatScore(score)}</span>
    </span>
  );
};

interface ResultCardProps {
  item: DiningcodeSearchResultType;
  registered: DiningcodeRegisteredEntryType | null;
  selected: boolean;
  onToggle: () => void;
  jobItem: DiningcodeBulkSaveJobItemType | null;
}

const ItemStateBadge = ({
  jobItem,
}: {
  jobItem: DiningcodeBulkSaveJobItemType;
}) => {
  if (jobItem.state === 'running') {
    return (
      <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
        <Loader2 className="size-3 animate-spin" />
        저장 중
      </Badge>
    );
  }
  if (jobItem.state === 'done') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-400/40 text-emerald-700"
      >
        <CheckCircle2 className="size-3" />
        저장 완료
      </Badge>
    );
  }
  if (jobItem.state === 'failed') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-destructive/40 text-destructive"
        title={jobItem.errorMessage ?? undefined}
      >
        <XCircle className="size-3" />
        실패
      </Badge>
    );
  }
  if (jobItem.state === 'skipped') {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        건너뜀
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      대기
    </Badge>
  );
};

const ResultCard = ({
  item,
  registered,
  selected,
  onToggle,
  jobItem,
}: ResultCardProps) => {
  const isRegistered = !!registered;
  // 등록 가게도 다이닝코드 상세 페이지로 link — 상세 페이지가 source-of-truth
  // (다이닝코드 자체 응답) 라 등록 후 어떤 데이터가 들어갔는지 확인 가능.
  // 어드민 맛집 페이지(canonical 단위) 로의 점프는 별도 메뉴에서.
  const detailHref = `/admin/diningcode/${item.vRid}`;
  // 잡 item 이 있고 진행 중/완료/실패면 체크박스는 잠금 (작업 끝까지 결과 유지).
  const checkboxDisabled = isRegistered || (jobItem !== null && jobItem.state !== 'pending');
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="flex flex-col items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            disabled={checkboxDisabled}
            onChange={onToggle}
            aria-label={isRegistered ? '이미 등록됨' : '저장 대상으로 선택'}
            className="size-4 shrink-0"
          />
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
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold leading-tight">
                {item.name}
                {item.branch && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {item.branch}
                  </span>
                )}
              </h3>
            </div>
            <a
              href={item.rawSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="다이닝코드에서 열기"
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
            {item.areas.length > 0 && (
              <span className="truncate">{item.areas.join(' · ')}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Stars score={item.userScore} />
            {item.reviewCount > 0 && (
              <span>리뷰 {item.reviewCount.toLocaleString()}</span>
            )}
            {item.score !== null && (
              <Badge variant="outline" className="font-normal">
                다이닝코드 {item.score}
              </Badge>
            )}
            {item.openStatus && (
              <Badge
                variant="outline"
                className={`font-normal ${
                  item.openStatus.includes('영업 중')
                    ? 'border-emerald-400/40 text-emerald-700'
                    : ''
                }`}
              >
                {item.openStatus}
              </Badge>
            )}
            {item.distance && (
              <Badge variant="outline" className="font-normal">
                {item.distance}
              </Badge>
            )}
          </div>
          {(item.address || item.roadAddress) && (
            <div className="truncate text-xs text-muted-foreground">
              {item.roadAddress ?? item.address}
            </div>
          )}
          {item.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.keywords.slice(0, 6).map((k, i) => (
                <Badge
                  key={`${k.term}-${i}`}
                  variant="outline"
                  className={`text-[10px] font-normal ${
                    k.mark ? 'border-primary/50 text-primary' : ''
                  }`}
                >
                  {k.term}
                </Badge>
              ))}
            </div>
          )}
          {item.displayReview?.review_cont && (
            <blockquote className="line-clamp-2 border-l-2 border-muted pl-2 text-xs italic text-muted-foreground">
              {item.displayReview.review_cont}
            </blockquote>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {isRegistered && (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-400/40 text-emerald-700"
                >
                  <CheckCircle2 className="size-3" />
                  등록됨
                </Badge>
              )}
              {jobItem && <ItemStateBadge jobItem={jobItem} />}
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1 px-2 text-xs"
            >
              <Link to={detailHref}>
                <Eye className="size-3.5" />
                {isRegistered ? '등록된 가게 보기' : '상세 보기'}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

const Pager = ({
  hasMore,
  hasPrev,
  loading,
  onNext,
  onPrev,
  onReset,
}: {
  hasMore: boolean;
  hasPrev: boolean;
  loading: boolean;
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
}) => {
  if (!hasMore && !hasPrev) return null;
  return (
    <div className="flex justify-center gap-2 pt-2">
      {hasPrev && (
        <Button variant="outline" size="sm" onClick={onReset} disabled={loading}>
          처음으로
        </Button>
      )}
      {hasPrev && (
        <Button variant="outline" size="sm" onClick={onPrev} disabled={loading}>
          <ChevronLeft className="mr-1 size-4" />
          이전
        </Button>
      )}
      {hasMore && (
        <Button variant="outline" size="sm" onClick={onNext} disabled={loading}>
          다음
          <ChevronRight className="ml-1 size-4" />
        </Button>
      )}
    </div>
  );
};

const DEFAULT_SIZE = 20;
const MAX_BULK = 50;

export const AdminDiningcodePage = () => {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(0);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [order, setOrder] = useState<
    'r_score' | 'score' | 'review' | 'distance'
  >('r_score');
  const [useCoord, setUseCoord] = useState(false);
  const [latInput, setLatInput] = useState('37.4979');
  const [lngInput, setLngInput] = useState('127.0276');
  const [distanceInput, setDistanceInput] = useState('500');

  // 선택된 vRid 집합. 검색이 바뀌면 자동 초기화 (현재 페이지에 없는 항목 보존하려면
  // 별도 store 가 필요한데, 사용성상 페이지 이동 시 초기화가 직관적).
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const mapSecret = useMapProviderSecret('vworld', useCoord);
  const mapApiKey = mapSecret.data?.apiKey ?? null;
  const mapRef = useRef<MapCanvasHandle>(null);
  const syncingFromMapRef = useRef(false);

  const parsedLat = useCoord ? Number(latInput) : null;
  const parsedLng = useCoord ? Number(lngInput) : null;
  const parsedDistance = useCoord ? Number(distanceInput) : null;
  const coordValid =
    !useCoord ||
    (Number.isFinite(parsedLat) && Number.isFinite(parsedLng));

  const flyMapToInputs = () => {
    if (!useCoord || !coordValid) return;
    if (parsedLat === null || parsedLng === null) return;
    mapRef.current?.flyTo(parsedLat, parsedLng);
  };

  const search = useDiningcodeSearch({
    q: query,
    from,
    size,
    order,
    lat: useCoord && coordValid ? parsedLat : null,
    lng: useCoord && coordValid ? parsedLng : null,
    distance:
      useCoord && coordValid && Number.isFinite(parsedDistance)
        ? parsedDistance
        : null,
  });

  const data = search.data;
  const isLoading = search.isFetching;

  // 현재 페이지 vRids — registered 조회 + jobItem 매칭에 사용.
  const pageVRids = useMemo(
    () => data?.items.map((it) => it.vRid) ?? [],
    [data],
  );
  const registered = useDiningcodeRegistered(pageVRids);
  const registeredMap = useMemo(() => {
    const m = new Map<string, DiningcodeRegisteredEntryType>();
    for (const e of registered.data?.items ?? []) m.set(e.vRid, e);
    return m;
  }, [registered.data]);

  // 활성 잡 — store 가 jobId 들고 있고, hook 이 SSE 로 진행 추적.
  const activeJobId = useActiveDiningcodeBulkSaveJobStore((s) => s.jobId);
  const clearActiveJob = useActiveDiningcodeBulkSaveJobStore((s) => s.clear);
  const job = useDiningcodeBulkSaveJob(activeJobId);
  const startBulk = useStartDiningcodeBulkSave();
  const cancelBulk = useCancelDiningcodeBulkSave();

  const jobItemByVRid = useMemo(() => {
    const m = new Map<string, DiningcodeBulkSaveJobItemType>();
    if (job.data) {
      for (const it of job.data.items) m.set(it.vRid, it);
    }
    return m;
  }, [job.data]);

  // 검색/페이지/정렬/좌표 변경 시 선택 초기화. 현재 페이지에 보이지 않는 vRid 의
  // 체크 상태를 유지해도 사용자는 확인 못 함 → 혼란 방지 차원에서 매번 비움.
  useEffect(() => {
    setSelected(new Set());
  }, [query, from, size, order, useCoord]);

  // 잡 종료 후 N초 뒤 자동 정리 — 결과 배지는 유지하되, 다음 작업 시 깔끔하게.
  // 즉시 clear 하면 사용자가 결과를 확인 못 함. 사용자가 "닫기" 누르면 즉시 clear.
  const jobState = job.data?.state ?? null;
  useEffect(() => {
    if (jobState !== 'done' && jobState !== 'failed') return undefined;
    const t = setTimeout(() => clearActiveJob(), 60_000);
    return () => clearTimeout(t);
  }, [jobState, clearActiveJob]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setFrom(0);
    setQuery(trimmed);
  };

  const toggleOne = (vRid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(vRid)) next.delete(vRid);
      else next.add(vRid);
      return next;
    });
  };

  // 현재 페이지에서 선택 가능한(=미등록 + 잡에서 처리 안 됨) vRid 들.
  const selectableVRids = useMemo(
    () =>
      pageVRids.filter((v) => {
        if (registeredMap.has(v)) return false;
        const ji = jobItemByVRid.get(v);
        if (ji && ji.state !== 'pending') return false;
        return true;
      }),
    [pageVRids, registeredMap, jobItemByVRid],
  );

  const allSelectableSelected =
    selectableVRids.length > 0 &&
    selectableVRids.every((v) => selected.has(v));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectableSelected) {
        for (const v of selectableVRids) next.delete(v);
      } else {
        for (const v of selectableVRids) next.add(v);
      }
      return next;
    });
  };

  // 잡이 진행 중이면 "선택 저장" 비활성. 동시 잡은 한 번에 1개로 제한.
  const isJobRunning =
    job.data?.state === 'pending' || job.data?.state === 'running';

  const handleStartBulk = () => {
    const vRids = Array.from(selected).slice(0, MAX_BULK);
    if (vRids.length === 0) return;
    startBulk.mutate(
      { vRids },
      {
        onSuccess: () => {
          // 잡 시작했으면 선택 비움 — 결과는 잡 카드/카드 배지에서 추적.
          setSelected(new Set());
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Utensils className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            다이닝코드 크롤링
          </h1>
          <p className="text-sm text-muted-foreground">
            키워드/좌표로 가게를 찾아 DB 에 등록합니다. 다수 선택 후 일괄 저장
            가능 — 진행률은 실시간으로 표시됩니다.
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>검색 조건</CardTitle>
          <CardDescription>
            좌표를 켜면 <code>내주변</code> 모드로 전환됩니다.
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
                  placeholder="예: 강남 맛집, 성심당, 압구정 파스타"
                  className="pl-9"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                disabled={!input.trim() || isLoading || !coordValid}
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
                검색
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  정렬
                </span>
                <select
                  value={order}
                  onChange={(e) => {
                    setOrder(e.target.value as typeof order);
                    setFrom(0);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ORDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  페이지 크기
                </span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={size}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) {
                      setSize(Math.min(Math.max(Math.trunc(n), 1), 30));
                      setFrom(0);
                    }
                  }}
                />
              </label>
              <div className="flex flex-col justify-end">
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={useCoord}
                    onChange={() => {
                      setUseCoord((v) => !v);
                      setFrom(0);
                    }}
                    className="size-4"
                  />
                  <MapPin className="size-4 text-muted-foreground" />
                  <span className="font-medium">좌표 사용 (내주변)</span>
                </label>
              </div>
            </div>

            {useCoord && (
              <div className="space-y-3 rounded-md border border-dashed bg-muted/30 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      위도 (lat)
                    </span>
                    <Input
                      value={latInput}
                      onChange={(e) => {
                        if (syncingFromMapRef.current) return;
                        setLatInput(e.target.value);
                        setFrom(0);
                      }}
                      onBlur={flyMapToInputs}
                      placeholder="37.4979"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      경도 (lng)
                    </span>
                    <Input
                      value={lngInput}
                      onChange={(e) => {
                        if (syncingFromMapRef.current) return;
                        setLngInput(e.target.value);
                        setFrom(0);
                      }}
                      onBlur={flyMapToInputs}
                      placeholder="127.0276"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      반경 (m)
                    </span>
                    <Input
                      type="number"
                      min={50}
                      max={20000}
                      step={50}
                      value={distanceInput}
                      onChange={(e) => {
                        setDistanceInput(e.target.value);
                        setFrom(0);
                      }}
                    />
                  </label>
                </div>
                {!coordValid && (
                  <p className="text-xs text-destructive">
                    위도·경도를 숫자로 입력해 주세요.
                  </p>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      지도를 드래그해 검색 중심을 옮기세요. 중앙 핀이 검색 좌표
                      입니다.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={flyMapToInputs}
                      disabled={!mapApiKey || !coordValid}
                      title="입력 좌표로 지도 이동"
                    >
                      <Crosshair className="size-3.5" />
                      입력 좌표로 이동
                    </Button>
                  </div>
                  <MiniMapPicker
                    apiKey={mapApiKey}
                    keyLoading={mapSecret.isLoading}
                    lat={parsedLat}
                    lng={parsedLng}
                    radiusMeters={
                      Number.isFinite(parsedDistance) && parsedDistance !== null
                        ? parsedDistance
                        : null
                    }
                    mapRef={mapRef}
                    onCenterChange={(nextLat, nextLng) => {
                      syncingFromMapRef.current = true;
                      setLatInput(nextLat.toFixed(6));
                      setLngInput(nextLng.toFixed(6));
                      setFrom(0);
                      queueMicrotask(() => {
                        syncingFromMapRef.current = false;
                      });
                    }}
                  />
                </div>
              </div>
            )}
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

      {/* 일괄 저장 잡 카드 — 잡 활성 중에만 표시. */}
      {job.data && (
        <BulkSaveJobCard
          snapshot={job.data}
          onCancel={() => {
            if (activeJobId) cancelBulk.mutate(activeJobId);
          }}
          onClose={() => clearActiveJob()}
          canCancel={!cancelBulk.isPending}
        />
      )}

      {/* 선택 액션 바 — 검색 결과가 있을 때만. sticky top-2 로 스크롤 시에도 항상 보임. */}
      {data && data.items.length > 0 && (
        <div className="sticky top-2 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleAll}
            disabled={selectableVRids.length === 0 || isJobRunning}
            className="h-8 gap-1.5 px-2 text-xs"
          >
            <input
              type="checkbox"
              readOnly
              checked={allSelectableSelected}
              className="size-3.5"
            />
            현재 페이지 전체 선택
          </Button>
          <Badge variant="outline" className="font-normal">
            선택 {selected.size}{selected.size > MAX_BULK ? ` / 최대 ${MAX_BULK}` : ''}
          </Badge>
          {selected.size > MAX_BULK && (
            <span className="text-xs text-destructive">
              최대 {MAX_BULK}개까지 한 번에 저장 가능
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selected.size > 0 && !isJobRunning && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
                className="h-8 px-2 text-xs"
              >
                선택 해제
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleStartBulk}
              disabled={
                selected.size === 0 ||
                isJobRunning ||
                startBulk.isPending
              }
              className="h-8 gap-1.5"
            >
              {startBulk.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              선택 {Math.min(selected.size, MAX_BULK)}개 저장
            </Button>
          </div>
        </div>
      )}

      {data && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="font-normal">
            총 {data.total.toLocaleString()}건
            {data.meta.rcount !== null && data.meta.rcount !== data.total && (
              <span className="ml-1 text-muted-foreground">
                (실매칭 {data.meta.rcount.toLocaleString()})
              </span>
            )}
          </Badge>
          <Badge variant="outline" className="font-normal">
            이 페이지 {data.items.length}건
          </Badge>
          {data.meta.region && (
            <Badge variant="outline" className="font-normal">
              영역: {data.meta.region}
            </Badge>
          )}
          {data.meta.order && (
            <Badge variant="outline" className="font-normal">
              order: {data.meta.order}
            </Badge>
          )}
          {data.filteredOutCount > 0 && (
            <Badge variant="destructive" className="font-normal">
              반경 밖 {data.filteredOutCount}건 숨김
            </Badge>
          )}
        </div>
      )}
      {data && data.filteredOutCount > 0 && data.items.length === 0 && (
        <p className="mb-4 text-xs text-muted-foreground">
          이 키워드는 반경 안에 매칭이 없어 다이닝코드가 광역 결과를 돌려주었지만,
          좌표 검색 의미를 살리기 위해 반경 밖 결과는 모두 숨겼습니다. 반경을
          늘리거나 좌표 검색을 끄고 다시 시도해 보세요.
        </p>
      )}

      {data &&
        (data.meta.altQueries.length > 0 ||
          data.meta.relatedKeywords.length > 0 ||
          data.meta.relatedRegions.length > 0 ||
          data.meta.regionMainKeywords.length > 0) && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">검색 메타</CardTitle>
              <CardDescription className="text-xs">
                다이닝코드가 응답에 함께 보내는 부가 신호 — 대체 검색어/연관 키워드 등.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.meta.altQueries.length > 0 && (
                <MetaRow label="대체 검색어" items={data.meta.altQueries} />
              )}
              {data.meta.relatedKeywords.length > 0 && (
                <MetaRow label="연관 검색어" items={data.meta.relatedKeywords} />
              )}
              {data.meta.relatedRegions.length > 0 && (
                <MetaRow label="연관 지역" items={data.meta.relatedRegions} />
              )}
              {data.meta.regionMainKeywords.length > 0 && (
                <MetaRow
                  label="지역 인기 키워드"
                  items={data.meta.regionMainKeywords}
                />
              )}
            </CardContent>
          </Card>
        )}

      {data && data.items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.items.map((it) => (
            <ResultCard
              key={it.vRid}
              item={it}
              registered={registeredMap.get(it.vRid) ?? null}
              selected={selected.has(it.vRid)}
              onToggle={() => toggleOne(it.vRid)}
              jobItem={jobItemByVRid.get(it.vRid) ?? null}
            />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && !isLoading && (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            결과 없음
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="mt-6">
          <Pager
            hasMore={data.hasMore}
            hasPrev={from > 0}
            loading={isLoading}
            onNext={() => setFrom(data.from + data.size)}
            onPrev={() => setFrom(Math.max(0, data.from - data.size))}
            onReset={() => setFrom(0)}
          />
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
  snapshot: import('@repo/api-contract').DiningcodeBulkSaveJobSnapshotType;
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
  const running =
    snapshot.state === 'pending' || snapshot.state === 'running';
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
              · 현재: <code className="font-mono">{currentItem.vRid}</code>
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
              width: `${snapshot.total === 0 ? 0 : (processed / snapshot.total) * 100}%`,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

const MiniMapPicker = ({
  apiKey,
  keyLoading,
  lat,
  lng,
  radiusMeters,
  mapRef,
  onCenterChange,
}: {
  apiKey: string | null;
  keyLoading: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
  mapRef: React.RefObject<MapCanvasHandle | null>;
  onCenterChange: (lat: number, lng: number) => void;
}) => {
  const sizeClass = 'h-[260px] w-full';
  if (keyLoading) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <Loader2 className="size-4 animate-spin" /> 지도 키 확인 중…
      </Placeholder>
    );
  }
  if (!apiKey) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <MapPin className="size-4 opacity-50" />
        <div>
          지도 키가 설정되지 않았습니다.{' '}
          <Link
            to="/admin/settings/map"
            className="text-primary underline underline-offset-2"
          >
            설정 &gt; 지도
          </Link>{' '}
          에서 등록하면 지도로 좌표를 잡을 수 있어요. (지금도 좌표를 직접 입력해
          검색은 가능합니다.)
        </div>
      </Placeholder>
    );
  }
  const hasCoords = lat !== null && lng !== null;
  const marker: MapMarker | null = hasCoords
    ? { id: 'center', lat: lat!, lng: lng!, variant: 'primary' }
    : null;
  return (
    <div className={`relative ${sizeClass}`}>
      <MapCanvas
        ref={mapRef}
        apiKey={apiKey}
        markers={marker ? [marker] : []}
        initialCenter={hasCoords ? { lat: lat!, lng: lng!, zoom: 15 } : undefined}
        onViewportChangeEnd={(v) => onCenterChange(v.centerLat, v.centerLng)}
        className="size-full overflow-hidden rounded-md border bg-muted"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Crosshair className="size-5 text-primary drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" />
      </div>
      {radiusMeters !== null && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-background/85 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          반경 {radiusMeters.toLocaleString()} m
        </div>
      )}
    </div>
  );
};

const Placeholder = ({
  children,
  sizeClass,
}: {
  children: React.ReactNode;
  sizeClass: string;
}) => (
  <div
    className={`flex items-center justify-center gap-2 rounded-md border bg-muted/40 px-4 text-center text-xs text-muted-foreground ${sizeClass}`}
  >
    {children}
  </div>
);

const MetaRow = ({ label, items }: { label: string; items: string[] }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 30).map((s, i) => (
        <Badge key={`${s}-${i}`} variant="outline" className="font-normal">
          {s}
        </Badge>
      ))}
    </div>
  </div>
);
